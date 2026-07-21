import {
  AxialPileCapacityAnalysis,
  AxialPileLoadScenario,
  DeepFoundationModel,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  SoilMaterial,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const source =
  "USACE EM 1110-2-2906 (1991), paragraphs 4-3a(1)-(4), axial pile capacity";

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

function material({ id, drainage, bulk, saturated, strength }) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk, saturated },
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
}

function pile(diameter = 1) {
  return new DeepFoundationModel({
    id: "validation-pile",
    geometry: { model: "circular", diameter },
    placement: {
      headElevation: 0,
      soilContactTopElevation: 0,
      toeElevation: -10,
    },
    construction: {
      installationMethod: "assigned-validation-method",
      structuralMaterial: "assigned-validation-material",
      displacementClass: "not-classified",
    },
    units,
  });
}

function analyze({ materials, layers, groundwater, designDrainage, scenario, pileModel }) {
  const profile = new GroundProfile({
    id: "validation-profile",
    groundSurfaceElevation: 0,
    materials,
    layers,
    groundwater,
    units,
  });
  const groundModel = new GroundModel({
    id: "validation-ground",
    materials,
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "validation-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: designDrainage,
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    units,
  });
  return new AxialPileCapacityAnalysis().analyze({
    groundModel,
    designSituation,
    pile: pileModel,
    scenario,
    units,
  }).outputs;
}

function drainedLayeredOutput() {
  const upper = material({
    id: "upper-sand",
    drainage: "drained",
    bulk: 18,
    saturated: 20,
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 32,
      cohesion: 0,
    },
  });
  const lower = material({
    id: "lower-sand",
    drainage: "drained",
    bulk: 19,
    saturated: 22,
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 34,
      cohesion: 0,
    },
  });
  const scenario = new AxialPileLoadScenario({
    id: "layered-compression",
    surfaceSurcharge: 10,
    shaftResistanceByLayer: {
      upper: {
        method: "effective-stress",
        beta: 0.25,
        provenance: { source: "validation-assigned-beta" },
      },
      lower: {
        method: "effective-stress",
        beta: 0.3,
        provenance: { source: "validation-assigned-beta" },
      },
    },
    baseResistance: {
      method: "effective-stress-nq",
      bearingLayerId: "lower",
      bearingCapacityFactor: 20,
      provenance: { source: "validation-assigned-Nq" },
    },
    units,
  });
  return analyze({
    materials: [upper, lower],
    layers: [{
      id: "upper",
      topElevation: 0,
      bottomElevation: -4,
      materialId: upper.id,
    }, {
      id: "lower",
      topElevation: -4,
      bottomElevation: -15,
      materialId: lower.id,
    }],
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: -2,
      waterUnitWeight: 10,
    },
    designDrainage: "drained",
    scenario,
    pileModel: pile(),
  });
}

function undrainedCompressionOutput() {
  const clay = material({
    id: "clay",
    drainage: "undrained",
    bulk: 18,
    saturated: 20,
    strength: {
      model: "total-stress-undrained",
      undrainedShearStrength: 50,
    },
  });
  const scenario = new AxialPileLoadScenario({
    id: "undrained-compression",
    shaftResistanceByLayer: {
      clay: {
        method: "alpha-undrained",
        adhesionFactor: 0.6,
        provenance: { source: "validation-assigned-alpha" },
      },
    },
    baseResistance: {
      method: "undrained-nc",
      bearingLayerId: "clay",
      bearingCapacityFactor: 9,
      provenance: { source: "validation-assigned-Nc" },
    },
    units,
  });
  return analyze({
    materials: [clay],
    layers: [{
      id: "clay",
      topElevation: 0,
      bottomElevation: -20,
      materialId: clay.id,
    }],
    groundwater: { model: "none" },
    designDrainage: "undrained",
    scenario,
    pileModel: pile(0.5),
  });
}

function tensionOutput() {
  const clay = material({
    id: "tension-clay",
    drainage: "undrained",
    bulk: 18,
    saturated: 20,
    strength: {
      model: "total-stress-undrained",
      undrainedShearStrength: 50,
    },
  });
  const scenario = new AxialPileLoadScenario({
    id: "undrained-tension",
    direction: "tension",
    shaftResistanceByLayer: {
      clay: {
        method: "alpha-undrained",
        adhesionFactor: 0.45,
        provenance: { source: "validation-assigned-tension-alpha" },
      },
    },
    units,
  });
  return analyze({
    materials: [clay],
    layers: [{
      id: "clay",
      topElevation: 0,
      bottomElevation: -20,
      materialId: clay.id,
    }],
    groundwater: { model: "none" },
    designDrainage: "undrained",
    scenario,
    pileModel: pile(0.5),
  });
}

