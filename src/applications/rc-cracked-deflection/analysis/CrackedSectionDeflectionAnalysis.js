import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  DEFAULT_RC_SECTION_UNITS,
  governingCheck,
  isFinitePositive,
  normalizeCombinationType,
  round,
} from "../../reinforced-concrete-sections/shared/rcCommon.js";
import {
  createRcServiceSectionSolverContext,
  solveRcServiceSectionState,
} from "../../reinforced-concrete-sections/shared/solveRcServiceSectionState.js";
import {
  SingleBeamModel,
  resolveBeamSupportPreset,
} from "../../../domain/beams/SingleBeamInput.js";
import {
  DEFAULT_RC_SLE_MODULAR_RATIO,
  resolveRcSleModularRatio,
} from "../../reinforced-concrete-sections/serviceabilityDefaults.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { SectionMomentCurvatureCurve } from "./SectionMomentCurvatureCurve.js";
import { HyperstaticDeflectionIteration } from "./HyperstaticDeflectionIteration.js";

const SLENDERNESS_LIMITS = Object.freeze({
  simple_span: { k: 1, high: 14, low: 20 },
  continuous_end_span: { k: 1.3, high: 18, low: 26 },
  continuous_internal_span: { k: 1.5, high: 20, low: 30 },
  flat_slab: { k: 1.2, high: 17, low: 24 },
  cantilever: { k: 0.4, high: 6, low: 8 },
});

export const RC_DEFLECTION_PERFORMANCE_PROFILES = Object.freeze({
  interactive: Object.freeze({
    targetFiberCount: 80,
    solverTolerance: 5e-2,
    solverMaxIterations: 35,
    maxStationsPerCombination: 17,
    maxOutputPointsPerCombination: 33,
  }),
  production: Object.freeze({
    targetFiberCount: 120,
    solverTolerance: 1e-2,
    solverMaxIterations: 50,
    maxStationsPerCombination: 33,
    maxOutputPointsPerCombination: 65,
  }),
  accurate: Object.freeze({
    targetFiberCount: 300,
    solverTolerance: 1e-3,
    solverMaxIterations: 80,
    maxStationsPerCombination: null,
    maxOutputPointsPerCombination: null,
  }),
});

function isQuasiPermanent(type) {
  return normalizeCombinationType(type) === "SLE_QUASI_PERMANENT";
}

function resolvePerformanceProfile(name) {
  if (name == null || name === false) {
    return null;
  }

  return RC_DEFLECTION_PERFORMANCE_PROFILES[name] ?? null;
}

function resolveAnalysisOptions({
  performanceProfile,
  serviceability,
  mesh,
  solver,
  sampling,
  output,
}) {
  const profile =
    resolvePerformanceProfile(
      performanceProfile ??
        serviceability.deflection?.performanceProfile ??
        serviceability.performanceProfile,
    ) ?? {};
  const resolvedMesh = {
    ...mesh,
    targetFiberCount: mesh?.targetFiberCount ?? profile.targetFiberCount ?? 100,
  };
  const resolvedSolver = {
    ...solver,
    tolerance: solver?.tolerance ?? profile.solverTolerance ?? 1e-2,
    maxIterations: solver?.maxIterations ?? profile.solverMaxIterations ?? 50,
  };
  const resolvedSampling = {
    ...sampling,
    maxStationsPerCombination:
      sampling?.maxStationsPerCombination ??
      sampling?.maxStations ??
      serviceability.deflection?.maxStationsPerCombination ??
      serviceability.deflection?.maxStations ??
      profile.maxStationsPerCombination ??
      null,
  };
  const resolvedOutput = {
    ...output,
    maxPointsPerCombination:
      output?.maxPointsPerCombination ??
      output?.maxPoints ??
      serviceability.deflection?.maxOutputPointsPerCombination ??
      serviceability.deflection?.maxOutputPoints ??
      profile.maxOutputPointsPerCombination ??
      null,
    includePointDetails:
      output?.includePointDetails ??
      serviceability.deflection?.includePointDetails ??
      false,
  };

  return {
    profileName:
      Object.entries(RC_DEFLECTION_PERFORMANCE_PROFILES).find(
        ([, value]) => value === profile,
      )?.[0] ?? null,
    mesh: resolvedMesh,
    solver: resolvedSolver,
    sampling: resolvedSampling,
    output: resolvedOutput,
  };
}

function numericCacheKey(value) {
  return Number.isFinite(value) ? value.toPrecision(12) : String(value);
}

