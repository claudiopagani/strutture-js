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
import { createUnitResolver } from "../units/UnitSystem.js";
import { FoundationBeamFemBuilder } from "./FoundationBeamFemBuilder.js";
import { FoundationBeamModel } from "./FoundationBeamModel.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function foundationResponse(model, femModel, solution) {
  const output = createUnitResolver(FEM_UNITS, model.units);
  const nodeSamples = femModel.foundation.nodes.map((item) => {
    const displacement = solution.displacementByNode[item.nodeId]?.uy ?? 0;
    const reaction = item.springStiffness * (item.imposedSettlement - displacement);

    return {
      nodeId: item.nodeId,
      station: output.length(item.station),
      displacement: output.length(displacement),
      imposedSettlement: output.length(item.imposedSettlement),
      springStiffness: output.translationalStiffness(item.springStiffness),
      reaction: output.force(reaction),
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
    const pressureFem = item.subgradeModulus *
      (item.imposedSettlement - beamDisplacementFem);

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
    contactAssumptionViolated: (minPressure?.pressure ?? 0) < -tensionTolerance,
    metadata: {
      pressureSampling: "element-midpoint-from-average-nodal-displacement",
      springDiscretization: "tributary-lumped",
      nodeCount: femModel.foundation.nodes.length,
    },
  };
}

export class FoundationBeamAnalysis {
  constructor({ femBuilder = new FoundationBeamFemBuilder(), linearSolver = null } = {}) {
    this.femBuilder = femBuilder;
    this.linearSolver = linearSolver;
  }

  analyze(input = {}) {
    const model = input instanceof FoundationBeamModel
      ? input
      : new FoundationBeamModel(input);
    const loadCaseGroups = groupLoadsByCase(model.loads);
    const loadCases = {};

    for (const [loadCaseId, loads] of loadCaseGroups.entries()) {
      loadCases[loadCaseId] = this.solve(model, loads, {
        loadCaseId,
        resultType: "load-case",
      });
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
        }),
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

    return {
      id: model.id,
      units: model.units,
      analysisModel: model.analysisModel,
      foundationModel: model.foundation.model,
      loadCases,
      combinations,
      envelopes: createEnvelopes(loadCases, combinations),
      warnings: [...sectionRotationWarnings(model.sectionRotation), ...contactWarnings],
      assumptions: [
        "The soil is represented by independent linear bilateral Winkler springs.",
        "Foundation stiffness is lumped to beam nodes by tributary element length.",
        "Soil modulus and imposed settlements are assigned inputs; soil capacity and settlements are not calculated geotechnically.",
      ],
      metadata: {
        ...model.metadata,
        generatedBy: "FoundationBeamAnalysis",
      },
    };
  }

  solve(model, loads, context) {
    const analysisContext = createBeamAnalysisContext(model, loads, context);
    const femModel = this.femBuilder.build(model, { loads, context: analysisContext });
    const solution = new LinearStaticSolver2D({
      linearSolver: this.linearSolver ?? undefined,
    }).solve(femModel, { includeDiagnostics: false });

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
    };
  }
}
