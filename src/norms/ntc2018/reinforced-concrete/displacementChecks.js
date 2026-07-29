/**
 * Solver-neutral displacement checks from NTC 2018 chapter 7.
 */

import { withNormativeReferences } from "../../normativeReference.js";
import { NTC2018_RC_OUTSIDE_CORPUS_REFERENCES } from "../normativeReferences.js";

function outsideCorpusMetadata(metadata = {}) {
  return withNormativeReferences(
    metadata,
    [NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.globalSeismicAnalysis],
  );
}

export const NTC2018_DISPLACEMENT_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§ 7.2.1 (distanza tra costruzioni contigue)",
  }),
  Object.freeze({
    source: "NTC 2018",
    citation: "§ 7.3.1, Eq. [7.3.3] (non linearità geometriche)",
  }),
  Object.freeze({
    source: "NTC 2018",
    citation: "§ 7.3.6.1, Eqs. [7.3.11a], [7.3.11b] e [7.3.12] (spostamenti di interpiano)",
  }),
]);

export const NTC2018_DRIFT_INFILL_CATEGORY = Object.freeze({
  RIGIDLY_CONNECTED_FRAGILE: "rigidly-connected-fragile",
  RIGIDLY_CONNECTED_DUCTILE: "rigidly-connected-ductile",
  DAMAGE_AVOIDING: "damage-avoiding",
  // Deprecated input aliases retained for one compatibility cycle.
  RIGIDLY_CONNECTED: "rigidly-connected",
  NON_RIGIDLY_CONNECTED: "non-rigidly-connected",
  NO_INFILL: "no-infill",
});

export const NTC2018_DRIFT_LIMITS = Object.freeze({
  "rigidly-connected-fragile": 0.005,
  "rigidly-connected-ductile": 0.0075,
  "damage-avoiding": 0.010,
  classIIIAndIVFactor: 2 / 3,
});

export const NTC2018_PDELTA_THRESHOLDS = Object.freeze({
  negligible: 0.1,
  amplificationUpper: 0.2,
  nonlinearUpper: 0.3,
  forbidden: 0.3,
});

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite; got ${value}.`);
  }
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be positive; got ${value}.`);
  }
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) {
    throw new Error(`${label} must be non-negative; got ${value}.`);
  }
  return number;
}

function normalizeUseClass(value) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^CU[-\s]*/, "");
  if (!["I", "II", "III", "IV"].includes(normalized)) {
    throw new Error(`useClass must be I, II, III or IV; got ${value}.`);
  }
  return normalized;
}

function normalizeInfillCategory(value) {
  if (value === "rigidly-connected") return "rigidly-connected-fragile";
  if (value === "non-rigidly-connected") return "damage-avoiding";
  if (value === "no-infill") {
    throw new Error(
      "NTC 2018 § 7.3.6.1 does not define a generic no-infill drift limit; select the applicable non-structural system.",
    );
  }
  if (
    value === "rigidly-connected-fragile" ||
    value === "rigidly-connected-ductile" ||
    value === "damage-avoiding"
  ) {
    return value;
  }
  throw new Error(`Unsupported infillCategory: ${value}.`);
}

export function computeStoreyDrift({
  displacementTop,
  displacementBottom,
  storeyHeight,
}) {
  const top = finite(displacementTop, "displacementTop");
  const bottom = finite(displacementBottom, "displacementBottom");
  const height = positive(storeyHeight, "storeyHeight");
  const drift = Math.abs(top - bottom);
  return { drift, driftRatio: drift / height };
}

/**
 * Verify RC-building inter-storey displacement at the serviceability state
 * required for the selected use class.
 */
