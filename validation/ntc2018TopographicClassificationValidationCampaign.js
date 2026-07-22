import {
  classifyNTC2018Topography,
} from "../src/norms/ntc2018/index.js";

function buildGrid(elevationAt) {
  const gridSize = 101;
  const radiusM = 500;
  const spacingM = 10;
  const points = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const northOffsetM = radiusM - row * spacingM;
      const eastOffsetM = -radiusM + col * spacingM;
      const elevationM = elevationAt(eastOffsetM, northOffsetM);

      points.push({
        row,
        col,
        northOffsetM,
        eastOffsetM,
        elevationM,
        source: "analytic-validation-surface",
        sourceResolutionM: 10,
        samplingMethod: "analytic",
        nodata: false,
      });
    }
  }

  return {
    center: { latitudeDeg: 43, longitudeDeg: 11 },
    radiusM,
    extentM: radiusM * 2,
    gridSize,
    spacingM,
    points,
    provenance: {
      kind: "documented-study",
      reference: "Analytic validation surfaces",
    },
  };
}

function equalityCase({ id, actual, expected, source }) {
  return {
    id,
    actual,
    expected,
    source,
    status: actual === expected ? "ok" : "failed",
  };
}

export function runNTC2018TopographicClassificationValidationCampaign() {
  const flat = classifyNTC2018Topography({
    terrainGrid: buildGrid(() => 200),
  });
  const plane = classifyNTC2018Topography({
    terrainGrid: buildGrid(
      (eastOffsetM) =>
        220 + Math.tan((20 * Math.PI) / 180) * eastOffsetM,
    ),
  });
  const ridge = classifyNTC2018Topography({
    terrainGrid: buildGrid(
      (eastOffsetM, northOffsetM) =>
        200 +
        240 *
          Math.exp(-(eastOffsetM ** 2) / (2 * 40 ** 2)) *
          Math.exp(-(northOffsetM ** 2) / (2 * 260 ** 2)),
    ),
  });
  const planeSlopeDeg = plane.outputs.classification.slopeDeg;
  const cases = [
    equalityCase({
      id: "analytic-horizontal-plane-category",
      actual: flat.outputs.classification.class,
      expected: "T1",
      source: "Analytic horizontal plane and NTC 2018 Table 3.2.III",
    }),
    equalityCase({
      id: "analytic-20-degree-plane-category",
      actual: plane.outputs.classification.class,
      expected: "T2",
      source: "Analytic 20 degree plane and NTC 2018 Table 3.2.III",
    }),
    {
      id: "analytic-20-degree-plane-slope",
      actual: planeSlopeDeg,
      expected: 20,
      absoluteError: Math.abs(planeSlopeDeg - 20),
      tolerance: 0.5,
      source: "Analytic plane gradient",
      status: Math.abs(planeSlopeDeg - 20) <= 0.5 ? "ok" : "failed",
    },
    equalityCase({
      id: "analytic-high-ridge-category",
      actual: ridge.outputs.classification.class,
      expected: "T4",
      source:
        "Mascandola et al. (2021) ridge, TPI and elevation-range criteria",
    }),
    equalityCase({
      id: "analytic-high-ridge-h60",
      actual: ridge.outputs.classification.h60Center,
      expected: true,
      source: "Analytic Gaussian ridge with local elevation range above 60 m",
    }),
  ];

  return {
    id: "ntc2018-topographic-classification-validation-campaign-v1",
    status: [flat, plane, ridge].every((result) => result.status === "ok") &&
      cases.every((item) => item.status === "ok")
      ? "ok"
      : "failed",
    units: { elevation: "m", distance: "m", slope: "deg" },
    caseCount: cases.length,
    references: [
      "D.M. 17 gennaio 2018, NTC 2018, Tables 3.2.III and 3.2.V",
      "Mascandola et al. (2021), DOI 10.1016/j.soildyn.2021.106848",
    ],
    cases,
  };
}

export function formatNTC2018TopographicClassificationValidationReport(
  campaign,
) {
  return [
    "# NTC 2018 topographic classification validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}`,
    ...campaign.cases.map(
      (item) =>
        `- ${item.id}: ${item.status}; actual=${item.actual}; expected=${item.expected}; source=${item.source}`,
    ),
  ].join("\n");
}
