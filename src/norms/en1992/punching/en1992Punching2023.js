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

/**
 * EN 1992-1-1:2023, 8.4.4, vertical studs or links.
 * Formula background: Muttoni et al. (2023), equations (17)-(20).
 */
export function calculateEn1992Punching2023WithShearReinforcement({
  concreteResistance,
  actingStress,
  shearEffectiveDepth,
  dDg,
  kpb,
  legArea,
  radialSpacing,
  tangentialSpacing,
  legDiameter,
  fywd,
  system,
  supportPerimeter,
}) {
  const tauRdc = positive(concreteResistance, "concreteResistance");
  const tauEd = positive(actingStress, "actingStress");
  const dv = positive(shearEffectiveDepth, "shearEffectiveDepth");
  const resolvedDdg = positive(dDg, "dDg");
  const resolvedKpb = positive(kpb, "kpb");
  const asw = positive(legArea, "legArea");
  const sr = positive(radialSpacing, "radialSpacing");
  const st = positive(tangentialSpacing, "tangentialSpacing");
  const diameter = positive(legDiameter, "legDiameter");
  const resolvedFywd = positive(fywd, "fywd");
  const b0 = positive(supportPerimeter, "supportPerimeter");

  if (!["studs", "links"].includes(system)) {
    throw new Error("system must be studs or links.");
  }

  const etaC = Math.min(tauRdc / tauEd, 1);
  const rhoW = asw / (sr * st);
  const rawEtaS = Math.sqrt(15 * resolvedDdg / dv)
    * (1 / (etaC * resolvedKpb)) ** 1.5
    + dv / (150 * diameter);
  const etaS = Math.min(rawEtaS, 0.8);
  const concreteContribution = etaC * tauRdc;
  const reinforcementContribution = etaS * rhoW * resolvedFywd;
  const minimumResistance = rhoW * resolvedFywd;
  const tauRdCs = Math.max(
    concreteContribution + reinforcementContribution,
    minimumResistance,
  );
  const rawEtaSys = (system === "studs" ? 0.7 : 0.5)
    + 0.63 * (b0 / dv) ** 0.25;
  const etaSys = Math.max(1, rawEtaSys);

  return {
    tauRdCs,
    tauRdMax: etaSys * tauRdc,
    concreteContribution,
    reinforcementContribution,
    minimumResistance,
    etaC,
    rawEtaS,
    etaS,
    etaSLimit: 0.8,
    rhoW,
    rawEtaSys,
    etaSys,
    system,
    fywd: resolvedFywd,
    units: { length: "mm", area: "mm2", stress: "N/mm2" },
    reference: {
      standard: "EN 1992-1-1:2023",
      clause: "8.4.4",
      equations: ["8.104", "8.105", "8.106", "8.109", "8.110", "8.111"],
    },
  };
}
