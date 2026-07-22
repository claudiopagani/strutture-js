import {
  calculateNTC2018HorizontalElasticSpectrum,
} from "../src/norms/ntc2018/index.js";

const TOLERANCE = 1e-12;

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
}

export function runNTC2018SeismicActionValidationCampaign() {
  const agOverG = 0.25;
  const f0 = 2.5;
  const tcStar = 0.35;
  const expectedSs = 1.4 - 0.4 * f0 * agOverG;
  const expectedCc = 1.1 * tcStar ** -0.2;
  const expectedTc = expectedCc * tcStar;
  const expectedTb = expectedTc / 3;
  const expectedTd = 4 * agOverG + 1.6;
  const expectedPlateau = agOverG * expectedSs * f0;
  const periods = [0, expectedTb, 1, expectedTd, 4];
  const result = calculateNTC2018HorizontalElasticSpectrum({
    hazardParameters: {
      siteReference: "independent-validation-site",
      limitState: "SLV",
      returnPeriodYears: 475,
      ag: agOverG,
      agUnit: "g",
      f0,
      tcStar,
      tcStarUnit: "s",
      source: {
        kind: "documented-study",
        reference: "Independent NTC 2018 arithmetic fixture",
      },
    },
    subsoilCategory: "B",
    topographicCategory: "T1",
    periods,
  });
  const parameters = result.outputs.spectrumParameters;
  const points = result.outputs.spectrum.points;
  const expectedValues = [
    agOverG * expectedSs,
    expectedPlateau,
    expectedPlateau * expectedTc,
    expectedPlateau * expectedTc / expectedTd,
    expectedPlateau * expectedTc * expectedTd / 4 ** 2,
  ];
  const rawCases = [
    {
      id: "ntc-3.2.iv-category-b-ss",
      actual: parameters.ss,
      expected: expectedSs,
      source: "NTC 2018 §3.2.3.2.1, Table 3.2.IV",
    },
    {
      id: "ntc-3.2.iv-category-b-cc",
      actual: parameters.cc,
      expected: expectedCc,
      source: "NTC 2018 §3.2.3.2.1, Table 3.2.IV",
    },
    ...points.map((point, index) => ({
      id: `ntc-3.2.2-horizontal-spectrum-${point.branch}-${index + 1}`,
      actual: point.value,
      expected: expectedValues[index],
      source: "NTC 2018 §3.2.3.2.1, equations [3.2.2]-[3.2.7]",
    })),
  ];
  const cases = rawCases.map((item) => {
    const error = relativeError(item.actual, item.expected);

    return {
      ...item,
      relativeError: error,
      tolerance: TOLERANCE,
      status: error <= TOLERANCE ? "ok" : "failed",
    };
  });

  return {
    id: "ntc2018-seismic-action-validation-campaign-v1",
    status: result.status === "ok" && cases.every(
      (item) => item.status === "ok",
    )
      ? "ok"
      : "failed",
    units: { acceleration: "g", period: "s" },
    caseCount: cases.length,
    cases,
  };
}

export function formatNTC2018SeismicActionValidationReport(campaign) {
  return [
    "# NTC 2018 seismic action validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}`,
    ...campaign.cases.map(
      (item) =>
        `- ${item.id}: ${item.status}; relative error=${item.relativeError.toExponential(3)}; source=${item.source}`,
    ),
  ].join("\n");
}
