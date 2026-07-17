import {
  createBeamAnalysisContext,
  groupLoadsByCase,
  loadsForCombination,
  normalizeCombinations,
} from "../beams/SingleBeamInput.js";
import { createEnvelopes } from "../beams/SingleBeamEnvelopes.js";
import {
  sampleBeamResult,
  sectionRotationWarnings,
} from "../beams/SingleBeamResults.js";
import { LinearStaticSolver2D } from "../fem/LinearStaticSolver2D.js";
import { createElementLoadIndex } from "../fem/ElementLoadIndex.js";
import { createUnitResolver } from "../units/UnitSystem.js";
import { FoundationBeamFemBuilder } from "./FoundationBeamFemBuilder.js";
import { FoundationBeamModel } from "./FoundationBeamModel.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function sameIds(left, right) {
  if (left == null && right == null) return true;
  if (left == null || right == null || left.size !== right.size) return false;
  return [...left].every((id) => right.has(id));
}

function midpointActions(femModel, solution) {
  const loadIndex = createElementLoadIndex(femModel.loads ?? []);

  return femModel.elements.map((element) => {
    const sample = element.sampleInternalForces({
      displacements: solution.displacements,
      dofRegistry: solution.dofRegistry,
      loads: loadIndex.get(element),
      stations: [element.length() / 2],
    })[0] ?? {};

    return { n: sample.n ?? 0, m: sample.m ?? 0 };
  });
}

function foundationResponse(model, femModel, solution) {
  const output = createUnitResolver(FEM_UNITS, model.units);
  const nodeSamples = femModel.foundation.nodes.map((item) => {
    const displacement = solution.displacementByNode[item.nodeId]?.uy ?? 0;
    const rawReaction = item.springStiffness * (item.imposedSettlement - displacement);
    const reaction = item.active ? rawReaction : 0;

    return {
      nodeId: item.nodeId,
      station: output.length(item.station),
      displacement: output.length(displacement),
      imposedSettlement: output.length(item.imposedSettlement),
      springStiffness: output.translationalStiffness(item.springStiffness),
      reaction: output.force(reaction),
      active: item.active,
      gap: output.length(displacement - item.imposedSettlement),
    };
  });
  const nodeResponseById = new Map(
    nodeSamples.map((sample) => [sample.nodeId, sample]),
  );
  const segmentSamples = femModel.foundation.elements.map((item) => {
    const start = nodeResponseById.get(item.startNodeId);
    const end = nodeResponseById.get(item.endNodeId);
    const beamDisplacementFem = (
      (solution.displacementByNode[item.startNodeId]?.uy ?? 0) +
      (solution.displacementByNode[item.endNodeId]?.uy ?? 0)
    ) / 2;
    const rawPressureFem = item.subgradeModulus *
      (item.imposedSettlement - beamDisplacementFem);
    const pressureFem = model.foundation.contactModel === "compression-only"
      ? Math.max(0, rawPressureFem)
      : rawPressureFem;

    return {
      elementId: item.elementId,
      foundationSegmentId: item.segmentId,
      from: output.length(item.from),
      to: output.length(item.to),
      station: output.length((item.from + item.to) / 2),
      beamDisplacement: output.length(beamDisplacementFem),
      imposedSettlement: output.length(item.imposedSettlement),
      pressure: output.areaLoad(pressureFem),
      lineReaction: output.lineLoad(
        pressureFem * femModel.foundation.contactWidth,
      ),
      nodalReactionPair: [start?.reaction ?? 0, end?.reaction ?? 0],
    };
  });
  const totalReaction = nodeSamples.reduce((sum, sample) => sum + sample.reaction, 0);
  const minPressure = segmentSamples.reduce(
    (selected, sample) => !selected || sample.pressure < selected.pressure
      ? sample
      : selected,
    null,
  );
  const maxPressure = segmentSamples.reduce(
    (selected, sample) => !selected || sample.pressure > selected.pressure
      ? sample
      : selected,
    null,
  );
  const tensionTolerance = Math.max(
    1e-9,
    Math.abs(maxPressure?.pressure ?? 0) * 1e-9,
  );

  return {
    model: femModel.foundation.model,
    signConvention: "positive pressure and reaction act upward on the beam",
    contactWidth: output.length(femModel.foundation.contactWidth),
    nodes: nodeSamples,
    segments: segmentSamples,
    totalReaction,
    minPressure,
    maxPressure,
    contactAssumptionViolated:
      model.foundation.contactModel !== "compression-only" &&
      (minPressure?.pressure ?? 0) < -tensionTolerance,
    metadata: {
      pressureSampling: "element-midpoint-from-average-nodal-displacement",
      springDiscretization: "tributary-lumped",
      nodeCount: femModel.foundation.nodes.length,
      activeNodeCount: nodeSamples.filter((sample) => sample.active).length,
      inactiveNodeCount: nodeSamples.filter((sample) => !sample.active).length,
    },
  };
}

