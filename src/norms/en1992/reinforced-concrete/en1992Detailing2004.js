function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function factor(value, label) {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${label} must be in (0, 1].`);
  }

  return value;
}

/** EN 1992-1-1:2004, 8.4.2, Expression (8.2). */
export function calculateEn1992DesignBondStrength({
  fctd,
  barDiameter,
  bondConditionFactor = 1,
} = {}) {
  positive(fctd, "fctd");
  positive(barDiameter, "barDiameter");
  factor(bondConditionFactor, "bondConditionFactor");
  const diameterFactor = barDiameter <= 32 ? 1 : (132 - barDiameter) / 100;

  if (diameterFactor <= 0) {
    throw new Error("EN 1992 bond strength requires barDiameter < 132 mm.");
  }

  return {
    fbd: 2.25 * bondConditionFactor * diameterFactor * fctd,
    eta1: bondConditionFactor,
    eta2: diameterFactor,
    reference: "EN1992-1-1:2004-8.4.2-(8.2)",
  };
}

/** EN 1992-1-1:2004, 8.4.3-8.4.4, Expressions (8.3), (8.4), (8.6). */
export function calculateEn1992AnchorageLength({
  barDiameter,
  designSteelStress,
  fbd,
  tension = true,
  alpha1 = 1,
  alpha2 = 1,
  alpha3 = 1,
  alpha4 = 1,
  alpha5 = 1,
  nationalMinimumDiameterMultiple = null,
  nationalMinimumLength = null,
} = {}) {
  positive(barDiameter, "barDiameter");
  positive(designSteelStress, "designSteelStress");
  positive(fbd, "fbd");
  const alphas = [alpha1, alpha2, alpha3, alpha4, alpha5].map((value, index) =>
    factor(value, `alpha${index + 1}`));
  const basicRequiredLength =
    (barDiameter / 4) * (designSteelStress / fbd);
  const minimumLength = tension
    ? Math.max(0.3 * basicRequiredLength, 10 * barDiameter, 100)
    : Math.max(0.6 * basicRequiredLength, 10 * barDiameter, 100);
  const codeDesignLength = Math.max(
    minimumLength,
    alphas.reduce((value, alpha) => value * alpha, basicRequiredLength),
  );
  const nationalMinimum = Math.max(
    nationalMinimumDiameterMultiple == null
      ? 0
      : positive(nationalMinimumDiameterMultiple, "nationalMinimumDiameterMultiple") *
        barDiameter,
    nationalMinimumLength == null
      ? 0
      : positive(nationalMinimumLength, "nationalMinimumLength"),
  );

  return {
    basicRequiredLength,
    minimumLength,
    nationalMinimum,
    designLength: Math.max(codeDesignLength, nationalMinimum),
    tension,
    alphaFactors: {
      alpha1,
      alpha2,
      alpha3,
      alpha4,
      alpha5,
    },
    reference: "EN1992-1-1:2004-8.4.3-8.4.4",
  };
}

/** EN 1992-1-1:2004, 6.7, Expression (6.63). */
export function calculateEn1992LocalBearingResistance({
  loadedArea,
  distributionArea,
  fcd,
  resistanceReductionFactor = 1,
} = {}) {
  positive(loadedArea, "loadedArea");
  positive(distributionArea, "distributionArea");
  positive(fcd, "fcd");
  factor(resistanceReductionFactor, "resistanceReductionFactor");

  if (distributionArea < loadedArea) {
    throw new Error("distributionArea must not be smaller than loadedArea.");
  }

  const enhancement = Math.min(3, Math.sqrt(distributionArea / loadedArea));

  return {
    enhancement,
    resistance:
      resistanceReductionFactor * loadedArea * fcd * enhancement,
    resistanceReductionFactor,
    reference: "EN1992-1-1:2004-6.7-(6.63)",
  };
}

/** EN 1992-1-1:2004, 7.4.3(6), Expression (7.21). */
export function calculateEn1992ShrinkageCurvature({
  freeShrinkageStrain,
  reinforcementElasticModulus,
  effectiveConcreteModulus,
  reinforcementFirstMoment,
  sectionSecondMoment,
} = {}) {
  if (!Number.isFinite(freeShrinkageStrain)) {
    throw new Error("freeShrinkageStrain must be finite.");
  }

  positive(reinforcementElasticModulus, "reinforcementElasticModulus");
  positive(effectiveConcreteModulus, "effectiveConcreteModulus");

  if (!Number.isFinite(reinforcementFirstMoment)) {
    throw new Error("reinforcementFirstMoment must be finite.");
  }

  positive(sectionSecondMoment, "sectionSecondMoment");
  const effectiveModularRatio =
    reinforcementElasticModulus / effectiveConcreteModulus;

  return {
    curvature:
      freeShrinkageStrain * effectiveModularRatio *
      reinforcementFirstMoment / sectionSecondMoment,
    effectiveModularRatio,
    reference: "EN1992-1-1:2004-7.4.3-(7.21)",
  };
}
