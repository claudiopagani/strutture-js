export const NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES = Object.freeze({
  newOrdinaryFlexural: "NTC 2018, §7.8.2.2.1",
  newOrdinaryShear: "NTC 2018, §7.8.2.2.2",
  existingFlexural: "Circolare 2019, §C8.7.1.3.1.1",
  existingSliding: "Circolare 2019, §C8.7.1.3.1.1",
  existingDiagonal: "Circolare 2019, §C8.7.1.3.1.1",
});

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive value.`);
  }
}

export function calculateNTC2018MasonryPierUltimateDisplacement({
  height,
  mechanism,
  scope = "existing",
  modernPerforatedBlocks = false,
}) {
  assertPositive(height, "height");

  if (scope !== "existing" && scope !== "new-ordinary") {
    throw new Error(`Unsupported masonry pier normative scope: ${scope}.`);
  }

  const isFlexural = mechanism === "flexural";
  const isSliding = mechanism === "bed-joint-sliding";
  const isDiagonal = String(mechanism).startsWith("diagonal-cracking");

  if (!isFlexural && !isSliding && !isDiagonal) {
    throw new Error(`Unsupported masonry pier failure mechanism: ${mechanism}.`);
  }

  let driftCapacity;
  let reference;

  if (scope === "new-ordinary") {
    driftCapacity = isFlexural ? 0.01 : 0.005;
    reference = isFlexural
      ? NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.newOrdinaryFlexural
      : NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.newOrdinaryShear;
  } else if (isFlexural) {
    driftCapacity = 0.01;
    reference = NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.existingFlexural;
  } else if (isSliding) {
    driftCapacity = 0.005;
    reference = NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.existingSliding;
  } else {
    driftCapacity = modernPerforatedBlocks ? 0.004 : 0.005;
    reference = NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES.existingDiagonal;
  }

  return {
    mechanism,
    scope,
    driftCapacity,
    ultimateDisplacement: driftCapacity * height,
    height,
    modernPerforatedBlocks: Boolean(modernPerforatedBlocks),
    reference,
  };
}