export class FoundationBeamAnalysis {
  constructor({ femBuilder = new FoundationBeamFemBuilder(), linearSolver = null } = {}) {
    this.femBuilder = femBuilder;
    this.linearSolver = linearSolver;
  }

  analyze(input = {}, { flexuralRigidityResolver = null } = {}) {
    const model = input instanceof FoundationBeamModel
      ? input
      : new FoundationBeamModel(input);
    const loadCaseGroups = groupLoadsByCase(model.loads);
    const loadCases = {};

    for (const [loadCaseId, loads] of loadCaseGroups.entries()) {
      loadCases[loadCaseId] = this.solve(model, loads, {
        loadCaseId,
        resultType: "load-case",
      }, { flexuralRigidityResolver });
    }

    const combinations = {};
    const definitions = normalizeCombinations(
      model.combinations,
      [...loadCaseGroups.keys()],
    );

    for (const combination of definitions) {
      combinations[combination.id] = {
        ...this.solve(model, loadsForCombination(model.loads, combination.factors), {
          combinationId: combination.id,
          resultType: "combination",
          factors: combination.factors,
          ...combination.metadata,
        }, { flexuralRigidityResolver }),
        factors: { ...combination.factors },
        name: combination.name,
      };
    }

    const allResults = [...Object.values(loadCases), ...Object.values(combinations)];
    const contactWarnings = allResults.some(
      (result) => result.foundation.contactAssumptionViolated,
    )
      ? ["The bilateral Winkler model developed tensile soil reactions; compression-only contact requires a nonlinear analysis and the affected result is outside this model's validity."]
      : [];
    const iterationWarnings = allResults
      .filter((result) => result.foundationIteration?.converged === false)
      .map((result) => `Foundation contact/stiffness iteration did not converge for ${result.id}.`);

    return {
      id: model.id,
      units: model.units,
      analysisModel: model.analysisModel,
      foundationModel: model.foundation.model,
      loadCases,
      combinations,
      envelopes: createEnvelopes(loadCases, combinations),
      warnings: [
        ...sectionRotationWarnings(model.sectionRotation),
        ...contactWarnings,
        ...iterationWarnings,
      ],
      assumptions: [
        model.foundation.contactModel === "compression-only"
          ? "The soil is represented by independent compression-only Winkler springs solved by an active-set iteration."
          : "The soil is represented by independent linear bilateral Winkler springs.",
        "Foundation stiffness is lumped to beam nodes by tributary element length.",
        ...(flexuralRigidityResolver
          ? ["Element flexural rigidities are updated iteratively from the supplied section secant-stiffness resolver."]
          : []),
        "Soil modulus and imposed settlements are assigned inputs; soil capacity and settlements are not calculated geotechnically.",
      ],
      metadata: {
        ...model.metadata,
        generatedBy: "FoundationBeamAnalysis",
      },
    };
  }

