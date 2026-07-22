import {
  calculateNTC2018ImposedLoadAreaReduction,
  calculateNTC2018ImposedLoadMultiStoreyReduction,
  getNTC2018ActionPartialFactors,
  resolveNTC2018ImposedLoadDefinition,
} from "../src/norms/ntc2018/index.js";

const units = { force: "kN", length: "m" };

function numericCase({ id, actual, expected, source, tolerance = 1e-12 }) {
  const absoluteError = Math.abs(actual - expected);

  return {
    id,
    actual,
    expected,
    absoluteError,
    tolerance,
    source,
    status: absoluteError <= tolerance ? "ok" : "failed",
  };
}

export function runNTC2018ImposedLoadsValidationCampaign() {
  const office = resolveNTC2018ImposedLoadDefinition({
    definitionId: "B2-public-offices",
    units,
  });
  const vehicles = resolveNTC2018ImposedLoadDefinition({
    definitionId: "F-light-vehicles",
    units,
  });
  const areaA = calculateNTC2018ImposedLoadAreaReduction({
    category: "A",
    influenceArea: 50,
    units,
  });
  const areaC = calculateNTC2018ImposedLoadAreaReduction({
    category: "C",
    influenceArea: 1000,
    units,
  });
  const storeysB = calculateNTC2018ImposedLoadMultiStoreyReduction({
    category: "B",
    loadedStoreys: 5,
  });
  const variableFactors = getNTC2018ActionPartialFactors({
    nature: "variable",
    family: "imposed",
  });
  const cases = [
    numericCase({
      id: "table-3.1.II-B2-qk",
      actual: office.qk,
      expected: 3,
      source: "NTC 2018 Table 3.1.II, category B2",
    }),
    numericCase({
      id: "table-3.1.II-B2-Qk",
      actual: office.Qk,
      expected: 2,
      source: "NTC 2018 Table 3.1.II, category B2",
    }),
    numericCase({
      id: "table-3.1.II-B2-Hk",
      actual: office.Hk,
      expected: 1,
      source: "NTC 2018 Table 3.1.II, category B2",
    }),
    numericCase({
      id: "table-3.1.II-F-concentrated-load-count",
      actual: vehicles.application.Qk.count,
      expected: 2,
      source: "NTC 2018 section 3.1.4.2, category F",
    }),
    numericCase({
      id: "equation-3.1.1-category-A",
      actual: areaA.alphaA,
      expected: 0.7,
      source: "Independent substitution in NTC 2018 equation 3.1.1",
    }),
    numericCase({
      id: "equation-3.1.1-category-C-minimum",
      actual: areaC.alphaA,
      expected: 0.6,
      source: "NTC 2018 equation 3.1.1 and category C lower bound",
    }),
    numericCase({
      id: "equation-3.1.2-category-B-five-storeys",
      actual: storeysB.alphaN,
      expected: 0.82,
      source: "Independent substitution in NTC 2018 equation 3.1.2",
    }),
    numericCase({
      id: "table-2.6.I-variable-A2",
      actual: variableFactors.A2.unfavourable,
      expected: 1.3,
      source: "NTC 2018 Table 2.6.I",
    }),
  ];

  return {
    id: "ntc2018-imposed-loads-validation-campaign-v1",
    status: cases.every((item) => item.status === "ok") ? "ok" : "failed",
    units: { qk: "kN/m^2", Qk: "kN", Hk: "kN/m" },
    caseCount: cases.length,
    references: [
      "D.M. 17 gennaio 2018, NTC 2018, Tables 2.6.I and 3.1.II",
      "D.M. 17 gennaio 2018, NTC 2018, equations 3.1.1 and 3.1.2",
    ],
    cases,
  };
}

export function formatNTC2018ImposedLoadsValidationReport(campaign) {
  return [
    "# NTC 2018 imposed loads validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}`,
    ...campaign.cases.map(
      (item) =>
        `- ${item.id}: ${item.status}; actual=${item.actual}; expected=${item.expected}; source=${item.source}`,
    ),
  ].join("\n");
}