function transformedGrossInertiaY({ section, modularRatio }) {
  const concrete = section.concreteSection;
  const concreteArea = concrete.area;
  const concreteCentroid = concrete.centroidY;
  const bars = section.getReinforcementBars();
  const transformedBars = bars.map((bar) => ({
    area: modularRatio * bar.area,
    y: bar.y,
  }));
  const totalArea =
    concreteArea + transformedBars.reduce((sum, bar) => sum + bar.area, 0);
  const centroid =
    (concreteArea * concreteCentroid +
      transformedBars.reduce((sum, bar) => sum + bar.area * bar.y, 0)) /
    totalArea;
  const inertia =
    concrete.inertiaY +
    concreteArea * (concreteCentroid - centroid) ** 2 +
    transformedBars.reduce(
      (sum, bar) => sum + bar.area * (bar.y - centroid) ** 2,
      0,
    );

  return {
    centroid,
    inertia,
  };
}

function crackingMoment({ section, concreteMaterial }) {
  const concrete = section.concreteSection;
  const fctm = concreteMaterial?.fctm;

  if (!isFinitePositive(fctm)) {
    return null;
  }

  const sectionModulus =
    concrete.elasticSectionModulusY ??
    (isFinitePositive(concrete.inertiaY) && isFinitePositive(concrete.height)
      ? concrete.inertiaY / (concrete.height / 2)
      : null);

  return isFinitePositive(sectionModulus) ? fctm * sectionModulus : null;
}

function deduplicateSamples(samples, resolver) {
  const byStation = new Map();

  for (const sample of samples ?? []) {
    const x = resolver.length(sample.station ?? 0);
    const current = byStation.get(round(x, 6));

    if (!current || Math.abs(sample.m ?? 0) > Math.abs(current.sample.m ?? 0)) {
      byStation.set(round(x, 6), {
        x,
        sample,
      });
    }
  }

  return [...byStation.values()].sort((a, b) => a.x - b.x);
}

function convertSupportStations(supports, resolver) {
  return (supports ?? []).map((support) => ({
    ...support,
    station: Number.isFinite(support.station)
      ? resolver.length(support.station)
      : support.station,
  }));
}

function convertCompatibleDisplacements(samples, resolver) {
  return (samples ?? []).map((sample) => ({
    ...sample,
    x: Number.isFinite(sample.x) ? resolver.length(sample.x) : sample.x,
    station: Number.isFinite(sample.station)
      ? resolver.length(sample.station)
      : sample.station,
    deflection: Number.isFinite(sample.deflection)
      ? resolver.length(sample.deflection)
      : sample.deflection,
  }));
}

function maxAbsSampleAction(samples, key, resolver) {
  return (samples ?? []).reduce((max, sample) => {
    const rawValue = sample?.[key] ?? 0;
    const value =
      key === "m"
        ? resolver.moment(rawValue)
        : key === "n" || key === "v"
          ? resolver.force(rawValue)
          : rawValue;

    return Math.max(max, Math.abs(value));
  }, 0);
}

function addSampleIndex(indices, index, length) {
  const bounded = Math.max(0, Math.min(length - 1, index));
  indices.add(bounded);
}

function selectAnalysisSamples(
  samples,
  { maxStationsPerCombination = null } = {},
) {
  if (
    !Number.isInteger(maxStationsPerCombination) ||
    maxStationsPerCombination <= 0 ||
    samples.length <= maxStationsPerCombination
  ) {
    return samples;
  }

  const target = Math.max(3, maxStationsPerCombination);
  const indices = new Set();
  const lastIndex = samples.length - 1;

  addSampleIndex(indices, 0, samples.length);
  addSampleIndex(indices, lastIndex, samples.length);

  const maxMomentIndex = samples.reduce((selected, item, index) => {
    const selectedMoment = Math.abs(samples[selected]?.sample?.m ?? 0);
    const currentMoment = Math.abs(item.sample?.m ?? 0);

    return currentMoment > selectedMoment ? index : selected;
  }, 0);
  const maxAxialIndex = samples.reduce((selected, item, index) => {
    const selectedAxial = Math.abs(samples[selected]?.sample?.n ?? 0);
    const currentAxial = Math.abs(item.sample?.n ?? 0);

    return currentAxial > selectedAxial ? index : selected;
  }, 0);

  addSampleIndex(indices, maxMomentIndex, samples.length);
  addSampleIndex(indices, maxAxialIndex, samples.length);

  for (let index = 0; indices.size < target && index < target; index += 1) {
    addSampleIndex(
      indices,
      Math.round((index * lastIndex) / Math.max(1, target - 1)),
      samples.length,
    );
  }

  if (indices.size < target) {
    for (
      let index = 1;
      indices.size < target && index < lastIndex;
      index += 1
    ) {
      addSampleIndex(indices, index, samples.length);
    }
  }

  return [...indices].sort((a, b) => a - b).map((index) => samples[index]);
}

