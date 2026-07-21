import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { CircularSlipSurface2D } from "./CircularSlipSurface2D.js";
import { GeotechnicalDesignSituation } from "./GeotechnicalDesignSituation.js";
import { GroundAnchorStabilityAction2D } from
  "./GroundAnchorStabilityAction2D.js";
import { GroundModel } from "./GroundModel.js";
import { SlopeSliceDiscretizer2D } from "./SlopeSliceDiscretizer2D.js";
import { SlopeSurfaceSurcharge2D } from "./SlopeSurfaceSurcharge2D.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";
import {
  SLOPE_STABILITY_METHODS,
  ordinaryMethodOfSlices,
  simplifiedBishop,
} from "./slopeStabilityMethods.js";
import { spencerMethod } from "./spencerMethod.js";

export const SLOPE_STABILITY_ANALYSIS_MODES = Object.freeze([
  "assigned-surface",
  "critical-surface-search",
]);

export const CIRCULAR_SLOPE_STABILITY_RESULT_SCHEMA_VERSION =
  "circular-slope-stability-result/v1";

function calculationResult({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}) {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeGroundModel(input, units) {
  return input instanceof GroundModel
    ? input
    : new GroundModel({ ...input, units: input?.units ?? units });
}

function normalizeDesignSituation(input, groundModel, units) {
  return input instanceof GeotechnicalDesignSituation
    ? input
    : new GeotechnicalDesignSituation({
        ...input,
        groundModelId: input?.groundModelId ?? groundModel.id,
        units: input?.units ?? units,
      });
}

function normalizeSurcharges(values, units) {
  if (!Array.isArray(values)) {
    throw new Error("surfaceSurcharges must be an array.");
  }
  return values.map((load) => load instanceof SlopeSurfaceSurcharge2D
    ? load
    : new SlopeSurfaceSurcharge2D({
        ...load,
        units: load?.units ?? units,
      }));
}

function normalizeGroundAnchors(values, units) {
  if (!Array.isArray(values)) {
    throw new Error("groundAnchors must be an array.");
  }
  return values.map((value) => {
    if (value instanceof GroundAnchorStabilityAction2D) return value;
    if (value?.outputs?.couplings?.globalStability ||
      typeof value?.toJSON === "function") {
      const serialized = typeof value?.toJSON === "function"
        ? value.toJSON()
        : value;
      if (serialized?.outputs?.couplings?.globalStability) {
        return GroundAnchorStabilityAction2D.fromGroundAnchorResult(value);
      }
    }
    return new GroundAnchorStabilityAction2D({
      ...value,
      units: value?.units ?? units,
    });
  });
}

function sliceForIntersection(slices, x, movementDirection) {
  const scale = Math.max(
    1,
    ...slices.map((slice) => Math.max(Math.abs(slice.minimumX), Math.abs(slice.maximumX))),
  );
  const tolerance = 1e-9 * scale;
  const matches = slices.filter((slice) =>
    x >= slice.minimumX - tolerance && x <= slice.maximumX + tolerance);
  if (matches.length === 0) {
    throw new Error(
      `A mobilized ground-anchor intersection at x=${x} lies outside the sliding-mass slices.`,
    );
  }
  if (matches.length === 1) return matches[0];
  return [...matches].sort((left, right) =>
    movementDirection === "left-to-right"
      ? right.midpointX - left.midpointX
      : left.midpointX - right.midpointX)[0];
}

function applyGroundAnchorActions(discretization, slipSurface, groundAnchors) {
  if (groundAnchors.length === 0) return discretization;
  const interactions = groundAnchors.map((anchor) =>
    anchor.evaluateForSlipSurface(slipSurface));
  const slices = discretization.slices.map((slice) => ({
    ...slice,
    externalPointLoads: [],
  }));
  for (const interaction of interactions) {
    if (interaction.status !== "mobilized") continue;
    const target = sliceForIntersection(
      slices,
      interaction.intersection.x,
      slipSurface.movementDirection,
    );
    target.externalPointLoads.push({
      id: `ground-anchor-${interaction.anchorId}`,
      type: "ground-anchor",
      anchorId: interaction.anchorId,
      applicationPoint: { ...interaction.intersection },
      horizontalForceInMovementDirection:
        interaction.horizontalForceInMovementDirection,
      verticalDownwardForce: interaction.verticalDownwardForce,
      drivingMoment: interaction.drivingMoment,
      mobilizationRatio: interaction.mobilizationRatio,
      relation: interaction.relation,
    });
  }
  const mobilized = interactions.filter(({ status }) => status === "mobilized");
  const throughBondZone = interactions.filter(({ relation }) =>
    relation === "through-bond-zone");
  return {
    ...discretization,
    slices,
    groundAnchors: {
      suppliedCount: groundAnchors.length,
      intersectedCount: interactions.filter(({ intersection }) => intersection)
        .length,
      mobilizedCount: mobilized.length,
      throughBondZoneCount: throughBondZone.length,
      totalMobilizedForcePerUnitWidth: mobilized.reduce(
        (sum, interaction) => sum + interaction.mobilizedForcePerUnitWidth,
        0,
      ),
      interactions,
      actions: groundAnchors.map((anchor) => anchor.toJSON()),
    },
    warnings: unique([
      ...discretization.warnings,
      ...(throughBondZone.length > 0 ? [
        "Ground-anchor restraint for a surface crossing a bond zone is proportional to the bond length remaining beyond the surface, assuming uniform bond stress per FHWA GEC 4 section 5.8.3.2.",
      ] : []),
      "Mobilized ground-anchor force uses the verified design tendon force divided by horizontal spacing; structural resistance and compatibility of the head, waler and wall remain separate checks.",
    ]),
    metadata: {
      ...discretization.metadata,
      groundAnchorLoading: {
        model: "fhwa-uniform-bond-proportional",
        forceApplication: "point-load-at-anchor-slip-surface-intersection",
        forceSelection: "verified-design-tendon-force",
        reference: "FHWA-IF-99-015, section 5.8.3.2",
      },
    },
  };
}

function solveDiscretization(discretization, method, iteration) {
  const pseudostatic =
    discretization.metadata.seismicLoading.model === "pseudostatic";
  const anchored = (discretization.groundAnchors?.suppliedCount ?? 0) > 0;
  if ((pseudostatic || anchored) && method !== "spencer") {
    throw new Error(
      anchored
        ? "Slope stability with ground anchors is available with Spencer's Method only."
        : "Pseudostatic slope stability is available with Spencer's Method only.",
    );
  }
  if (pseudostatic || anchored) {
    const spencer = spencerMethod(
      discretization.slices,
      iteration.spencer ?? iteration,
    );
    return {
      selectedMethod: method,
      factorOfSafety: spencer.factorOfSafety,
      methods: { spencer },
      methodWarnings: anchored ? [
        "Simplified Bishop and the Ordinary Method of Slices are not evaluated when ground-anchor point forces are present.",
      ] : [],
    };
  }

  const ordinary = ordinaryMethodOfSlices(discretization.slices);
  const bishop = simplifiedBishop(
    discretization.slices,
    iteration.bishop ?? iteration,
  );
  let spencer;
  const methodWarnings = [];
  try {
    spencer = spencerMethod(discretization.slices, {
      initialFactorOfSafety: bishop.factorOfSafety,
      ...(iteration.spencer ?? {}),
    });
  } catch (error) {
    if (method === "spencer") throw error;
    spencer = {
      method: "spencer",
      status: "not-supported",
      warning: error.message,
    };
    methodWarnings.push(`Spencer comparison unavailable: ${error.message}`);
  }
  return {
    selectedMethod: method,
    factorOfSafety: method === "spencer"
      ? spencer.factorOfSafety
      : method === "bishop-simplified"
        ? bishop.factorOfSafety
        : ordinary.factorOfSafety,
    methods: {
      spencer,
      "bishop-simplified": bishop,
      "ordinary-method-of-slices": ordinary,
    },
    methodWarnings,
  };
}

function solveSurface({
  groundModel,
  designSituation,
  slipSurface,
  method,
  sectionId,
  porePressureFieldId,
  sliceCount,
  surfaceSurcharges,
  groundAnchors,
  iteration,
}) {
  const baseDiscretization = new SlopeSliceDiscretizer2D().discretize({
    groundModel,
    designSituation,
    slipSurface,
    sectionId,
    porePressureFieldId,
    sliceCount,
    surfaceSurcharges,
  });
  const discretization = applyGroundAnchorActions(
    baseDiscretization,
    slipSurface,
    groundAnchors,
  );
  return {
    slipSurface: slipSurface.toJSON(),
    discretization,
    solution: solveDiscretization(discretization, method, iteration),
  };
}

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return number;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function normalizeRange(range, resolver, label, isLength = true) {
  const convert = isLength ? resolver.length : (value) => value;
  const minimum = convert(finite(range?.minimum, `${label}.minimum`));
  const maximum = convert(finite(range?.maximum, `${label}.maximum`));
  const count = integer(range?.count ?? 9, `${label}.count`, 2, 51);
  if (maximum <= minimum) {
    throw new Error(`${label}.maximum must exceed ${label}.minimum.`);
  }
  return { minimum, maximum, count };
}

function valuesInRange(range) {
  return Array.from({ length: range.count }, (_, index) =>
    range.minimum + (range.maximum - range.minimum) * index /
      (range.count - 1));
}

function bounded(value, range) {
  return Math.max(range.minimum, Math.min(range.maximum, value));
}

function normalizeSearch(search, resolver, section) {
  const entryX = normalizeRange(search?.entryX, resolver, "search.entryX");
  const exitX = normalizeRange(search?.exitX, resolver, "search.exitX");
  const sagitta = normalizeRange(search?.sagitta, resolver, "search.sagitta");
  const requestedCandidates = entryX.count * exitX.count * sagitta.count;
  if (requestedCandidates > 20000) {
    throw new Error("The initial circular search is limited to 20000 grid combinations.");
  }
  const sectionSpan = section.bounds.maximumX - section.bounds.minimumX;
  const minimumSpan = search?.minimumSpan == null
    ? 0.05 * sectionSpan
    : resolver.length(finite(search.minimumSpan, "search.minimumSpan"));
  const coordinateTolerance = search?.coordinateTolerance == null
    ? Math.max(1e-5, 1e-5 * sectionSpan)
    : resolver.length(finite(
        search.coordinateTolerance,
        "search.coordinateTolerance",
      ));
  if (minimumSpan <= 0 || coordinateTolerance <= 0) {
    throw new Error("search minimumSpan and coordinateTolerance must be positive.");
  }
  return {
    entryX,
    exitX,
    sagitta,
    minimumSpan,
    coordinateTolerance,
    refinementIterations: integer(
      search?.refinementIterations ?? 8,
      "search.refinementIterations",
      0,
      30,
    ),
    retainCandidates: integer(
      search?.retainCandidates ?? 10,
      "search.retainCandidates",
      1,
      100,
    ),
    requestedCandidates,
  };
}

function reasonCounts(reasons) {
  return [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count ||
      left.reason.localeCompare(right.reason));
}

function minimumCandidateSummary(candidates) {
  if (candidates.length === 0) return null;
  const minimum = [...candidates].sort((left, right) =>
    left.factorOfSafety - right.factorOfSafety)[0];
  return {
    factorOfSafety: minimum.factorOfSafety,
    entryX: minimum.entryX,
    exitX: minimum.exitX,
    sagitta: minimum.sagitta,
    slipSurface: minimum.analysis.slipSurface,
  };
}

function searchCriticalSurface({
  groundModel,
  designSituation,
  method,
  sectionId,
  porePressureFieldId,
  sliceCount,
  surfaceSurcharges,
  groundAnchors,
  iteration,
  search,
  resolver,
  movementDirection,
}) {
  const section = groundModel.getSection(
    sectionId ?? designSituation.spatialSelection.sectionId,
  );
  const options = normalizeSearch(search, resolver, section);
  const cache = new Map();
  const invalidReasons = new Map();
  const valid = [];
  let best = null;

  const evaluate = (entryX, exitX, sagitta, phase) => {
    const key = [entryX, exitX, sagitta]
      .map((value) => value.toPrecision(14)).join(":");
    if (cache.has(key)) return cache.get(key);
    let result;
    try {
      if (exitX - entryX < options.minimumSpan) {
        throw new Error("Candidate horizontal span is smaller than minimumSpan.");
      }
      const entry = { x: entryX, z: section.surfaceElevationAt(entryX) };
      const exit = { x: exitX, z: section.surfaceElevationAt(exitX) };
      const slipSurface = CircularSlipSurface2D.fromChordAndSagitta({
        id: `search-circle-${cache.size + 1}`,
        entry,
        exit,
        sagitta,
        movementDirection,
        units: GEOTECHNICAL_INTERNAL_UNITS,
        metadata: { searchPhase: phase },
      });
      const analysis = solveSurface({
        groundModel,
        designSituation,
        slipSurface,
        method,
        sectionId,
        porePressureFieldId,
        sliceCount,
        surfaceSurcharges,
        groundAnchors,
        iteration,
      });
      result = {
        status: "ok",
        entryX,
        exitX,
        sagitta,
        factorOfSafety: analysis.solution.factorOfSafety,
        phase,
        analysis,
      };
      valid.push(result);
      if (!best || result.factorOfSafety < best.factorOfSafety) best = result;
    } catch (error) {
      invalidReasons.set(
        error.message,
        (invalidReasons.get(error.message) ?? 0) + 1,
      );
      result = { status: "rejected", entryX, exitX, sagitta, phase };
    }
    cache.set(key, result);
    return result;
  };

  for (const entryX of valuesInRange(options.entryX)) {
    for (const exitX of valuesInRange(options.exitX)) {
      for (const sagitta of valuesInRange(options.sagitta)) {
        evaluate(entryX, exitX, sagitta, "initial-grid");
      }
    }
  }
  if (!best) {
    throw new Error("Circular search found no admissible slip surface.");
  }

  let current = best;
  let steps = {
    entryX: (options.entryX.maximum - options.entryX.minimum) /
      (options.entryX.count - 1),
    exitX: (options.exitX.maximum - options.exitX.minimum) /
      (options.exitX.count - 1),
    sagitta: (options.sagitta.maximum - options.sagitta.minimum) /
      (options.sagitta.count - 1),
  };
  let completedRefinements = 0;
  for (
    let iterationIndex = 0;
    iterationIndex < options.refinementIterations;
    iterationIndex += 1
  ) {
    const anchor = current;
    let iterationBest = anchor;
    for (const entryStep of [-1, 0, 1]) {
      for (const exitStep of [-1, 0, 1]) {
        for (const sagittaStep of [-1, 0, 1]) {
          if (entryStep === 0 && exitStep === 0 && sagittaStep === 0) continue;
          const candidate = evaluate(
            bounded(anchor.entryX + entryStep * steps.entryX, options.entryX),
            bounded(anchor.exitX + exitStep * steps.exitX, options.exitX),
            bounded(anchor.sagitta + sagittaStep * steps.sagitta, options.sagitta),
            "local-refinement",
          );
          if (
            candidate.status === "ok" &&
            candidate.factorOfSafety < iterationBest.factorOfSafety
          ) {
            iterationBest = candidate;
          }
        }
      }
    }
    current = iterationBest;
    completedRefinements += 1;
    if (current === anchor) {
      steps = {
        entryX: steps.entryX / 2,
        exitX: steps.exitX / 2,
        sagitta: steps.sagitta / 2,
      };
    }
    if (Math.max(steps.entryX, steps.exitX, steps.sagitta) <=
      options.coordinateTolerance) {
      break;
    }
  }
  best = current.factorOfSafety <= best.factorOfSafety ? current : best;
  const retained = [...valid]
    .sort((left, right) => left.factorOfSafety - right.factorOfSafety)
    .slice(0, options.retainCandidates)
    .map(({ analysis, ...candidate }) => ({
      ...candidate,
      slipSurface: analysis.slipSurface,
      groundAnchorInteractions:
        analysis.discretization.groundAnchors?.interactions ?? [],
    }));

  const groundAnchorCoverage = groundAnchors.map((anchor) => {
    const relations = new Map();
    for (const candidate of valid) {
      const interaction = candidate.analysis.discretization.groundAnchors
        ?.interactions.find(({ anchorId }) => anchorId === anchor.id);
      if (!interaction) continue;
      const current = relations.get(interaction.relation) ?? {
        relation: interaction.relation,
        candidateCount: 0,
        minimumFactorOfSafety: Number.POSITIVE_INFINITY,
      };
      current.candidateCount += 1;
      current.minimumFactorOfSafety = Math.min(
        current.minimumFactorOfSafety,
        candidate.factorOfSafety,
      );
      relations.set(interaction.relation, current);
    }
    return {
      anchorId: anchor.id,
      relations: [...relations.values()].sort((left, right) =>
        left.relation.localeCompare(right.relation)),
    };
  });
  const behindEachAnchor = groundAnchors.map((anchor) => {
    const candidates = valid.filter((candidate) =>
      candidate.analysis.discretization.groundAnchors?.interactions
        .some((interaction) =>
          interaction.anchorId === anchor.id &&
          interaction.relation === "behind-bond-zone"));
    return {
      anchorId: anchor.id,
      status: candidates.length > 0 ? "ok" : "not-analyzed",
      candidateCount: candidates.length,
      minimumCandidate: minimumCandidateSummary(candidates),
    };
  });
  const externalCandidates = valid.filter((candidate) => {
    const interactions = candidate.analysis.discretization.groundAnchors
      ?.interactions ?? [];
    return groundAnchors.length > 0 && groundAnchors.every((anchor) =>
      interactions.some((interaction) =>
        interaction.anchorId === anchor.id &&
        interaction.relation === "behind-bond-zone"));
  });
  const groundAnchorVerificationFamilies = groundAnchors.length === 0
    ? null
    : {
        status: behindEachAnchor.every(({ status }) => status === "ok") &&
          externalCandidates.length > 0
          ? "ok"
          : "not-analyzed",
        behindEachAnchor,
        externalWholeSystem: {
          status: externalCandidates.length > 0 ? "ok" : "not-analyzed",
          candidateCount: externalCandidates.length,
          minimumCandidate: minimumCandidateSummary(externalCandidates),
        },
        requirement:
          "Review an independent search domain behind each anchor level and a domain behind the complete anchored system; search geometry remains an explicit design input.",
      };

  return {
    best: best.analysis,
    search: {
      model: "entry-exit-sagitta-grid-with-local-refinement",
      ranges: options,
      evaluatedCandidateCount: cache.size,
      validCandidateCount: valid.length,
      rejectedCandidateCount: cache.size - valid.length,
      completedRefinementIterations: completedRefinements,
      finalStep: steps,
      retainedCandidates: retained,
      rejectionReasons: reasonCounts(invalidReasons),
      groundAnchorCoverage,
      groundAnchorVerificationFamilies,
    },
  };
}

export class CircularSlopeStabilityAnalysis {
  analyze({
    groundModel: groundModelInput,
    designSituation: designSituationInput,
    mode = null,
    slipSurface: slipSurfaceInput = null,
    search = null,
    movementDirection = "left-to-right",
    method = null,
    sectionId = null,
    porePressureFieldId = null,
    sliceCount = 30,
    surfaceSurcharges = [],
    groundAnchors = [],
    iteration = {},
    units = null,
  } = {}) {
    try {
      assertExplicitUnitSystem(units, "CircularSlopeStabilityAnalysis");
      const selectedMode = mode ?? (slipSurfaceInput
        ? "assigned-surface"
        : "critical-surface-search");
      if (!SLOPE_STABILITY_ANALYSIS_MODES.includes(selectedMode)) {
        throw new Error(`Unsupported slope-stability analysis mode: ${selectedMode}.`);
      }
      if (
        (selectedMode === "assigned-surface" && !slipSurfaceInput) ||
        (selectedMode === "critical-surface-search" && !search)
      ) {
        throw new Error(`${selectedMode} requires its corresponding geometry input.`);
      }
      const groundModel = normalizeGroundModel(groundModelInput, units);
      const designSituation = normalizeDesignSituation(
        designSituationInput,
        groundModel,
        units,
      );
      designSituation.validateAgainst(groundModel);
      const pseudostatic = designSituation.seismic.model === "pseudostatic";
      const normalizedGroundAnchors = normalizeGroundAnchors(
        groundAnchors,
        units,
      );
      const invalidGroundAnchors = normalizedGroundAnchors.filter((anchor) =>
        anchor.sourceVerificationStatus !== "ok");
      if (invalidGroundAnchors.length > 0) {
        return calculationResult({
          status: "not-verified",
          summary:
            "Ground-anchor restraint cannot be credited because one or more source designs are not verified.",
          warnings: invalidGroundAnchors.map((anchor) =>
            `Ground anchor ${anchor.id} has source status ${anchor.sourceVerificationStatus}.`),
          metadata: { mode: selectedMode },
        });
      }
      const anchored = normalizedGroundAnchors.length > 0;
      const selectedMethod = method ?? (pseudostatic || anchored
        ? "spencer"
        : "bishop-simplified");
      if (!SLOPE_STABILITY_METHODS.includes(selectedMethod)) {
        throw new Error(`Unsupported slope-stability method: ${selectedMethod}.`);
      }
      if (pseudostatic && selectedMethod !== "spencer") {
        return calculationResult({
          status: "not-supported",
          summary:
            "Pseudostatic slope stability requires Spencer's Method in the current circular-surface workflow.",
          metadata: { method: selectedMethod, mode: selectedMode },
        });
      }
      if (anchored && selectedMethod !== "spencer") {
        return calculationResult({
          status: "not-supported",
          summary:
            "Slope stability with ground anchors requires Spencer's Method in the current circular-surface workflow.",
          metadata: { method: selectedMethod, mode: selectedMode },
        });
      }
      const normalizedSurcharges = normalizeSurcharges(surfaceSurcharges, units);
      const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
      let best;
      let searchOutput = null;
      try {
        if (selectedMode === "assigned-surface") {
          const slipSurface = slipSurfaceInput instanceof CircularSlipSurface2D
            ? slipSurfaceInput
            : new CircularSlipSurface2D({
                ...slipSurfaceInput,
                units: slipSurfaceInput?.units ?? units,
              });
          best = solveSurface({
            groundModel,
            designSituation,
            slipSurface,
            method: selectedMethod,
            sectionId,
            porePressureFieldId,
            sliceCount,
            surfaceSurcharges: normalizedSurcharges,
            groundAnchors: normalizedGroundAnchors,
            iteration,
          });
        } else {
          const searched = searchCriticalSurface({
            groundModel,
            designSituation,
            method: selectedMethod,
            sectionId,
            porePressureFieldId,
            sliceCount,
            surfaceSurcharges: normalizedSurcharges,
            groundAnchors: normalizedGroundAnchors,
            iteration,
            search,
            resolver,
            movementDirection,
          });
          best = searched.best;
          searchOutput = searched.search;
        }
      } catch (error) {
        return calculationResult({
          status: "not-supported",
          summary: "The selected circular slope-stability problem is not admissible.",
          warnings: [error.message],
          metadata: { method: selectedMethod, mode: selectedMode },
        });
      }

      const spencer = best.solution.methods.spencer;
      const bishop = best.solution.methods["bishop-simplified"] ?? null;
      const ordinary = best.solution.methods["ordinary-method-of-slices"] ?? null;
      const warnings = unique([
        ...best.discretization.warnings,
        ...best.solution.methodWarnings,
        ...(pseudostatic ? [
          "Pseudostatic inertia is a static equivalent action and does not predict earthquake-induced displacement or dynamic response.",
          "Horizontal inertia is kh times slice self-weight; vertical inertia scales self-weight by 1-kv; surface-load inertia is not included.",
        ] : anchored ? [] : [
          "Simplified Bishop does not satisfy horizontal force equilibrium and is restricted to circular static slip surfaces.",
          "The Ordinary Method of Slices is reported as a diagnostic comparison and may differ materially when friction or pore pressure is significant.",
        ]),
        ...(searchOutput ? [
          "The automatic search examines a finite parameter domain and can miss other local or global minima; review retained candidates and run independent search domains.",
        ] : []),
        ...(anchored &&
          searchOutput?.groundAnchorVerificationFamilies.status !== "ok"
          ? [
              "The selected search domain did not generate valid surface families behind every supplied anchor level and behind the complete anchored system; review groundAnchorVerificationFamilies and run independent search domains.",
            ]
          : []),
      ]);
      return calculationResult({
        status: "ok",
        summary: searchOutput
          ? `Critical circular slip surface found with ${selectedMethod}.`
          : `Assigned circular slip surface analyzed with ${selectedMethod}.`,
        outputs: {
          schemaVersion: CIRCULAR_SLOPE_STABILITY_RESULT_SCHEMA_VERSION,
          groundModelId: groundModel.id,
          designSituationId: designSituation.id,
          mode: selectedMode,
          method: selectedMethod,
          factorOfSafety: best.solution.factorOfSafety,
          criticalSurface: best.slipSurface,
          discretization: best.discretization,
          methods: best.solution.methods,
          comparison: pseudostatic ? {
            spencerFactorOfSafety: spencer.factorOfSafety,
            staticSimplifiedMethods: "not-applicable",
          } : anchored ? {
            spencerFactorOfSafety: spencer.factorOfSafety,
            staticSimplifiedMethods: "not-applicable-with-ground-anchors",
          } : {
            spencerFactorOfSafety:
              spencer.status === "not-supported"
                ? null
                : spencer.factorOfSafety,
            bishopFactorOfSafety: bishop.factorOfSafety,
            ordinaryFactorOfSafety: ordinary.factorOfSafety,
            ordinaryToBishopRatio:
              ordinary.factorOfSafety / bishop.factorOfSafety,
            spencerToBishopRatio:
              spencer.status === "not-supported"
                ? null
                : spencer.factorOfSafety / bishop.factorOfSafety,
          },
          search: searchOutput,
          surfaceSurcharges: normalizedSurcharges.map((load) => load.toJSON()),
          groundAnchors: best.discretization.groundAnchors ?? {
            suppliedCount: 0,
            interactions: [],
            actions: [],
          },
        },
        warnings,
        assumptions: [
          "The problem is two-dimensional in plane strain and the moving mass is one unit wide out of plane.",
          "The slip surface is the lower branch of a circle and each slice base is represented by its chord.",
          "Drained slices use effective-stress Mohr-Coulomb strength and assigned pore pressure; undrained slices use total-stress su with phi_u=0 and no separate pore-pressure subtraction.",
          "Uniform surface surcharges act vertically downward on their horizontal projection.",
          pseudostatic
            ? "Pseudostatic coefficients are assigned by GeotechnicalDesignSituation and are not derived by this method-neutral solver."
            : "Seismic inertia is absent in the selected static design situation.",
          anchored
            ? "Only the supplied straight ground anchors are included as reinforcement; head, waler and wall resistance and all other reinforcement types remain external checks."
            : "External water above the ground surface, reinforcement and tension cracks are excluded.",
          ...(anchored ? [
            "A surface in front of a bond zone receives the full verified design tendon force; a surface through the bond zone receives the fraction corresponding to bond length remaining beyond the surface; a surface not crossed by the anchor receives no anchor force.",
            "Uniform bond stress and sufficient deformation compatibility to mobilize the credited design force are assumed.",
          ] : []),
        ],
        metadata: {
          method: selectedMethod,
          mode: selectedMode,
          reference:
            anchored
              ? "USACE EM 1110-2-1902 (2003), Appendices C and F; USBR Design Standards No. 13, Chapter 4 (2011), Appendix B; FHWA-IF-99-015 (1999), section 5.8.3.2"
              : "USACE EM 1110-2-1902 (2003), Appendices C and F; USBR Design Standards No. 13, Chapter 4 (2011), Appendix B",
          units: {
            length: "m",
            forcePerUnitWidth: "kN/m",
            stress: "kN/m2",
            unitWeight: "kN/m3",
            angle: "rad",
            factorOfSafety: "dimensionless",
          },
          designSituation: designSituation.toJSON(),
        },
      });
    } catch (error) {
      return calculationResult({
        status: "failed",
        summary: "Circular slope-stability analysis failed.",
        warnings: [error.message],
        metadata: { errorName: error.name },
      });
    }
  }
}
