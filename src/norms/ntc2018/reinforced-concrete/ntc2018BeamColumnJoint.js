const JOINT_TYPES = new Set(["internal", "external"]);
const TENSION_METHODS = new Set([
  "diagonal-tension",
  "post-cracking-truss",
]);

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function nonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative.`);
  }

  return value;
}

export function ntc2018JointOverstrengthFactor(ductilityClass) {
  const normalized = String(ductilityClass ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("\"", "")
    .replaceAll("-", "");

  if (["CDA", "A"].includes(normalized)) {
    return 1.2;
  }

  if (["CDB", "B"].includes(normalized)) {
    return 1;
  }

  throw new Error(`Unsupported NTC 2018 ductility class: ${ductilityClass}.`);
}

export function calculateNTC2018EffectiveJointWidth({
  columnWidth,
  beamWidth,
  columnDepth,
}) {
  positive(columnWidth, "columnWidth");
  positive(beamWidth, "beamWidth");
  positive(columnDepth, "columnDepth");

  return Math.min(
    Math.max(columnWidth, beamWidth),
    Math.min(columnWidth, beamWidth) + columnDepth / 2,
  );
}

export function classifyNTC2018JointConfinement({
  faceCoverageRatios = {},
  oppositeBeamOverlapRatios = {},
} = {}) {
  const faceKeys = ["positiveX", "negativeX", "positiveZ", "negativeZ"];
  const overlapKeys = ["x", "z"];
  const missing = [
    ...faceKeys.filter((key) => !Number.isFinite(faceCoverageRatios[key])),
    ...overlapKeys
      .filter((key) => !Number.isFinite(oppositeBeamOverlapRatios[key]))
      .map((key) => `overlap-${key}`),
  ];

  if (missing.length > 0) {
    throw new Error(
      `Joint confinement classification requires all face and overlap ratios; missing: ${missing.join(", ")}.`,
    );
  }

  const allFacesCovered = faceKeys.every(
    (key) => faceCoverageRatios[key] >= 0.75,
  );
  const bothPairsOverlap = overlapKeys.every(
    (key) => oppositeBeamOverlapRatios[key] >= 0.75,
  );

  return {
    classification: allFacesCovered && bothPairsOverlap
      ? "fully-confined"
      : "not-fully-confined",
    fullyConfined: allFacesCovered && bothPairsOverlap,
    allFacesCovered,
    bothPairsOverlap,
    threshold: 0.75,
    faceCoverageRatios: { ...faceCoverageRatios },
    oppositeBeamOverlapRatios: { ...oppositeBeamOverlapRatios },
  };
}

export function calculateNTC2018JointShearDemand({
  jointType,
  gammaRd,
  topReinforcementArea,
  bottomReinforcementArea,
  reinforcementDesignStrength,
  columnShearAbove,
}) {
  if (!JOINT_TYPES.has(jointType)) {
    throw new Error(`Unsupported jointType: ${jointType}.`);
  }

  positive(gammaRd, "gammaRd");
  nonNegative(topReinforcementArea, "topReinforcementArea");
  nonNegative(bottomReinforcementArea, "bottomReinforcementArea");
  positive(reinforcementDesignStrength, "reinforcementDesignStrength");

  if (!Number.isFinite(columnShearAbove)) {
    throw new Error("columnShearAbove must be finite.");
  }

  const reinforcementArea = jointType === "internal"
    ? topReinforcementArea + bottomReinforcementArea
    : topReinforcementArea;
  const beamForce = gammaRd * reinforcementArea * reinforcementDesignStrength;

  return {
    demand: Math.abs(beamForce - columnShearAbove),
    beamForce,
    columnShearAbove,
    reinforcementArea,
    equation: jointType === "internal" ? "NTC2018-7.4.7" : "NTC2018-7.4.6",
  };
}

export function calculateNTC2018JointCompressionCapacity({
  jointType,
  fck,
  fcd,
  normalizedAxialForce,
  effectiveJointWidth,
  columnLongitudinalLayerDistance,
}) {
  if (!JOINT_TYPES.has(jointType)) {
    throw new Error(`Unsupported jointType: ${jointType}.`);
  }

  positive(fck, "fck");
  positive(fcd, "fcd");
  nonNegative(normalizedAxialForce, "normalizedAxialForce");
  positive(effectiveJointWidth, "effectiveJointWidth");
  positive(columnLongitudinalLayerDistance, "columnLongitudinalLayerDistance");
  const alphaJ = jointType === "internal" ? 0.6 : 0.48;
  const eta = alphaJ * (1 - fck / 250);
  const radicand = eta > 0 ? 1 - normalizedAxialForce / eta : -1;
  const capacity = eta > 0 && radicand > 0
    ? eta * fcd * effectiveJointWidth * columnLongitudinalLayerDistance *
      Math.sqrt(radicand)
    : 0;

  return {
    capacity,
    alphaJ,
    eta,
    radicand,
    equation: "NTC2018-7.4.8-7.4.9",
  };
}

export function calculateNTC2018JointTensionReinforcement({
  method,
  jointType,
  jointShearDemand,
  effectiveJointWidth,
  columnLongitudinalLayerDistance,
  beamLongitudinalLayerDistance,
  normalizedAxialForce,
  fcd,
  fctd,
  gammaRd,
  topReinforcementArea,
  bottomReinforcementArea,
  reinforcementDesignStrength,
}) {
  if (!TENSION_METHODS.has(method)) {
    throw new Error(`Unsupported joint tension method: ${method}.`);
  }

  if (!JOINT_TYPES.has(jointType)) {
    throw new Error(`Unsupported jointType: ${jointType}.`);
  }

  nonNegative(jointShearDemand, "jointShearDemand");
  positive(effectiveJointWidth, "effectiveJointWidth");
  positive(columnLongitudinalLayerDistance, "columnLongitudinalLayerDistance");
  positive(beamLongitudinalLayerDistance, "beamLongitudinalLayerDistance");
  nonNegative(normalizedAxialForce, "normalizedAxialForce");
  positive(fcd, "fcd");
  positive(fctd, "fctd");
  positive(gammaRd, "gammaRd");
  nonNegative(topReinforcementArea, "topReinforcementArea");
  nonNegative(bottomReinforcementArea, "bottomReinforcementArea");
  positive(reinforcementDesignStrength, "reinforcementDesignStrength");

  if (method === "post-cracking-truss") {
    const reinforcementArea = jointType === "internal"
      ? topReinforcementArea + bottomReinforcementArea
      : bottomReinforcementArea;
    const axialFactor = Math.max(0, 1 - 0.8 * normalizedAxialForce);

    return {
      requiredHorizontalTieForce:
        gammaRd * reinforcementArea * reinforcementDesignStrength * axialFactor,
      axialFactor,
      reinforcementArea,
      shearStress: jointShearDemand /
        (effectiveJointWidth * columnLongitudinalLayerDistance),
      equation: jointType === "internal" ? "NTC2018-7.4.11" : "NTC2018-7.4.12",
    };
  }

  const shearStress = jointShearDemand /
    (effectiveJointWidth * columnLongitudinalLayerDistance);
  const denominator = fctd + normalizedAxialForce * fcd;
  const requiredConfiningStress = Math.max(
    0,
    shearStress ** 2 / denominator - fctd,
  );

  return {
    requiredHorizontalTieForce:
      requiredConfiningStress * effectiveJointWidth * beamLongitudinalLayerDistance,
    requiredConfiningStress,
    shearStress,
    denominator,
    equation: "NTC2018-7.4.10",
  };
}

export const NTC2018_BEAM_COLUMN_JOINT_TYPES = Object.freeze([...JOINT_TYPES]);
export const NTC2018_BEAM_COLUMN_JOINT_TENSION_METHODS = Object.freeze([
  ...TENSION_METHODS,
]);