function integrateCurvature(
  points,
  supports = [],
  { displacementSamples = null } = {},
) {
  if (points.length < 2) {
    return points.map((point) => ({
      ...point,
      rotation: 0,
      deflection: 0,
    }));
  }

  const rotations = [0];
  const rawDeflections = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const rotation =
      rotations[index - 1] +
      0.5 * (previous.curvature + current.curvature) * dx;
    const deflection =
      rawDeflections[index - 1] + 0.5 * (rotations[index - 1] + rotation) * dx;

    rotations.push(rotation);
    rawDeflections.push(deflection);
  }

  const compatibleDisplacements = _interpolateCompatibleDisplacements(
    points,
    displacementSamples,
  );

  if (compatibleDisplacements) {
    return points.map((point, index) => ({
      ...point,
      rotation: compatibleDisplacements[index].rotation ?? rotations[index],
      deflection: compatibleDisplacements[index].deflection,
    }));
  }

  // Collect vertical support stations (sorted, unique).
  const verticalSupports = supports.filter((support) => support.restraints?.uy);
  const supportStations = [
    ...new Set(
      verticalSupports
        .map((s) => (Number.isFinite(s.station) ? s.station : null))
        .filter((v) => v != null),
    ),
  ].sort((a, b) => a - b);

  // Two-support case: single linear correction (backward-compatible).
  if (supportStations.length === 2) {
    return _linearSupportCorrection(
      points,
      rotations,
      rawDeflections,
      supportStations[0],
      supportStations[1],
    );
  }

  // Multi-support case: smooth global correction through all vertical supports.
  if (supportStations.length > 2) {
    return _smoothSupportCorrection(
      points,
      rotations,
      rawDeflections,
      supportStations,
    );
  }

  // No or one vertical support: return raw.
  return points.map((point, index) => ({
    ...point,
    rotation: rotations[index],
    deflection: rawDeflections[index],
  }));
}

function _linearSupportCorrection(
  points,
  rotations,
  rawDeflections,
  x0,
  x1,
) {
  const spanLen = x1 - x0;
  if (spanLen <= 0) {
    return points.map((point, index) => ({
      ...point,
      rotation: rotations[index],
      deflection: rawDeflections[index],
    }));
  }

  const rawV0 = _interpolateRawDeflection(points, rawDeflections, x0);
  const rawV1 = _interpolateRawDeflection(points, rawDeflections, x1);
  const correctionSlope = (rawV1 - rawV0) / spanLen;

  return points.map((point, index) => {
    const t = (point.x - x0) / spanLen;
    const localCorrection = -(rawV0 * (1 - t) + rawV1 * t);

    return {
      ...point,
      rotation: rotations[index] - correctionSlope,
      deflection: rawDeflections[index] + localCorrection,
    };
  });
}

function _smoothSupportCorrection(
  points,
  rotations,
  rawDeflections,
  supportStations,
) {
  const correctionValues = supportStations.map(
    (x) => -_interpolateRawDeflection(points, rawDeflections, x),
  );
  const correctionSpline = _createNaturalCubicSpline(
    supportStations,
    correctionValues,
  );

  return points.map((point, index) => {
    const correction = correctionSpline.evaluate(point.x);

    return {
      ...point,
      rotation: rotations[index] + correction.slope,
      deflection: rawDeflections[index] + correction.value,
    };
  });
}

function _interpolateRawDeflection(points, rawDeflections, x) {
  if (points.length === 0) return 0;
  if (x <= points[0].x) return rawDeflections[0];
  if (x >= points[points.length - 1].x)
    return rawDeflections[rawDeflections.length - 1];

  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].x <= x) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const t = (x - points[lo].x) / (points[hi].x - points[lo].x);
  return rawDeflections[lo] + t * (rawDeflections[hi] - rawDeflections[lo]);
}

function _interpolateCompatibleDisplacements(points, samples) {
  const sorted = (samples ?? [])
    .filter(
      (sample) =>
        Number.isFinite(sample.x) && Number.isFinite(sample.deflection),
    )
    .sort((a, b) => a.x - b.x);

  if (sorted.length < 2) {
    return null;
  }

  return points.map((point) => {
    if (point.x <= sorted[0].x) {
      return {
        deflection: sorted[0].deflection,
        rotation: sorted[0].rotation,
      };
    }

    const last = sorted[sorted.length - 1];
    if (point.x >= last.x) {
      return {
        deflection: last.deflection,
        rotation: last.rotation,
      };
    }

    let lo = 0;
    let hi = sorted.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid].x <= point.x) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const left = sorted[lo];
    const right = sorted[hi];
    const span = right.x - left.x;
    const t = span > 0 ? (point.x - left.x) / span : 0;
    const rotation =
      Number.isFinite(left.rotation) && Number.isFinite(right.rotation)
        ? left.rotation + t * (right.rotation - left.rotation)
        : null;

    return {
      deflection: left.deflection + t * (right.deflection - left.deflection),
      rotation,
    };
  });
}