  solve(model, loads, context, { flexuralRigidityResolver = null } = {}) {
    const analysisContext = createBeamAnalysisContext(model, loads, context);
    const compressionOnly = model.foundation.contactModel === "compression-only";
    const settings = model.foundation.iteration;
    const linearSolver = new LinearStaticSolver2D({
      linearSolver: this.linearSolver ?? undefined,
    });
    let activeNodeIds = null;
    let elementFlexuralRigidities = null;
    let femModel = null;
    let solution = null;
    let converged = false;
    let iterations = 0;
    let maximumStiffnessChange = 0;
    let activeSetChanges = 0;

    for (let iteration = 1; iteration <= settings.maxIterations; iteration += 1) {
      iterations = iteration;
      femModel = this.femBuilder.build(model, {
        loads,
        context: {
          ...analysisContext,
          activeFoundationNodeIds:
            compressionOnly && activeNodeIds ? [...activeNodeIds] : null,
          elementFlexuralRigidities,
        },
      });
      solution = linearSolver.solve(femModel, { includeDiagnostics: false });
      let nextActiveNodeIds = activeNodeIds;

      if (compressionOnly) {
        nextActiveNodeIds = new Set();
        for (const item of femModel.foundation.nodes) {
          const displacement = solution.displacementByNode[item.nodeId]?.uy ?? 0;
          const contactClosure = item.imposedSettlement - displacement;
          if (contactClosure >= -settings.tolerance) {
            nextActiveNodeIds.add(item.nodeId);
          }
        }

        if (nextActiveNodeIds.size < 2) {
          break;
        }

        if (!sameIds(activeNodeIds, nextActiveNodeIds)) activeSetChanges += 1;
      }

      let nextRigidities = elementFlexuralRigidities;
      maximumStiffnessChange = 0;
      if (flexuralRigidityResolver) {
        const actions = midpointActions(femModel, solution);
        const current = elementFlexuralRigidities ??
          femModel.elements.map((element) => element.flexuralRigidity);
        nextRigidities = femModel.elements.map((element, index) => {
          const target = flexuralRigidityResolver({
            element,
            index,
            moment: actions[index].m,
            axialForce: actions[index].n,
            context: analysisContext,
            units: FEM_UNITS,
            grossFlexuralRigidity: femModel.sectionProperties.flexuralRigidity,
          });
          const resolvedTarget = Number.isFinite(target?.flexuralRigidity)
            ? target.flexuralRigidity
            : Number.isFinite(target)
              ? target
              : current[index];
          const next = settings.relaxationFactor * resolvedTarget +
            (1 - settings.relaxationFactor) * current[index];
          maximumStiffnessChange = Math.max(
            maximumStiffnessChange,
            Math.abs(next - current[index]) / Math.max(Math.abs(current[index]), 1e-12),
          );
          return next;
        });
      }

      const activeStable = !compressionOnly || sameIds(activeNodeIds, nextActiveNodeIds);
      const stiffnessStable = !flexuralRigidityResolver ||
        maximumStiffnessChange <= settings.tolerance;
      activeNodeIds = nextActiveNodeIds;
      elementFlexuralRigidities = nextRigidities;

      if (activeStable && stiffnessStable) {
        converged = true;
        break;
      }
    }

    if (!femModel || !solution) {
      throw new Error("Foundation beam iteration did not produce a solvable state.");
    }

    if (compressionOnly && activeNodeIds &&
        !sameIds(new Set(femModel.foundation.nodes.filter((item) => item.active).map((item) => item.nodeId)), activeNodeIds)) {
      femModel = this.femBuilder.build(model, {
        loads,
        context: {
          ...analysisContext,
          activeFoundationNodeIds: [...activeNodeIds],
          elementFlexuralRigidities,
        },
      });
      solution = linearSolver.solve(femModel, { includeDiagnostics: false });
    }

    return {
      id: context.loadCaseId ?? context.combinationId ?? model.id,
      resultType: context.resultType,
      loads: loads.map((load) => ({
        id: load.id,
        actionType: load.actionType,
        loadCaseId: load.loadCaseId,
        factor: load.factor ?? 1,
        type: load.type,
      })),
      context: {
        resultType: analysisContext.resultType,
        limitState: analysisContext.limitState ?? null,
        combinationType: analysisContext.combinationType ?? null,
        serviceCombination: analysisContext.serviceCombination ?? null,
        loadCaseFactors: { ...analysisContext.loadCaseFactors },
        activeLoads: analysisContext.activeLoads.map((load) => ({ ...load })),
        governingLoadDurationClass: analysisContext.governingLoadDurationClass,
      },
      ...sampleBeamResult({
        model,
        femModel,
        solution,
        sectionProperties: femModel.sectionProperties,
        femUnits: FEM_UNITS,
      }),
      foundation: foundationResponse(model, femModel, solution),
      foundationIteration: {
        active: compressionOnly || Boolean(flexuralRigidityResolver),
        converged: compressionOnly || flexuralRigidityResolver
          ? converged
          : true,
        iterations,
        contactModel: model.foundation.contactModel,
        activeSetChanges,
        stiffnessIteration: Boolean(flexuralRigidityResolver),
        maximumStiffnessChange,
        relaxationFactor: settings.relaxationFactor,
        tolerance: settings.tolerance,
      },
    };
  }
}
