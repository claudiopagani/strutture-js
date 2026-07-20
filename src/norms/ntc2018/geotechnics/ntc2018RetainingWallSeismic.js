const NTC2018_RETAINING_WALL_REFERENCE =
  "D.M. 17/01/2018, NTC 2018, section 7.11.6.2.1";

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative.`);
  }
  return value;
}

export const NTC2018_RETAINING_WALL_SEISMIC_REFERENCE =
  NTC2018_RETAINING_WALL_REFERENCE;

export function calculateNTC2018RetainingWallSeismicCoefficients({
  maximumSiteAccelerationRatio,
  betaM,
} = {}) {
  const accelerationRatio = finiteNonNegative(
    Number(maximumSiteAccelerationRatio),
    "maximumSiteAccelerationRatio",
  );
  const reduction = finiteNonNegative(Number(betaM), "betaM");
  if (reduction > 1) {
    throw new Error("betaM must not exceed 1.");
  }

  const kh = reduction * accelerationRatio;
  const verticalMagnitude = 0.5 * kh;

  return {
    kh,
    verticalMagnitude,
    verticalCases: [
      {
        id: "reduced-effective-gravity",
        kv: verticalMagnitude,
        convention:
          "positive-kv-reduces-effective-gravity-through-factor-1-minus-kv",
      },
      {
        id: "increased-effective-gravity",
        kv: -verticalMagnitude,
        convention:
          "negative-kv-increases-effective-gravity-through-factor-1-minus-kv",
      },
    ],
    input: {
      maximumSiteAccelerationRatio: accelerationRatio,
      betaM: reduction,
    },
    metadata: {
      code: "NTC2018",
      reference: NTC2018_RETAINING_WALL_REFERENCE,
      betaMSource: "explicit-input",
      accelerationRatioSource: "explicit-input",
    },
  };
}

export function createNTC2018MononobeOkabeSeismicInput({
  verticalCase,
  distributionModel = "resultant-only",
  ...input
} = {}) {
  const coefficients = calculateNTC2018RetainingWallSeismicCoefficients(input);
  const selected = coefficients.verticalCases.find(({ id }) => id === verticalCase);
  if (!selected) {
    throw new Error(
      `verticalCase must be one of: ${coefficients.verticalCases.map(({ id }) => id).join(", ")}.`,
    );
  }

  return {
    kh: coefficients.kh,
    kv: selected.kv,
    distributionModel,
    metadata: {
      ...coefficients.metadata,
      verticalCase: selected.id,
      verticalConvention: selected.convention,
    },
  };
}