function _createNaturalCubicSpline(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) {
    throw new Error("Natural cubic spline requires matching x/y arrays.");
  }

  if (xs.length === 2) {
    const span = xs[1] - xs[0];
    const slope = span > 0 ? (ys[1] - ys[0]) / span : 0;

    return {
      evaluate(x) {
        return {
          value: ys[0] + slope * (x - xs[0]),
          slope,
        };
      },
    };
  }

  const n = xs.length;
  const h = [];
  for (let i = 0; i < n - 1; i += 1) {
    h.push(xs[i + 1] - xs[i]);
    if (h[i] <= 0) {
      throw new Error("Natural cubic spline requires increasing x values.");
    }
  }

  const lower = new Array(n - 2).fill(0);
  const diag = new Array(n - 2).fill(0);
  const upper = new Array(n - 2).fill(0);
  const rhs = new Array(n - 2).fill(0);

  for (let i = 1; i <= n - 2; i += 1) {
    const row = i - 1;
    lower[row] = h[i - 1];
    diag[row] = 2 * (h[i - 1] + h[i]);
    upper[row] = h[i];
    rhs[row] =
      6 *
      ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
  }

  for (let i = 1; i < n - 2; i += 1) {
    const factor = lower[i] / diag[i - 1];
    diag[i] -= factor * upper[i - 1];
    rhs[i] -= factor * rhs[i - 1];
  }

  const second = new Array(n).fill(0);
  second[n - 2] = rhs[n - 3] / diag[n - 3];
  for (let i = n - 4; i >= 0; i -= 1) {
    second[i + 1] = (rhs[i] - upper[i] * second[i + 2]) / diag[i];
  }

  const intervalIndex = (x) => {
    if (x <= xs[0]) {
      return 0;
    }
    if (x >= xs[n - 1]) {
      return n - 2;
    }

    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (xs[mid] <= x) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    return lo;
  };

  return {
    evaluate(x) {
      const i = intervalIndex(x);
      const span = xs[i + 1] - xs[i];
      const a = (xs[i + 1] - x) / span;
      const b = (x - xs[i]) / span;
      const value =
        a * ys[i] +
        b * ys[i + 1] +
        (((a ** 3 - a) * second[i] + (b ** 3 - b) * second[i + 1]) *
          span ** 2) /
          6;
      const slope =
        (ys[i + 1] - ys[i]) / span +
        (span *
          ((-3 * a ** 2 + 1) * second[i] +
            (3 * b ** 2 - 1) * second[i + 1])) /
          6;

      return { value, slope };
    },
  };
}

function selectOutputPoints(points, { maxPointsPerCombination = null } = {}) {
  if (
    !Number.isInteger(maxPointsPerCombination) ||
    maxPointsPerCombination <= 0 ||
    points.length <= maxPointsPerCombination
  ) {
    return points;
  }

  const target = Math.max(3, maxPointsPerCombination);
  const indices = new Set();
  const lastIndex = points.length - 1;

  addSampleIndex(indices, 0, points.length);
  addSampleIndex(indices, lastIndex, points.length);

  const governingIndex = points.reduce((selected, point, index) => {
    const selectedDeflection = Math.abs(points[selected]?.deflection ?? 0);
    const currentDeflection = Math.abs(point.deflection ?? 0);

    return currentDeflection > selectedDeflection ? index : selected;
  }, 0);

  addSampleIndex(indices, governingIndex, points.length);

  for (let index = 0; indices.size < target && index < target; index += 1) {
    addSampleIndex(
      indices,
      Math.round((index * lastIndex) / Math.max(1, target - 1)),
      points.length,
    );
  }

  return [...indices].sort((a, b) => a - b).map((index) => points[index]);
}

function summarizeCurvaturePoint(point, { includePointDetails = false } = {}) {
  const summary = {
    station: round(point.station),
    mEd: round(point.mEd),
    zeta: round(point.zeta),
    curvature: round(point.curvature, 12),
    rotation: round(point.rotation, 12),
    deflection: round(point.deflection),
    cracked: point.cracked,
  };

  if (includePointDetails) {
    summary.x = round(point.x);
    summary.nEd = round(point.nEd);
    summary.mcr = round(point.mcr);
    summary.uncrackedCurvature = round(point.uncrackedCurvature, 12);
    summary.crackedCurvature = round(point.crackedCurvature, 12);
  }

  return summary;
}

