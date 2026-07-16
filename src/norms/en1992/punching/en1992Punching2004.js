function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }

  return value;
}

function finite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }

  return value;
}

/**
 * EN 1992-1-1:2004+A1:2014, 6.4.4 and 6.4.5.
 * Inputs use N and mm, hence stresses are returned in N/mm2 (MPa).
 *
 * Formula cross-check: European Concrete Platform, "Worked Examples to
 * Eurocode 2", 2018, example 3.4.10, pp. 82-83.
 */
export function calculateEn1992Punching2004WithoutShearReinforcement({
  fck,
  effectiveDepth,
  reinforcementRatioX,
  reinforcementRatioY,
  gammaC,
  alphaCc = 1,
  cRdc = 0.18 / gammaC,
  k1 = 0.1,
  sigmaCp = 0,
}) {
  const resolvedFck = positive(fck, "fck");
  const d = positive(effectiveDepth, "effectiveDepth");
  const rhoX = positive(reinforcementRatioX, "reinforcementRatioX");
  const rhoY = positive(reinforcementRatioY, "reinforcementRatioY");
  const resolvedGammaC = positive(gammaC, "gammaC");
  const resolvedAlphaCc = positive(alphaCc, "alphaCc");
  const resolvedCRdc = positive(cRdc, "cRdc");
  const resolvedK1 = finite(k1, "k1");
  const resolvedSigmaCp = finite(sigmaCp, "sigmaCp");
  const rawRhoL = Math.sqrt(rhoX * rhoY);
  const rhoL = Math.min(rawRhoL, 0.02);
  const k = Math.min(1 + Math.sqrt(200 / d), 2);
  const vMin = 0.035 * k ** 1.5 * Math.sqrt(resolvedFck);
  const concreteTerm = resolvedCRdc
    * k
    * Math.cbrt(100 * rhoL * resolvedFck);
  const vRdc = Math.max(
    concreteTerm + resolvedK1 * resolvedSigmaCp,
    vMin + resolvedK1 * resolvedSigmaCp,
  );
  const nu = 0.6 * (1 - resolvedFck / 250);
  const fcd = resolvedAlphaCc * resolvedFck / resolvedGammaC;
  const vRdMax = 0.5 * nu * fcd;

  return {
    fck: resolvedFck,
    effectiveDepth: d,
    reinforcementRatioX: rhoX,
    reinforcementRatioY: rhoY,
    rawReinforcementRatio: rawRhoL,
    reinforcementRatio: rhoL,
    reinforcementRatioLimit: 0.02,
    k,
    kLimit: 2,
    cRdc: resolvedCRdc,
    k1: resolvedK1,
    sigmaCp: resolvedSigmaCp,
    vMin,
    concreteTerm,
    vRdc,
    alphaCc: resolvedAlphaCc,
    gammaC: resolvedGammaC,
    nu,
    fcd,
    vRdMax,
    units: { length: "mm", stress: "N/mm2" },
    reference: {
      standard: "EN 1992-1-1:2004+A1:2014",
      clauses: ["6.4.4", "6.4.5"],
      equations: ["6.47"],
    },
  };
}

/** EN 1992-1-1:2004+A1:2014, 6.4.5, Eq. (6.52), vertical reinforcement. */
export function calculateEn1992Punching2004WithShearReinforcement({
  concreteResistance,
  effectiveDepth,
  controlPerimeter,
  radialSpacing,
  areaPerPerimeter,
  fywd,
}) {
  const vRdc = positive(concreteResistance, "concreteResistance");
  const d = positive(effectiveDepth, "effectiveDepth");
  const u1 = positive(controlPerimeter, "controlPerimeter");
  const sr = positive(radialSpacing, "radialSpacing");
  const asw = positive(areaPerPerimeter, "areaPerPerimeter");
  const resolvedFywd = positive(fywd, "fywd");
  const fywdEffective = Math.min(250 + 0.25 * d, resolvedFywd);
  const concreteContribution = 0.75 * vRdc;
  const reinforcementContribution = 1.5 * d / sr * asw * fywdEffective / (u1 * d);

  return {
    vRdCs: concreteContribution + reinforcementContribution,
    concreteContribution,
    reinforcementContribution,
    fywd: resolvedFywd,
    fywdEffective,
    effectiveDepth: d,
    controlPerimeter: u1,
    radialSpacing: sr,
    areaPerPerimeter: asw,
    units: { length: "mm", area: "mm2", stress: "N/mm2" },
    reference: {
      standard: "EN 1992-1-1:2004+A1:2014",
      clause: "6.4.5(1)",
      equation: "6.52",
    },
  };
}