export function verifyStoreyDrift({
  driftRatio,
  limitState,
  useClass,
  q,
  infillCategory,
  nonStructuralDisplacementCapacityRatio,
}) {
  const elasticDriftRatio = nonNegative(driftRatio, "driftRatio");
  const behaviorFactor = positive(q, "q");
  const normalizedUseClass = normalizeUseClass(useClass);
  const category = normalizeInfillCategory(infillCategory);
  const requiredLimitState = ["I", "II"].includes(normalizedUseClass)
    ? "SLD"
    : "SLO";
  if (limitState !== requiredLimitState) {
    throw new Error(
      `Use class ${normalizedUseClass} requires ${requiredLimitState} for the § 7.3.6.1 drift check; got ${limitState}.`,
    );
  }

  const classFactor = ["III", "IV"].includes(normalizedUseClass)
    ? NTC2018_DRIFT_LIMITS.classIIIAndIVFactor
    : 1;
  const limit = NTC2018_DRIFT_LIMITS[category] * classFactor;
  const designDriftRatio = behaviorFactor * elasticDriftRatio;
  const checks = [{
    check: "storey-drift-height-limit",
    ok: designDriftRatio <= limit,
    demand: designDriftRatio,
    capacity: limit,
    reference:
      category === "rigidly-connected-fragile"
        ? "NTC 2018 § 7.3.6.1, Eq. [7.3.11a]"
        : category === "rigidly-connected-ductile"
          ? "NTC 2018 § 7.3.6.1, Eq. [7.3.11b]"
          : "NTC 2018 § 7.3.6.1, Eq. [7.3.12]",
    metadata: outsideCorpusMetadata(),
  }];

  let nonStructuralCapacity = null;
  if (category === "damage-avoiding") {
    nonStructuralCapacity = nonNegative(
      nonStructuralDisplacementCapacityRatio,
      "nonStructuralDisplacementCapacityRatio",
    ) * classFactor;
    checks.push({
      check: "storey-drift-non-structural-capacity",
      ok: designDriftRatio <= nonStructuralCapacity,
      demand: designDriftRatio,
      capacity: nonStructuralCapacity,
      reference: "NTC 2018 § 7.3.6.1, Eq. [7.3.12]",
      metadata: outsideCorpusMetadata(),
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    driftRatio: elasticDriftRatio,
    designDriftRatio,
    q: behaviorFactor,
    useClass: normalizedUseClass,
    limitState,
    infillCategory: category,
    limit,
    nonStructuralDisplacementCapacityRatio: nonStructuralCapacity,
    checks,
    check: "storey-drift",
    reference: checks[0].reference,
    metadata: outsideCorpusMetadata(),
  };
}

export function computePDeltaCoefficient({
  storeyWeight,
  drift,
  storeyShear,
  storeyHeight,
}) {
  const weight = nonNegative(storeyWeight, "storeyWeight");
  const interstoreyDisplacement = nonNegative(drift, "drift");
  const shear = positive(Math.abs(finite(storeyShear, "storeyShear")), "storeyShear");
  const height = positive(storeyHeight, "storeyHeight");
  const theta = weight * interstoreyDisplacement / (shear * height);

  let status;
  let amplificationFactor = null;
  if (theta < NTC2018_PDELTA_THRESHOLDS.negligible) {
    status = "negligible";
  } else if (theta <= NTC2018_PDELTA_THRESHOLDS.amplificationUpper) {
    status = "amplification-required";
    amplificationFactor = 1 / (1 - theta);
  } else if (theta <= NTC2018_PDELTA_THRESHOLDS.nonlinearUpper) {
    status = "nonlinear-analysis-required";
  } else {
    status = "forbidden";
  }

  return {
    theta,
    status,
    amplificationFactor,
    metadata: outsideCorpusMetadata(),
  };
}

export function verifyPDelta(params) {
  const result = computePDeltaCoefficient(params);
  return {
    ...result,
    ok:
      result.status === "negligible" ||
      result.status === "amplification-required",
    check: "pdelta",
    reference: "NTC 2018 § 7.3.1, Eq. [7.3.3]",
    metadata: outsideCorpusMetadata(result.metadata),
  };
}

/**
 * Required separation between facing points of adjacent constructions.
 */
export function computeSeismicJointWidth({
  buildingHeightA,
  buildingHeightB,
  facingPointElevation,
  slvDisplacementA,
  slvDisplacementB,
  relativeFoundationDisplacement,
  agSOverG,
}) {
  const heightA = positive(buildingHeightA, "buildingHeightA");
  const heightB = nonNegative(buildingHeightB, "buildingHeightB");
  const hazard = nonNegative(agSOverG, "agSOverG");
  const foundationDisplacement = nonNegative(
    relativeFoundationDisplacement,
    "relativeFoundationDisplacement",
  );
  const pointElevation = facingPointElevation === undefined
    ? (heightB > 0 ? Math.min(heightA, heightB) : heightA)
    : positive(facingPointElevation, "facingPointElevation");

  const usedEstimatedDisplacementA = slvDisplacementA === undefined;
  const usedEstimatedDisplacementB =
    heightB > 0 && slvDisplacementB === undefined;
  const displacementA = usedEstimatedDisplacementA
    ? 0.01 * heightA * hazard
    : nonNegative(slvDisplacementA, "slvDisplacementA");
  const displacementB = heightB === 0
    ? 0
    : usedEstimatedDisplacementB
      ? 0.01 * heightB * hazard
      : nonNegative(slvDisplacementB, "slvDisplacementB");

  const displacementRequirement =
    displacementA + displacementB + foundationDisplacement;
  const geometricMinimum =
    0.01 * pointElevation * Math.max(2 * hazard, 1);
  const jointWidth = Math.max(displacementRequirement, geometricMinimum);

  return {
    jointWidth,
    displacementA,
    displacementB,
    relativeFoundationDisplacement: foundationDisplacement,
    displacementRequirement,
    geometricMinimum,
    usedEstimatedDisplacements:
      usedEstimatedDisplacementA || usedEstimatedDisplacementB,
    check: "seismic-joint",
    reference: "NTC 2018 § 7.2.1, distanza tra costruzioni contigue",
    metadata: outsideCorpusMetadata(),
  };
}

function directionDisplacements(storey, direction, prefix) {
  const suffix = direction.toUpperCase();
  const topKey = `${prefix}Displacement${suffix}`;
  const bottomKey = `${prefix}Displacement${suffix}Below`;
  if (storey[topKey] === undefined && storey[bottomKey] === undefined) {
    return null;
  }
  return {
    top: finite(storey[topKey], `storey.${topKey}`),
    bottom: finite(storey[bottomKey], `storey.${bottomKey}`),
  };
}

export function verifyStoreyDisplacements({
  storey,
  limitState,
  useClass,
  q,
  infillCategory,
  nonStructuralDisplacementCapacityRatio,
  checkPDelta = false,
}) {
  const height = positive(storey.height, "storey.height");
  const results = {};
  const checks = [];

  for (const direction of ["x", "y"]) {
    const service = directionDisplacements(storey, direction, "service");
    if (service == null) {
      if (direction === "x") {
        throw new Error("Service displacements in direction X are required.");
      }
      results[`drift${direction.toUpperCase()}`] = null;
    } else {
      const drift = computeStoreyDrift({
        displacementTop: service.top,
        displacementBottom: service.bottom,
        storeyHeight: height,
      });
      const verification = verifyStoreyDrift({
        driftRatio: drift.driftRatio,
        limitState,
        useClass,
        q,
        infillCategory,
        nonStructuralDisplacementCapacityRatio,
      });
      results[`drift${direction.toUpperCase()}`] = {
        ...verification,
        drift: drift.drift,
      };
      checks.push(...verification.checks.map((check) => ({
        ...check,
        direction,
      })));
    }

    let pDelta = null;
    if (checkPDelta) {
      const slv = directionDisplacements(storey, direction, "slv");
      if (slv == null) {
        throw new Error(
          `SLV displacements in direction ${direction.toUpperCase()} are required for P-Delta.`,
        );
      }
      pDelta = verifyPDelta({
        storeyWeight: storey.weight,
        drift: Math.abs(slv.top - slv.bottom),
        storeyShear: storey[`shear${direction.toUpperCase()}`],
        storeyHeight: height,
      });
      checks.push({ ...pDelta, direction });
    }
    results[`pDelta${direction.toUpperCase()}`] = pDelta;
  }

  return {
    storeyId: storey.storeyId,
    ...results,
    allChecksOk: checks.every((check) => check.ok === true),
    checks,
    metadata: outsideCorpusMetadata(),
  };
}

export function createDisplacementAssessment({
  storeys,
  limitState,
  useClass,
  q,
  infillCategory,
  nonStructuralDisplacementCapacityRatio,
  checkPDelta = false,
}) {
  if (!Array.isArray(storeys) || storeys.length === 0) {
    throw new Error("At least one storey is required.");
  }
  const storeyResults = storeys.map((storey) =>
    verifyStoreyDisplacements({
      storey,
      limitState,
      useClass,
      q,
      infillCategory,
      nonStructuralDisplacementCapacityRatio,
      checkPDelta,
    }));
  const allChecks = storeyResults.flatMap((result) => result.checks);

  function governing(resultKey, valueKey) {
    let current = null;
    for (const result of storeyResults) {
      const candidate = result[resultKey];
      if (
        candidate != null &&
        (current == null || candidate[valueKey] > current[valueKey])
      ) {
        current = {
          storeyId: result.storeyId,
          [valueKey]: candidate[valueKey],
        };
      }
    }
    return current;
  }

  return {
    limitState,
    useClass: normalizeUseClass(useClass),
    q: positive(q, "q"),
    storeyResults,
    governingDriftX: governing("driftX", "designDriftRatio"),
    governingDriftY: governing("driftY", "designDriftRatio"),
    governingThetaX: governing("pDeltaX", "theta"),
    governingThetaY: governing("pDeltaY", "theta"),
    allChecksOk: allChecks.length > 0 &&
      allChecks.every((check) => check.ok === true),
    checks: allChecks,
    references: NTC2018_DISPLACEMENT_REFERENCES,
    metadata: outsideCorpusMetadata(),
  };
}
