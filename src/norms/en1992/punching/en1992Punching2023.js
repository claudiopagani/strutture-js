function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }

  return value;
}

function clamp(value, lower, upper) {
  return Math.min(Math.max(value, lower), upper);
}

/**
 * EN 1992-1-1:2023, 8.4.3, closed-form resistance without punching
 * reinforcement. Inputs use N and mm; stresses are N/mm2 (MPa).
 *
 * Formula derivation and worked example: Muttoni et al., "A Mechanical
 * Approach for the Punching Shear Provisions in the Second Generation of
 * Eurocode 2", Hormigon y Acero 74 (2023), equations (10), (13), (14).
 */
export function calculateEn1992Punching2023WithoutShearReinforcement({
  fck,
  shearEffectiveDepth,
  reinforcementRatioX,
  reinforcementRatioY,
  lowerAggregateSize,
  supportPerimeter,
  controlPerimeter,
  gammaV,
}) {
  const resolvedFck = positive(fck, "fck");
  const dv = positive(shearEffectiveDepth, "shearEffectiveDepth");
  const rhoX = positive(reinforcementRatioX, "reinforcementRatioX");
  const rhoY = positive(reinforcementRatioY, "reinforcementRatioY");
  const dLower = positive(lowerAggregateSize, "lowerAggregateSize");
  const b0 = positive(supportPerimeter, "supportPerimeter");
  const b05 = positive(controlPerimeter, "controlPerimeter");
  const resolvedGammaV = positive(gammaV, "gammaV");

  if (b05 <= b0) {
    throw new Error("controlPerimeter must be greater than supportPerimeter.");
  }

  const rhoL = Math.sqrt(rhoX * rhoY);
  const aggregateStrengthFactor = Math.min((60 / resolvedFck) ** 2, 1);
  const rawDdg = 16 + dLower * aggregateStrengthFactor;
  const dDg = Math.min(rawDdg, 40);
  const rawKpb = 3.6 * Math.sqrt(1 - b0 / b05);
  const kpb = clamp(rawKpb, 1, 2.5);
  const uncappedResistance = 0.6 / resolvedGammaV
    * kpb
    * Math.cbrt(100 * rhoL * resolvedFck * dDg / dv);
  const resistanceLimit = 0.5 / resolvedGammaV * Math.sqrt(resolvedFck);
  const tauRdc = Math.min(uncappedResistance, resistanceLimit);

  return {
    fck: resolvedFck,
    shearEffectiveDepth: dv,
    reinforcementRatioX: rhoX,
    reinforcementRatioY: rhoY,
    reinforcementRatio: rhoL,
    lowerAggregateSize: dLower,
    aggregateStrengthFactor,
    rawDdg,
    dDg,
    dDgLimit: 40,
    supportPerimeter: b0,
    controlPerimeter: b05,
    rawKpb,
    kpb,
    kpbLimits: { minimum: 1, maximum: 2.5 },
    gammaV: resolvedGammaV,
    uncappedResistance,
    resistanceLimit,
    tauRdc,
    units: { length: "mm", stress: "N/mm2" },
    reference: {
      standard: "EN 1992-1-1:2023",
      clause: "8.4.3",
      backgroundEquations: ["10", "13", "14"],
    },
  };
}
