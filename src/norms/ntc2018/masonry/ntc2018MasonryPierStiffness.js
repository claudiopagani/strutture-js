export const NTC2018_MASONRY_PIER_STIFFNESS_REFERENCE =
  "NTC 2018, §7.8.1.5.2: deformabilità flessionale e a taglio; rigidezze fessurate, assumibili pari a metà delle non fessurate in assenza di valutazioni accurate";

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive value.`);
  }
}

export function calculateNTC2018MasonryPierElasticStiffness({
  elasticModulus,
  shearModulus,
  length,
  thickness,
  deformableHeight,
  boundaryCondition = "cantilever",
  shearCorrectionFactor = 5 / 6,
  crackedStiffnessFactor = 0.5,
}) {
  assertPositive(elasticModulus, "elasticModulus");
  assertPositive(shearModulus, "shearModulus");
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(deformableHeight, "deformableHeight");
  assertPositive(shearCorrectionFactor, "shearCorrectionFactor");
  assertPositive(crackedStiffnessFactor, "crackedStiffnessFactor");

  if (crackedStiffnessFactor > 1) {
    throw new Error("crackedStiffnessFactor cannot exceed 1.");
  }

  if (boundaryCondition !== "cantilever" && boundaryCondition !== "fixed-fixed") {
    throw new Error(`Unsupported boundaryCondition: ${boundaryCondition}.`);
  }

  const area = length * thickness;
  const inertia = (thickness * length ** 3) / 12;
  const bendingCoefficient = boundaryCondition === "fixed-fixed" ? 12 : 3;
  const bendingStiffness =
    (crackedStiffnessFactor * bendingCoefficient * elasticModulus * inertia) /
    deformableHeight ** 3;
  const shearStiffness =
    (crackedStiffnessFactor * shearCorrectionFactor * shearModulus * area) /
    deformableHeight;
  const totalStiffness =
    1 / (1 / bendingStiffness + 1 / shearStiffness);

  return {
    totalStiffness,
    bendingStiffness,
    shearStiffness,
    bendingCompliance: 1 / bendingStiffness,
    shearCompliance: 1 / shearStiffness,
    area,
    inertia,
    deformableHeight,
    boundaryCondition,
    bendingCoefficient,
    shearCorrectionFactor,
    crackedStiffnessFactor,
    reference: NTC2018_MASONRY_PIER_STIFFNESS_REFERENCE,
  };
}
