/**
 * NTC 2018 chapter-7 rules for primary RC walls.
 *
 * Chapter-4 section capacities are accepted as explicit inputs. This keeps
 * the module solver-neutral and avoids duplicating or simplifying the local
 * reinforced-concrete section kernels.
 */

import {
  NTC2018_STRUCTURAL_BEHAVIOR,
  normalizeNTC2018StructuralBehavior,
} from "./structuralBehavior.js";

export const NTC2018_SHEAR_WALL_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§§ 7.4.4.5.1, 7.4.4.5.2 e 7.4.6.2.4; Eqs. [7.4.13]-[7.4.22] e [7.4.32]-[7.4.33]",
  }),
]);

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

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer; got ${value}.`);
  }
  return number;
}

export function computeWallCriticalZoneHeight({
  wallLength,
  wallHeight,
  storeyHeight,
  storeyCount,
}) {
  const length = positive(wallLength, "wallLength");
  const height = positive(wallHeight, "wallHeight");
  const clearStoreyHeight = positive(storeyHeight, "storeyHeight");
  const storeys = positiveInteger(storeyCount, "storeyCount");
  const uncapped = Math.max(length, height / 6);
  const storeyCap = storeys <= 6
    ? clearStoreyHeight
    : 2 * clearStoreyHeight;
  const hCr = Math.min(uncapped, 2 * length, storeyCap);
  return {
    hCr,
    uncapped,
    caps: {
      twoWallLengths: 2 * length,
      storeyHeight: storeyCap,
    },
    reference: "NTC 2018 § 7.4.4.5.1, Eq. [7.4.13]",
  };
}

export function computeWallMomentShift({
  wallLength,
  wallHeight,
  storeyHeight,
  storeyCount,
  behavior,
}) {
  const length = positive(wallLength, "wallLength");
  const height = positive(wallHeight, "wallHeight");
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  const slender = height / length > 2;
  const applicable =
    slender &&
    normalizedBehavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
  const criticalZone = computeWallCriticalZoneHeight({
    wallLength: length,
    wallHeight: height,
    storeyHeight,
    storeyCount,
  });
  return {
    shift: applicable ? criticalZone.hCr : 0,
    applicable,
    slender,
    hCr: criticalZone.hCr,
    reference: "NTC 2018 § 7.4.4.5.1 (Presso-flessione)",
  };
}

/**
 * Increase wall shear demand after formation of the base plastic hinge.
 */
export function computeWallCapacityShear({
  analysisShear,
  momentResistance,
  momentDemand,
  q,
  behavior,
  wallLength,
  wallHeight,
  elasticSpectrumTc,
  elasticSpectrumT1,
}) {
  const baseShear = Math.abs(finite(analysisShear, "analysisShear"));
  const resistance = positive(momentResistance, "momentResistance");
  const demandMoment = positive(Math.abs(finite(momentDemand, "momentDemand")), "momentDemand");
  if (resistance < demandMoment) {
    throw new Error(
      "momentResistance must be at least momentDemand before applying the wall capacity-shear rule.",
    );
  }
  const behaviorFactor = positive(q, "q");
  const length = positive(wallLength, "wallLength");
  const height = positive(wallHeight, "wallHeight");
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  if (normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    return {
      shearDemand: baseShear,
      amplificationFactor: 1,
      rawAmplificationFactor: 1,
      gammaRd: null,
      slender: height / length > 2,
      reference: "NTC 2018 § 7.4.1",
    };
  }
  if (behaviorFactor < 1.5) {
    throw new Error("Dissipative wall q must be at least 1.5.");
  }

  const slender = height / length > 2;
  const gammaRd =
    normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A ? 1.2 : 1.0;
  let rawAmplificationFactor;
  let amplificationFactor;

  if (slender) {
    const spectrumTc = positive(elasticSpectrumTc, "elasticSpectrumTc");
    const spectrumT1 = positive(elasticSpectrumT1, "elasticSpectrumT1");
    rawAmplificationFactor = behaviorFactor * Math.sqrt(
      ((gammaRd / behaviorFactor) * (resistance / demandMoment)) ** 2 +
      0.1 * (spectrumTc / spectrumT1) ** 2,
    );
    amplificationFactor = Math.min(
      behaviorFactor,
      Math.max(1.5, rawAmplificationFactor),
    );
  } else {
    rawAmplificationFactor = gammaRd * resistance / demandMoment;
    amplificationFactor = Math.min(behaviorFactor, rawAmplificationFactor);
  }

  return {
    shearDemand: baseShear * amplificationFactor,
    amplificationFactor,
    rawAmplificationFactor,
    gammaRd,
    slender,
    reference: slender
      ? "NTC 2018 § 7.4.4.5.1, Eq. [7.4.14]"
      : "NTC 2018 § 7.4.4.5.1, Eq. [7.4.15]",
  };
}

/**
 * Apply the chapter-7 wall-specific modifiers to independently calculated
 * chapter-4 shear capacities.
 */
export function verifyWallShear({
  shearDemand,
  chapter4ConcreteCompressionResistance,
  wallWebTensionResistance,
  slidingResistance,
  inclinedReinforcementContribution,
  isDissipativeZone,
  isSquatWall,
}) {
  const demand = nonNegative(Math.abs(finite(shearDemand, "shearDemand")), "shearDemand");
  if (typeof isDissipativeZone !== "boolean") {
    throw new Error("isDissipativeZone must be boolean.");
  }
  if (typeof isSquatWall !== "boolean") {
    throw new Error("isSquatWall must be boolean.");
  }
  const chapter4Compression = positive(
    chapter4ConcreteCompressionResistance,
    "chapter4ConcreteCompressionResistance",
  );
  const concreteCompressionResistance =
    chapter4Compression * (isDissipativeZone ? 0.4 : 1);
  const webTensionResistance = positive(
    wallWebTensionResistance,
    "wallWebTensionResistance",
  );
  const checks = [
    {
      check: "wall-shear-compression",
      demand,
      capacity: concreteCompressionResistance,
      utilizationRatio: demand / concreteCompressionResistance,
      ok: demand <= concreteCompressionResistance,
      reference: "NTC 2018 § 7.4.4.5.1 (taglio-compressione)",
    },
    {
      check: "wall-shear-web-tension",
      demand,
      capacity: webTensionResistance,
      utilizationRatio: demand / webTensionResistance,
      ok: demand <= webTensionResistance,
      reference: "NTC 2018 § 7.4.4.5.1 (taglio-trazione)",
    },
  ];

  if (isDissipativeZone) {
    const sliding = positive(slidingResistance, "slidingResistance");
    checks.push({
      check: "wall-shear-sliding",
      demand,
      capacity: sliding,
      utilizationRatio: demand / sliding,
      ok: demand <= sliding,
      reference: "NTC 2018 § 7.4.4.5.1, Eqs. [7.4.18]-[7.4.22]",
    });
    if (isSquatWall) {
      const inclined = nonNegative(
        inclinedReinforcementContribution,
        "inclinedReinforcementContribution",
      );
      checks.push({
        check: "wall-squat-inclined-reinforcement",
        demand: demand / 2,
        capacity: inclined,
        utilizationRatio: inclined > 0 ? (demand / 2) / inclined : Infinity,
        ok: inclined > demand / 2,
        comparison: ">",
        reference: "NTC 2018 § 7.4.4.5.1 (Vid > VEd/2)",
      });
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    shearDemand: demand,
    concreteCompressionResistance,
    webTensionResistance,
    checks,
    reference: "NTC 2018 § 7.4.4.5.1",
  };
}

export function verifyWallBoundaryConfinement({
  maximumConcreteCompressiveStrain,
}) {
  const strain = nonNegative(
    maximumConcreteCompressiveStrain,
    "maximumConcreteCompressiveStrain",
  );
  return {
    confinementRequired: strain > 0.0035,
    maximumConcreteCompressiveStrain: strain,
    threshold: 0.0035,
    check: "wall-boundary-confinement-region",
    reference: "NTC 2018 § 7.4.4.5.2",
  };
}

export function computeWallBoundaryLength({
  wallLength,
  wallThickness,
  strainDerivedLength = 0,
  simplifiedDetailing = false,
}) {
  const length = positive(wallLength, "wallLength");
  const thickness = positive(wallThickness, "wallThickness");
  const strainLength = nonNegative(strainDerivedLength, "strainDerivedLength");
  if (typeof simplifiedDetailing !== "boolean") {
    throw new Error("simplifiedDetailing must be boolean.");
  }
  const minimumLength = simplifiedDetailing
    ? Math.max(0.20 * length, 1.5 * thickness)
    : Math.max(0.15 * length, 0.15 * thickness);
  return {
    boundaryLength: Math.max(strainLength, minimumLength),
    strainDerivedLength: strainLength,
    minimumLength,
    simplifiedDetailing,
    reference: simplifiedDetailing
      ? "NTC 2018 §§ 7.4.4.5.2 e 7.4.6.2.4"
      : "NTC 2018 § 7.4.4.5.2",
  };
}

/**
 * Eq. [7.4.32] wall-boundary confinement requirement.
 */
export function computeWallConfinementOmegaWd({
  behavior,
  confinementEffectiveness,
  curvatureDuctilityDemand,
  normalizedAxialForce,
  verticalWebMechanicalRatio,
  reinforcementYieldStrain,
  grossSectionDepth,
  confinedCoreDepth,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  if (normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    return {
      omegaWd: 0,
      equationValue: 0,
      minimumValue: 0,
      reference: "NTC 2018 § 7.4.1",
    };
  }
  const alpha = positive(confinementEffectiveness, "confinementEffectiveness");
  const muPhi = positive(curvatureDuctilityDemand, "curvatureDuctilityDemand");
  const nuD = nonNegative(normalizedAxialForce, "normalizedAxialForce");
  const omegaV = nonNegative(
    verticalWebMechanicalRatio,
    "verticalWebMechanicalRatio",
  );
  const epsSy = positive(reinforcementYieldStrain, "reinforcementYieldStrain");
  const bc = positive(grossSectionDepth, "grossSectionDepth");
  const b0 = positive(confinedCoreDepth, "confinedCoreDepth");
  const equationValue = (
    30 * muPhi * (nuD + omegaV) * epsSy * (bc / b0) - 0.035
  ) / alpha;
  const minimumValue =
    normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A ? 0.12 : 0.08;
  return {
    omegaWd: Math.max(minimumValue, equationValue),
    equationValue,
    minimumValue,
    reference: "NTC 2018 § 7.4.6.2.4, Eq. [7.4.32]",
  };
}

/**
 * Aggregate complete wall-section checks without synthesizing local section
 * capacities.
 */
export function createWallSectionAssessment({
  sectionId,
  behavior,
  wallLength,
  wallThickness,
  axialCompressionRatio,
  flexuralCheck,
  shearCheckInput,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  const length = positive(wallLength, "wallLength");
  const thickness = positive(wallThickness, "wallThickness");
  const checks = [{
    check: "wall-geometric-classification",
    demand: length / thickness,
    capacity: 4,
    comparison: ">",
    ok: length / thickness > 4,
    reference: "NTC 2018 § 7.4.4.5",
  }];

  if (normalizedBehavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    const axialRatio = nonNegative(
      axialCompressionRatio,
      "axialCompressionRatio",
    );
    const limit =
      normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A ? 0.35 : 0.40;
    checks.push({
      check: "wall-axial-compression-ratio",
      demand: axialRatio,
      capacity: limit,
      utilizationRatio: axialRatio / limit,
      ok: axialRatio <= limit,
      reference: "NTC 2018 § 7.4.4.5.1",
    });
  }
  if (flexuralCheck != null) {
    if (typeof flexuralCheck.ok !== "boolean") {
      throw new Error("flexuralCheck.ok must be boolean.");
    }
    checks.push({ ...flexuralCheck, check: flexuralCheck.check ?? "wall-flexure" });
  }
  if (shearCheckInput != null) {
    checks.push(...verifyWallShear(shearCheckInput).checks);
  }

  const complete = flexuralCheck != null && shearCheckInput != null;
  const allChecksOk = complete && checks.every((check) => check.ok === true);
  return {
    sectionId,
    behavior: normalizedBehavior,
    complete,
    status: complete
      ? allChecksOk
        ? "ok"
        : "not-verified"
      : "not-implemented",
    allChecksOk,
    checks,
    references: NTC2018_SHEAR_WALL_REFERENCES,
  };
}
