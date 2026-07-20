import {
  calculateNTC2018MasonryPierElasticStiffness,
  calculateNTC2018MasonryPierFlexuralCapacity,
  calculateNTC2018MasonryPierSlidingCapacity,
} from "../src/norms/ntc2018/masonry/index.js";

const TOLERANCE = 1e-10;

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
}

export function runNTC2018MasonryPierValidationCampaign() {
  const flexural = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression: 300000,
    compressiveStrength: 4,
    length: 1500,
    thickness: 300,
    shearSpan: 3000,
  });
  const sigma0 = 300000 / (1500 * 300);
  const flexuralReference =
    (1500 ** 2 * 300 * sigma0 * (1 - sigma0 / (0.85 * 4))) /
    (2 * 3000);
  const sliding = calculateNTC2018MasonryPierSlidingCapacity({
    axialCompression: 1e6,
    cohesion: 0.1,
    shearStrengthLimit: 10,
    length: 1500,
    thickness: 300,
    shearSpan: 1500,
  });
  const slidingEquilibriumReference =
    sliding.cohesion * 300 * sliding.compressedLength + 0.4 * 1e6;
  const stiffness = calculateNTC2018MasonryPierElasticStiffness({
    elasticModulus: 1800,
    shearModulus: 600,
    length: 1500,
    thickness: 300,
    deformableHeight: 3000,
  });
  const stiffnessReference =
    1 / (1 / stiffness.bendingStiffness + 1 / stiffness.shearStiffness);
  const cases = [
    {
      id: "ntc-7.8.2-flexural-hand-calculation",
      actual: flexural.capacity,
      expected: flexuralReference,
      source: "NTC 2018 §7.8.2.2.1, eq. [7.8.2]",
    },
    {
      id: "ntc-7.8.3-sliding-equilibrium",
      actual: sliding.capacity,
      expected: slidingEquilibriumReference,
      source: "NTC 2018 §7.8.2.2.2, eq. [7.8.3]",
    },
    {
      id: "ntc-cracked-timoshenko-compliance",
      actual: stiffness.totalStiffness,
      expected: stiffnessReference,
      source: "NTC 2018 §7.8.1.5.2",
    },
  ].map((item) => {
    const error = relativeError(item.actual, item.expected);

    return {
      ...item,
      relativeError: error,
      tolerance: TOLERANCE,
      status: error <= TOLERANCE ? "ok" : "failed",
    };
  });

  return {
    id: "ntc2018-masonry-pier-validation-campaign-v1",
    status: cases.every((item) => item.status === "ok") ? "ok" : "failed",
    units: { force: "N", length: "mm" },
    caseCount: cases.length,
    cases,
  };
}

export function formatNTC2018MasonryPierValidationReport(campaign) {
  return [
    "# NTC 2018 masonry pier validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}`,
    ...campaign.cases.map(
      (item) =>
        `- ${item.id}: ${item.status}; relative error=${item.relativeError.toExponential(3)}; source=${item.source}`,
    ),
  ].join("\n");
}