function cases() {
  const perimeter1 = Math.PI;
  const area1 = Math.PI / 4;
  const upperShaft = 0.25 * (28 * 2 + 56 * 2) * perimeter1;
  const lowerShaft = 0.3 * 102 * 6 * perimeter1;
  const undrainedShaft = 0.6 * 50 * Math.PI * 0.5 * 10;
  const undrainedBase = 9 * 50 * Math.PI * 0.5 ** 2 / 4;
  const tensionShaft = 0.45 * 50 * Math.PI * 0.5 * 10;
  return [{
    id: "layered-effective-stress-capacity",
    title: "Layered beta-method pile with a hydrostatic water table",
    source,
    sourceKind: "independent-closed-form-recalculation",
    assumptions: [
      "D=1 m, q=10 kPa, beta values 0.25 and 0.30, water table at 2 m depth.",
      "Effective vertical stress is integrated as exact linear segments in each layer.",
    ],
    evaluate: drainedLayeredOutput,
    expectations: [
      { id: "upper-shaft", path: "shaft.contributions.0.resistance", expected: upperShaft, tolerance: 1e-9, units: "kN" },
      { id: "lower-shaft", path: "shaft.contributions.1.resistance", expected: lowerShaft, tolerance: 1e-9, units: "kN" },
      { id: "toe-effective-stress", path: "base.stressAtToe.effectiveVerticalStress", expected: 138, tolerance: 1e-10, units: "kN/m2" },
      { id: "base-resistance", path: "base.resistance", expected: 20 * 138 * area1, tolerance: 1e-9, units: "kN" },
      { id: "total-capacity", path: "capacity.calculatedUltimateResistance", expected: upperShaft + lowerShaft + 20 * 138 * area1, tolerance: 1e-9, units: "kN" },
    ],
  }, {
    id: "undrained-alpha-nc-capacity",
    title: "Undrained alpha-method shaft plus assigned Nc base",
    source,
    sourceKind: "independent-closed-form-recalculation",
    assumptions: [
      "D=0.5 m, L=10 m, su=50 kPa, alpha=0.6 and explicitly assigned Nc=9.",
    ],
    evaluate: undrainedCompressionOutput,
    expectations: [
      { id: "shaft-resistance", path: "shaft.resistance", expected: undrainedShaft, tolerance: 1e-9, units: "kN" },
      { id: "base-resistance", path: "base.resistance", expected: undrainedBase, tolerance: 1e-9, units: "kN" },
      { id: "total-capacity", path: "capacity.calculatedUltimateResistance", expected: undrainedShaft + undrainedBase, tolerance: 1e-9, units: "kN" },
    ],
  }, {
    id: "tension-shaft-only-capacity",
    title: "Undrained tension resistance excludes pile tip",
    source,
    sourceKind: "independent-closed-form-recalculation",
    assumptions: [
      "D=0.5 m, L=10 m, su=50 kPa and a distinct tension alpha=0.45.",
      "Pile self-weight is outside the geotechnical shaft-resistance calculation.",
    ],
    evaluate: tensionOutput,
    expectations: [
      { id: "shaft-resistance", path: "shaft.resistance", expected: tensionShaft, tolerance: 1e-9, units: "kN" },
      { id: "base-resistance", path: "capacity.calculatedUltimateBaseResistance", expected: 0, tolerance: 0, units: "kN" },
      { id: "total-capacity", path: "capacity.calculatedUltimateResistance", expected: tensionShaft, tolerance: 1e-9, units: "kN" },
    ],
  }];
}

export function runGeotechnicalDeepFoundationValidationCampaign() {
  const results = cases().map(evaluateCase);
  const passed = results.filter(({ status }) => status === "ok").length;
  return {
    id: "geotechnical-deep-foundation-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalDeepFoundationValidationReport(campaign) {
  const lines = [
    "# Geotechnical deep-foundation validation campaign",
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
