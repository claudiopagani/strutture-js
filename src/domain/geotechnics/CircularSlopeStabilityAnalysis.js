import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { CircularSlipSurface2D } from "./CircularSlipSurface2D.js";
import { GeotechnicalDesignSituation } from "./GeotechnicalDesignSituation.js";
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

function solveDiscretization(discretization, method, iteration) {
  const pseudostatic =
    discretization.metadata.seismicLoading.model === "pseudostatic";
  if (pseudostatic && method !== "spencer") {
    throw new Error(
      "Pseudostatic slope stability is available with Spencer's Method only.",
    );
  }
  if (pseudostatic) {
    const spencer = spencerMethod(
      discretization.slices,
      iteration.spencer ?? iteration,
    );
    return {
      selectedMethod: method,
      factorOfSafety: spencer.factorOfSafety,
      methods: { spencer },
      methodWarnings: [],
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
  iteration,
}) {
  const discretization = new SlopeSliceDiscretizer2D().discretize({
    groundModel,
    designSituation,
    slipSurface,
    sectionId,
    porePressureFieldId,
    sliceCount,
    surfaceSurcharges,
  });
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

function searchCriticalSurface({
  groundModel,
  designSituation,
  method,
  sectionId,
  porePressureFieldId,
  sliceCount,
  surfaceSurcharges,
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
    }));

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
      const selectedMethod = method ?? (pseudostatic
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
        ] : [
          "Simplified Bishop does not satisfy horizontal force equilibrium and is restricted to circular static slip surfaces.",
          "The Ordinary Method of Slices is reported as a diagnostic comparison and may differ materially when friction or pore pressure is significant.",
        ]),
        ...(searchOutput ? [
          "The automatic search examines a finite parameter domain and can miss other local or global minima; review retained candidates and run independent search domains.",
        ] : []),
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
          "External water above the ground surface, reinforcement and tension cracks are excluded.",
        ],
        metadata: {
          method: selectedMethod,
          mode: selectedMode,
          reference:
            "USACE EM 1110-2-1902 (2003), Appendices C and F; USBR Design Standards No. 13, Chapter 4 (2011), Appendix B",
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