function utilizationCheck({ demand, capacity, metadata }) {
  const utilizationRatio = isFinitePositive(capacity)
    ? demand / capacity
    : null;

  return {
    id: "rc-sle-deflection-curvature",
    description: "RC deflection from curvature integration",
    demand: round(demand),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok: Number.isFinite(utilizationRatio) && utilizationRatio <= 1,
    metadata,
  };
}

function slendernessCheck({ span, section, serviceability }) {
  const system =
    serviceability.deflection?.slendernessSystem ??
    serviceability.slendernessSystem ??
    "simple_span";
  const stressLevel =
    serviceability.deflection?.slendernessStressLevel ??
    serviceability.slendernessStressLevel ??
    "low";
  const limits = SLENDERNESS_LIMITS[system] ?? SLENDERNESS_LIMITS.simple_span;
  const limit = limits[stressLevel] ?? limits.low;
  const height = section.concreteSection?.height ?? section.height;

  if (!isFinitePositive(span) || !isFinitePositive(height)) {
    return null;
  }

  const demand = span / height;
  const utilizationRatio = demand / limit;

  return {
    id: "rc-sle-deflection-slenderness",
    description: "Simplified RC span-depth deflection screening",
    demand: round(demand),
    capacity: round(limit),
    utilizationRatio: round(utilizationRatio),
    ok: utilizationRatio <= 1,
    metadata: {
      method: "circolare-ntc2018-c4.1.i-screening",
      system,
      stressLevel,
      k: limits.k,
      span: round(span),
      sectionHeight: round(height),
      slendernessLimit: limit,
    },
  };
}

/**
 * Count vertical/rotational restraints for beam-line bending indeterminacy.
 * A simple span and a cantilever both have 2 bending restraints; more means
 * that flexural actions depend on stiffness redistribution.
 */
function countBendingSupportRestraints(beamModel) {
  if (!beamModel?.supports) return 0;
  let count = 0;
  for (const support of beamModel.supports) {
    const type = support.type ?? support.preset ?? "free";
    const restraints = support.restraints ?? resolveBeamSupportPreset(type);

    if (restraints?.uy) count += 1;
    if (restraints?.rz) count += 1;
  }
  return count;
}

