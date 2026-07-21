import {
  DeepFoundationModel,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  LateralPileCapacityAnalysis,
  LateralPileLoadScenario,
  SoilMaterial,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const source =
  "FHWA GEC 9, FHWA-HIF-18-031 (2018), section 6.5, equations 6-8 through 6-17";

function readPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function evaluateCase(definition) {
  const output = definition.evaluate();
  const checks = definition.expectations.map((expectation) => {
    const actual = readPath(output, expectation.path);
    const passed = Number.isFinite(actual) &&
      Math.abs(actual - expectation.expected) <= expectation.tolerance;
    return {
      id: expectation.id,
      actual,
      expected: expectation.expected,
      tolerance: expectation.tolerance,
      units: expectation.units ?? null,
      status: passed ? "ok" : "failed",
    };
  });
  return {
    id: definition.id,
    title: definition.title,
    source: definition.source,
    sourceKind: definition.sourceKind,
    assumptions: [...definition.assumptions],
    status: checks.every(({ status }) => status === "ok") ? "ok" : "failed",
    checks,
  };
}

function analyze({
  id,
  drainage,
  strength,
  bulkUnitWeight,
  saturatedUnitWeight = bulkUnitWeight,
  groundwater = { model: "none" },
  diameter,
  embedment,
  lateralShear,
  overturningMoment,
  soilBranch,
  resistanceConversion = null,
}) {
  const material = new SoilMaterial({
    id: `${id}-soil`,
    name: `${id}-soil`,
    unitWeight: {
      bulk: bulkUnitWeight,
      saturated: saturatedUnitWeight,
    },
    parameterSets: [{
      id: `${id}-parameters`,
      basis: "characteristic",
      drainage,
      strength,
      provenance: { source: "validation-input" },
    }],
    angleUnits: drainage === "drained" ? "deg" : null,
    units,
  });
  const profile = new GroundProfile({
    id: `${id}-profile`,
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [{
      id: `${id}-layer`,
      topElevation: 0,
      bottomElevation: -30,
      materialId: material.id,
    }],
    groundwater,
    units,
  });
  const groundModel = new GroundModel({
    id: `${id}-ground`,
    materials: [material],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: `${id}-uls`,
    groundModel,
    limitState: "ULS",
    drainageCondition: drainage,
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    units,
  });
  const pile = new DeepFoundationModel({
    id: `${id}-pile`,
    geometry: { model: "circular", diameter },
    placement: {
      headElevation: 0,
      soilContactTopElevation: 0,
      toeElevation: -embedment,
    },
    construction: {
      installationMethod: "assigned-validation-method",
      structuralMaterial: "assigned-validation-material",
      displacementClass: "not-classified",
    },
    units,
  });
  const scenario = new LateralPileLoadScenario({
    id: `${id}-scenario`,
    soilBranch,
    action: {
      lateralShear,
      overturningMoment,
      referencePoint: "groundline-at-pile-axis",
    },
    behaviorAssertion: {
      classification: "short-rigid",
      provenance: { source: "validation-project-assessment" },
    },
    resistanceConversion,
    units,
  });
  return new LateralPileCapacityAnalysis().analyze({
    groundModel,
    designSituation,
    pile,
    scenario,
    units,
  }).outputs;
}

function cases() {
  const cohesiveCapacity = 300.42941494121806;
  const cohesiveF = 75 / (9 * 40 * 0.8);
  const cohesiveMoment = 30 + 75 * (1.5 * 0.8 + cohesiveF / 2);
  const cohesiveG = Math.sqrt(cohesiveMoment / (2.25 * 40 * 0.8));
  const sandF = Math.sqrt(100 / (1.5 * 18 * 3));
  const sandMaximumMoment = 50 + 100 * sandF - 18 * 3 * sandF ** 3 / 2;

  return [{
    id: "broms-cohesive-short-pile",
    title: "Cohesive free-head short pile",
    source,
    sourceKind: "independent-closed-form-recalculation",
    assumptions: [
      "B=0.8 m, L=5 m, su=40 kPa, Pt=75 kN and Mt=30 kN.m.",
      "The positive capacity root is evaluated independently from equations 6-8 through 6-12.",
    ],
    evaluate: () => analyze({
      id: "cohesive",
      drainage: "undrained",
      strength: {
        model: "total-stress-undrained",
        undrainedShearStrength: 40,
      },
      bulkUnitWeight: 18,
      diameter: 0.8,
      embedment: 5,
      lateralShear: 75,
      overturningMoment: 30,
      soilBranch: "cohesive-undrained",
    }),
    expectations: [
      { id: "f", path: "mechanism.nominal.response.f", expected: cohesiveF, tolerance: 1e-10, units: "m" },
      { id: "maximum-moment", path: "mechanism.nominal.response.maximumMoment", expected: cohesiveMoment, tolerance: 1e-9, units: "kN.m" },
      { id: "g", path: "mechanism.nominal.response.g", expected: cohesiveG, tolerance: 1e-10, units: "m" },
      { id: "nominal-capacity", path: "capacity.nominalLateralResistance", expected: cohesiveCapacity, tolerance: 1e-8, units: "kN" },
    ],
  }, {
    id: "broms-cohesionless-short-pile",
    title: "Cohesionless free-head short pile with explicit conversion",
    source,
    sourceKind: "independent-closed-form-recalculation",
    assumptions: [
      "B=1 m, L=5 m, gamma'=18 kN/m3, phi'=30 degrees, Kp=3, Pt=100 kN and Mt=50 kN.m.",
      "The assigned conversion factor 0.8 scales the ultimate soil reaction; it is not a normative preset.",
    ],
    evaluate: () => analyze({
      id: "cohesionless",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 30,
        cohesion: 0,
      },
      bulkUnitWeight: 18,
      diameter: 1,
      embedment: 5,
      lateralShear: 100,
      overturningMoment: 50,
      soilBranch: "cohesionless-drained",
      resistanceConversion: {
        model: "soil-reaction-factor",
        factor: 0.8,
        provenance: { source: "validation-assigned-factor" },
      },
    }),
    expectations: [
      { id: "passive-coefficient", path: "soil.parameters.passiveCoefficient", expected: 3, tolerance: 1e-12 },
      { id: "f", path: "mechanism.nominal.response.f", expected: sandF, tolerance: 1e-10, units: "m" },
      { id: "maximum-moment", path: "mechanism.nominal.response.maximumMoment", expected: sandMaximumMoment, tolerance: 1e-9, units: "kN.m" },
      { id: "nominal-capacity", path: "capacity.nominalLateralResistance", expected: 665, tolerance: 1e-10, units: "kN" },
      { id: "converted-capacity", path: "capacity.convertedLateralResistance", expected: 530, tolerance: 1e-10, units: "kN" },
    ],
  }, {
    id: "broms-submerged-cohesionless-pile",
    title: "Cohesionless pile with groundwater at ground surface",
    source,
    sourceKind: "independent-effective-weight-recalculation",
    assumptions: [
      "B=0.6 m, L=4 m, gamma_sat=21 kN/m3, gamma_w=9.81 kN/m3, phi'=30 degrees and Mt=0.",
      "The full embedment is submerged, so gamma'=11.19 kN/m3 is used.",
    ],
    evaluate: () => analyze({
      id: "submerged",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 30,
        cohesion: 0,
      },
      bulkUnitWeight: 18,
      saturatedUnitWeight: 21,
      groundwater: {
        model: "hydrostatic",
        waterTableElevation: 0,
        waterUnitWeight: 9.81,
      },
      diameter: 0.6,
      embedment: 4,
      lateralShear: 50,
      overturningMoment: 0,
      soilBranch: "cohesionless-drained",
    }),
    expectations: [
      { id: "effective-unit-weight", path: "soil.parameters.effectiveUnitWeight", expected: 11.19, tolerance: 1e-12, units: "kN/m3" },
      { id: "nominal-capacity", path: "capacity.nominalLateralResistance", expected: 161.136, tolerance: 1e-9, units: "kN" },
    ],
  }];
}

export function runGeotechnicalLateralPileValidationCampaign() {
  const results = cases().map(evaluateCase);
  const passed = results.filter(({ status }) => status === "ok").length;
  return {
    id: "geotechnical-lateral-pile-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalLateralPileValidationReport(campaign) {
  const lines = [
    "# Geotechnical lateral-pile validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}; passed: ${campaign.passed}; failed: ${campaign.failed}`,
    "",
  ];
  for (const caseResult of campaign.results) {
    lines.push(`- ${caseResult.id}: ${caseResult.status} (${caseResult.source})`);
  }
  return lines.join("\n");
}