export class CrackedSectionDeflectionAnalysis {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  analyze({
    beamId = null,
    analysisResult = null,
    section = null,
    concreteMaterial = section?.concreteMaterial,
    reinforcementMaterial = section?.reinforcementMaterial,
    serviceability = {},
    mesh = { targetFiberCount: 100 },
    solver = { tolerance: 1e-2, maxIterations: 50 },
    performanceProfile = null,
    sampling = {},
    output = {},
    beamModel = null,
    hyperstatic = null,
  } = {}) {
    if (!analysisResult || !section?.concreteSection) {
      return new VerificationResult({
        applicationId: "rc-cracked-deflection",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary:
          "Cracked-section deflection analysis requires a beam analysis result and an RC section.",
        warnings: [
          "Cracked inertia, tension stiffening and time-dependent effects were not evaluated because required inputs are missing.",
        ],
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    const es = reinforcementMaterial?.elasticModulus;
    const ec = concreteMaterial?.elasticModulus;
    const phi =
      serviceability.deflection?.creepCoefficient ??
      serviceability.creepCoefficient ??
      2;
    const baseModularRatio = resolveRcSleModularRatio(
      serviceability.deflection?.modularRatio,
      serviceability.modularRatio,
      DEFAULT_RC_SLE_MODULAR_RATIO,
    );
    const includeShrinkage =
      serviceability.deflection?.includeShrinkage ??
      serviceability.includeShrinkage ??
      false;
    const limitRatio =
      serviceability.deflection?.limitRatio ??
      serviceability.deflectionLimitRatio ??
      250;
    const betaShortTerm = serviceability.deflection?.betaShortTerm ?? 1;
    const betaLongTerm = serviceability.deflection?.betaLongTerm ?? 0.5;
    const analysisOptions = resolveAnalysisOptions({
      performanceProfile,
      serviceability,
      mesh,
      solver,
      sampling,
      output,
    });
    const warnings = [];
    const assumptions = [
      "Curvatures are integrated numerically along FEM service-combination stations.",
      `Cracked RC service sections use the modular-ratio method with base n = ${baseModularRatio}.`,
      "Concrete tension is excluded in cracked service-section states.",
      `Long-term quasi-permanent curvature increases the effective modular ratio through phi = ${phi}; shrinkage curvature is excluded.`,
    ];

    if (!isFinitePositive(es) || !isFinitePositive(ec)) {
      return new VerificationResult({
        applicationId: "rc-cracked-deflection",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary: "RC cracked deflection could not be evaluated.",
        warnings: [
          "Concrete and reinforcement elastic moduli are required for curvature integration.",
        ],
        assumptions,
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    if (includeShrinkage) {
      warnings.push(
        "Shrinkage curvature is intentionally excluded from the first RC deflection MVP; includeShrinkage was ignored.",
      );
    }

    const resultResolver = createUnitResolver(
      analysisResult.units,
      DEFAULT_RC_SECTION_UNITS,
    );
    const mcr = crackingMoment({ section, concreteMaterial });
    const combinationOutputs = [];
    const checks = [];
    const serviceContextCache = new Map();
    const solvedCurvatureCache = new Map();
    const performance = {
      profile: analysisOptions.profileName,
      targetFiberCount: analysisOptions.mesh.targetFiberCount,
      solverTolerance: analysisOptions.solver.tolerance,
      solverMaxIterations: analysisOptions.solver.maxIterations,
      maxStationsPerCombination:
        analysisOptions.sampling.maxStationsPerCombination,
      maxOutputPointsPerCombination:
        analysisOptions.output.maxPointsPerCombination,
      inputStationCount: 0,
      analyzedStationCount: 0,
      returnedPointCount: 0,
      serviceSolveCount: 0,
      serviceSolveCacheHits: 0,
    };
    let globalSpan = null;
    const normalizedBeamModel = beamModel
      ? beamModel instanceof SingleBeamModel
        ? beamModel
        : new SingleBeamModel(beamModel)
      : null;

    const getServiceContext = (effectiveModularRatio) => {
      const key = numericCacheKey(effectiveModularRatio);

      if (!serviceContextCache.has(key)) {
        serviceContextCache.set(key, {
          gross: transformedGrossInertiaY({
            section,
            modularRatio: effectiveModularRatio,
          }),
          context: createRcServiceSectionSolverContext({
            section,
            reinforcementMaterial,
            mesh: analysisOptions.mesh,
            solver: analysisOptions.solver,
            modularRatio: effectiveModularRatio,
          }),
        });
      }

      return serviceContextCache.get(key);
    };

    // -- Hyperstatic setup -------------------------------------------------
    const isHyperstatic =
      normalizedBeamModel != null &&
      (hyperstatic === true ||
        (hyperstatic == null &&
          countBendingSupportRestraints(normalizedBeamModel) > 2));

    let hyperstaticIteration = null;
    const hyperstaticCurveCache = new Map();

    if (hyperstatic === true && !normalizedBeamModel) {
      warnings.push(
        "Hyperstatic deflection iteration was requested but no beam model was provided; falling back to linear FEM moments.",
      );
    }

    if (isHyperstatic && normalizedBeamModel) {
      if (
        !normalizedBeamModel.combinations ||
        Object.keys(normalizedBeamModel.combinations).length === 0
      ) {
        warnings.push(
          "Hyperstatic deflection iteration requires combination definitions in the beam model; falling back to linear FEM moments.",
        );
      } else {
        hyperstaticIteration = new HyperstaticDeflectionIteration({
          relaxationFactor: serviceability.deflection?.relaxationFactor ?? 0.5,
          tolerance: serviceability.deflection?.iterationTolerance ?? 1e-4,
          maxIterations: serviceability.deflection?.maxIterations ?? 50,
        });
        assumptions.push(
          "Hyperstatic beams use iterative secant-stiffness redistribution with a precomputed M-κ curve per combination.",
        );
      }
    }
    // -----------------------------------------------------------------------

    for (const result of Object.values(analysisResult.combinations ?? {})) {
      if (String(result.context?.limitState ?? "").toUpperCase() !== "SLE") {
        continue;
      }

      const combinationType = result.context?.combinationType ?? null;
      const creepCoefficient = isQuasiPermanent(combinationType) ? phi : 0;
      const effectiveModularRatio = baseModularRatio * (1 + creepCoefficient);
      const effectiveConcreteModulus = es / effectiveModularRatio;
      const serviceArtifacts = getServiceContext(effectiveModularRatio);
      const gross = serviceArtifacts.gross;
      const serviceContext = serviceArtifacts.context;

      // -- Hyperstatic iteration (replaces linear FEM moments) ----------
      let iteratedResult = null;
      let iteratedCurve = null;
      if (
        hyperstaticIteration &&
        normalizedBeamModel &&
        result.factors &&
        Object.keys(result.factors).length > 0
      ) {
        const beta = creepCoefficient > 0 ? betaLongTerm : betaShortTerm;
        const initialMaxMoment = maxAbsSampleAction(
          result.internalForces?.samples ?? [],
          "m",
          resultResolver,
        );
        const representativeAxialForce = 0;
        const curveKey = [
          numericCacheKey(effectiveModularRatio),
          numericCacheKey(beta),
          numericCacheKey(initialMaxMoment),
          numericCacheKey(representativeAxialForce),
        ].join("|");
        let curve = hyperstaticCurveCache.get(curveKey);
        if (!curve) {
          curve = new SectionMomentCurvatureCurve({
            section,
            reinforcementMaterial,
            effectiveModularRatio,
            mesh: analysisOptions.mesh,
            solver: analysisOptions.solver,
            mcr,
            grossInertia: gross.inertia,
            concreteModulus: effectiveConcreteModulus,
            beta,
            initialMaxMoment,
            axialForce: representativeAxialForce,
            units: DEFAULT_RC_SECTION_UNITS,
          });
          hyperstaticCurveCache.set(curveKey, curve);
        }
        iteratedCurve = curve;

        const combinationDef = {
          id: result.id,
          factors: { ...result.factors },
          metadata: result.context ?? {},
        };

        iteratedResult = hyperstaticIteration.iterate({
          model: normalizedBeamModel,
          combination: combinationDef,
          curve,
        });

        if (!iteratedResult.converged) {
          warnings.push(
            `Hyperstatic secant iteration did not converge for ${result.id} after ${iteratedResult.iterations} iterations; using final moment distribution.`,
          );
        }
      }
      // -----------------------------------------------------------------

      const rawPoints = deduplicateSamples(
        iteratedResult
          ? (iteratedResult.momentSamples ?? [])
          : (result.internalForces?.samples ?? []),
        resultResolver,
      );
      const analysisPoints = selectAnalysisSamples(
        rawPoints,
        analysisOptions.sampling,
      );
      performance.inputStationCount += rawPoints.length;
      performance.analyzedStationCount += analysisPoints.length;

      const curvaturePoints = analysisPoints.map(({ x, sample }) => {
        const mEd = resultResolver.moment(sample.m ?? 0);
        const nEd = resultResolver.force(sample.n ?? 0);
        const absM = Math.abs(mEd);
        const uncrackedCurvature = isFinitePositive(
          effectiveConcreteModulus * gross.inertia,
        )
          ? mEd / (effectiveConcreteModulus * gross.inertia)
          : 0;
        let crackedCurvature = uncrackedCurvature;
        let solverConverged = true;
        let zeta = 0;

        if (iteratedCurve) {
          const curveState = iteratedCurve.lookupState(mEd);
          crackedCurvature = curveState.kappaCracked ?? curveState.kappa;
          solverConverged = curveState.converged ?? true;
          zeta = curveState.zeta ?? 0;

          if (!solverConverged) {
            warnings.push(
              `Precomputed M-kappa curve did not converge for ${result.id} near station ${sample.station}.`,
            );
          }

          return {
            x,
            station: sample.station,
            mEd,
            nEd,
            mcr,
            zeta,
            uncrackedCurvature:
              curveState.kappaUncracked ?? uncrackedCurvature,
            crackedCurvature,
            curvature: curveState.kappa,
            cracked: curveState.cracked ?? zeta > 0,
          };
        }

        if (isFinitePositive(absM) && (!isFinitePositive(mcr) || absM > mcr)) {
          const solveCacheKey = [
            numericCacheKey(effectiveModularRatio),
            numericCacheKey(nEd),
            numericCacheKey(mEd),
          ].join("|");
          let solved = solvedCurvatureCache.get(solveCacheKey);

          if (solved) {
            performance.serviceSolveCacheHits += 1;
          } else {
            solved = solveRcServiceSectionState({
              section,
              reinforcementMaterial,
              concreteMesh: serviceContext.mesh,
              serviceSolver: serviceContext.serviceSolver,
              concreteLaw: serviceContext.concreteLaw,
              steelLaw: serviceContext.steelLaw,
              solver: analysisOptions.solver,
              modularRatio: effectiveModularRatio,
              actions: {
                nEd,
                mxEd: mEd,
                myEd: 0,
              },
            }).solved;
            solvedCurvatureCache.set(solveCacheKey, solved);
            performance.serviceSolveCount += 1;
          }

          solverConverged = solved.converged;

          if (solved.converged) {
            crackedCurvature =
              Math.sign(mEd || 1) * Math.abs(solved.strainField.kappaZ);
          }

          const beta = creepCoefficient > 0 ? betaLongTerm : betaShortTerm;
          zeta = isFinitePositive(mcr)
            ? Math.max(0, 1 - beta * (mcr / absM) ** 2)
            : 1;
        }

        if (!solverConverged) {
          warnings.push(
            `Cracked curvature solver did not converge for ${result.id} at station ${sample.station}.`,
          );
        }

        return {
          x,
          station: sample.station,
          mEd,
          nEd,
          mcr,
          zeta,
          uncrackedCurvature,
          crackedCurvature,
          curvature: zeta * crackedCurvature + (1 - zeta) * uncrackedCurvature,
          cracked: zeta > 0,
        };
      });
      const integrated = integrateCurvature(
        curvaturePoints,
        convertSupportStations(
          iteratedResult?.supports ?? result.supports ?? [],
          resultResolver,
        ),
        {
          displacementSamples: convertCompatibleDisplacements(
            iteratedResult?.compatibleDisplacementSamples ?? [],
            resultResolver,
          ),
        },
      );
      const governing = integrated.reduce((selected, point) => {
        if (
          !selected ||
          Math.abs(point.deflection) > Math.abs(selected.deflection)
        ) {
          return point;
        }

        return selected;
      }, null);
      const span =
        integrated.length > 1
          ? integrated[integrated.length - 1].x - integrated[0].x
          : resultResolver.length(result.geometry?.length ?? 0);
      globalSpan = globalSpan ?? span;
      const limit = isFinitePositive(limitRatio) ? span / limitRatio : null;

      if (governing && isFinitePositive(limit)) {
        checks.push(
          utilizationCheck({
            demand: Math.abs(governing.deflection),
            capacity: limit,
            metadata: {
              resultId: result.id,
              resultType: result.resultType,
              limitState: result.context?.limitState ?? null,
              combinationType,
              station: round(governing.station),
              creepCoefficient,
              baseModularRatio: round(baseModularRatio),
              modularRatio: round(effectiveModularRatio),
              limitRatio,
              maxAbsDeflection: round(Math.abs(governing.deflection)),
              span: round(span),
              mcr: round(mcr),
            },
          }),
        );
      }

      const outputPoints = selectOutputPoints(
        integrated,
        analysisOptions.output,
      );
      const crackedPointCount = integrated.filter((point) => point.cracked)
        .length;
      const maxZeta = integrated.reduce(
        (max, point) => Math.max(max, point.zeta ?? 0),
        0,
      );
      const hyperstaticSummary = iteratedResult
        ? {
            active: true,
            converged: Boolean(iteratedResult.converged),
            iterations: iteratedResult.iterations,
            method: "secant-stiffness-moment-curvature",
            momentCurvePointCount: iteratedCurve?.pointCount ?? null,
            compatibleDeflectionSource: "iterated-fem-shape-functions",
          }
        : {
            active: false,
            converged: null,
            iterations: 0,
            method: null,
            momentCurvePointCount: null,
            compatibleDeflectionSource: null,
          };

      combinationOutputs.push({
        resultId: result.id,
        combinationType,
        creepCoefficient,
        baseModularRatio: round(baseModularRatio),
        effectiveConcreteModulus: round(effectiveConcreteModulus),
        modularRatio: round(effectiveModularRatio),
        limitRatio,
        span: round(span),
        deflectionLimit: round(limit),
        maxAbsDeflection: round(Math.abs(governing?.deflection ?? 0)),
        governingStation: round(governing?.station),
        mcr: round(mcr),
        inputPointCount: rawPoints.length,
        analyzedPointCount: analysisPoints.length,
        returnedPointCount: outputPoints.length,
        crackedPointCount,
        maxZeta: round(maxZeta),
        hyperstatic: hyperstaticSummary,
        points: outputPoints.map((point) =>
          summarizeCurvaturePoint(point, analysisOptions.output),
        ),
      });

      performance.returnedPointCount +=
        combinationOutputs[combinationOutputs.length - 1].returnedPointCount;
    }

    const slenderness = slendernessCheck({
      span: globalSpan,
      section,
      serviceability,
    });

    if (slenderness) {
      checks.push(slenderness);
    }

    const governing = governingCheck(checks);

    return new VerificationResult({
      applicationId: "rc-cracked-deflection",
      status:
        checks.length > 0 && checks.every((check) => check.ok)
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "RC service deflection from cracked/uncracked curvature integration.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        beamId,
        creepCoefficient: phi,
        includeShrinkage: false,
        performance,
        simplifiedSlenderness: slenderness
          ? {
              demand: slenderness.demand,
              capacity: slenderness.capacity,
              utilizationRatio: slenderness.utilizationRatio,
              ok: slenderness.ok,
              metadata: { ...slenderness.metadata },
            }
          : null,
        combinationCount: combinationOutputs.length,
        combinations: combinationOutputs,
      },
      warnings,
      assumptions,
      metadata: {
        code: this.code,
        beamId,
        method: "curvature-integration-tension-stiffening-mvp",
        governingCheckId: governing?.id ?? null,
        creepCoefficient: phi,
        includeShrinkage: false,
        ...this.metadata,
      },
    });
  }
}
