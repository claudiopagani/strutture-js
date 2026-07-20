import {
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  ShallowFoundationServiceabilityAnalysis,
  SoilMaterial,
  calculateRigidFoundationElasticStiffness,
  calculateShallowFoundationDifferentialMovement,
  calculateShallowFoundationVerticalStressInfluence,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const FOOT = 0.3048;
const INCH = 0.0254;
const TSF = 95.7605179606716;
const PCF = 0.157087463846246;
const usaceReference =
  "USACE EM 1110-1-1905 (31 July 2025), equations 6-9 and 7-16 through 7-26, Appendix C Example C-7";
const nistReference =
  "NIST GCR 12-917-21 (2012), Section 2.2.1, Tables 2-2a and 2-2b";

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
    status: checks.every((check) => check.status === "ok") ? "ok" : "failed",
    checks,
  };
}

function strengthSet() {
  return {
    id: "validation-strength",
    basis: "representative",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 32,
      cohesion: 0,
    },
  };
}

function schmertmannC7Output() {
  const coneTipResistanceTsf = [100, 100, 160, 100, 300, 160, 200];
  const layerBottomDepthFeet = [1.5, 2.5, 4, 7.5, 9.5, 12.5, 16];
  const deformationParameterSets = coneTipResistanceTsf.map(
    (value, index) => ({
      id: `c7-cpt-${index + 1}`,
      basis: "measured",
      drainage: "drained",
      model: "schmertmann-cpt",
      coneTipResistance: value * TSF,
      provenance: { source: usaceReference },
    }),
  );
  const material = new SoilMaterial({
    id: "c7-validation-sand",
    name: "C-7 validation sand",
    unitWeight: { bulk: 125 * PCF },
    parameterSets: [strengthSet()],
    deformationParameterSets,
    angleUnits: "deg",
    units,
  });
  const baseDepth = 2.5 * FOOT;
  const layers = [{
    id: "c7-cover",
    topElevation: 0,
    bottomElevation: -baseDepth,
    materialId: material.id,
  }];
  let topElevation = -baseDepth;
  for (let index = 0; index < layerBottomDepthFeet.length; index += 1) {
    const bottomElevation = -baseDepth -
      layerBottomDepthFeet[index] * FOOT;
    layers.push({
      id: `c7-layer-${index + 1}`,
      topElevation,
      bottomElevation,
      materialId: material.id,
    });
    topElevation = bottomElevation;
  }
  const profile = new GroundProfile({
    id: "c7-validation-profile",
    groundSurfaceElevation: 0,
    materials: [material],
    layers,
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new GroundModel({
    id: "c7-validation-ground",
    materials: [material],
    profiles: [profile],
    units,
  });
  const deformationByLayer = { "c7-cover": "c7-cpt-1" };
  for (let index = 0; index < layerBottomDepthFeet.length; index += 1) {
    deformationByLayer[`c7-layer-${index + 1}`] = `c7-cpt-${index + 1}`;
  }
  const designSituation = new GeotechnicalDesignSituation({
    id: "c7-validation-situation",
    groundModel,
    limitState: "SLS",
    timeCondition: "short-term",
    drainageCondition: "drained",
    profileId: profile.id,
    parameterSelection: { deformationByLayer },
    units,
  });
  const foundation = new ShallowFoundationModel({
    id: "c7-validation-foundation",
    shape: "rectangular",
    geometry: { width: 8 * FOOT, length: 8 * FOOT },
    placement: { baseElevation: -baseDepth },
    units,
  });
  const area = (8 * FOOT) ** 2;
  const actionState = new ShallowFoundationActionState({
    id: "c7-validation-actions",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: { verticalForce: 3.31 * TSF * area },
    units,
  });
  const output = new ShallowFoundationServiceabilityAnalysis().analyze({
    groundModel,
    designSituation,
    foundation,
    actionState,
    method: "usace-schmertmann-cpt-2025",
    units,
  });
  return {
    settlementInches: output.outputs.settlement.value / INCH,
    peakInfluence: output.outputs.methodResult.factors.peakInfluence,
    embedmentFactor: output.outputs.methodResult.factors.embedmentFactor,
    converged: output.outputs.methodResult.convergence.converged ? 1 : 0,
  };
}

function stressInfluenceOutput() {
  return {
    influence: calculateShallowFoundationVerticalStressInfluence({
      shape: "rectangular",
      width: 8,
      length: 8,
      depth: 2.6,
    }),
  };
}

function rigidStiffnessOutput() {
  const stiffness = calculateRigidFoundationElasticStiffness({
    width: 2,
    length: 4,
    shearModulus: 30000 / (2 * 1.3),
    poissonRatio: 0.3,
  }).stiffness;
  return {
    vertical: stiffness.vertical,
    rockingAboutShortAxis: stiffness.rockingAboutShortAxis,
    rockingAboutLongAxis: stiffness.rockingAboutLongAxis,
  };
}

function differentialMovementOutput() {
  const output = calculateShallowFoundationDifferentialMovement({
    firstMovement: {
      foundationId: "F1",
      placement: { x: 0, y: 0 },
      settlement: 0.01,
    },
    secondMovement: {
      foundationId: "F2",
      placement: { x: 5, y: 0 },
      settlement: 0.02,
    },
    units,
  });
  return {
    differentialSettlement: output.differentialSettlement,
    angularDistortion: output.angularDistortion,
  };
}

function validationCases() {
  return [
    {
      id: "usace-square-stress-influence-c7",
      title: "Approximate Boussinesq stress influence for the C-7 footing",
      source: `${usaceReference}, equation 6-9 and C-7 table`,
      sourceKind: "independent-published-tabulated-value",
      assumptions: [
        "The published B=8 ft and z=2.6 ft are used in a dimensionless equation.",
      ],
      evaluate: stressInfluenceOutput,
      expectations: [
        { id: "stress-influence", path: "influence", expected: 0.882, tolerance: 0.001 },
      ],
    },
    {
      id: "usace-schmertmann-c7-equation-path",
      title: "Layered CPT immediate settlement from Example C-7",
      source: usaceReference,
      sourceKind: "independent-published-data-equation-recalculation",
      assumptions: [
        "C2 is fixed to 1.0, so the result is the immediate component only.",
        "The target 0.71627 in is an independent sum of the published layer data through equations 7-16 to 7-26.",
        "The printed C-7 total and 1.5 in result are internally inconsistent with the displayed layer contributions; they are not used as validation targets.",
      ],
      evaluate: schmertmannC7Output,
      expectations: [
        { id: "peak-influence", path: "peakInfluence", expected: 0.779, tolerance: 0.001 },
        { id: "embedment-factor", path: "embedmentFactor", expected: 0.975, tolerance: 0.001 },
        { id: "immediate-settlement", path: "settlementInches", expected: 0.71627, tolerance: 0.001, units: "in" },
        { id: "integration-convergence", path: "converged", expected: 1, tolerance: 0 },
      ],
    },
    {
      id: "nist-pais-kausel-rigid-rectangle",
      title: "Rigid rectangular foundation surface stiffness",
      source: nistReference,
      sourceKind: "independent-closed-form-recalculation",
      assumptions: [
        "Full dimensions are 2 m by 4 m; the source equations use half-width and half-length.",
        "E=30000 kN/m2 and nu=0.3, hence G=11538.461538 kN/m2.",
        "The footing is represented at the surface without sidewall embedment modifiers.",
      ],
      evaluate: rigidStiffnessOutput,
      expectations: [
        { id: "vertical-stiffness", path: "vertical", expected: 112311.39188856645, tolerance: 1e-8, units: "kN/m" },
        { id: "short-axis-rocking", path: "rockingAboutShortAxis", expected: 328962.494979092, tolerance: 1e-8, units: "kN.m/rad" },
        { id: "long-axis-rocking", path: "rockingAboutLongAxis", expected: 118681.31868131868, tolerance: 1e-8, units: "kN.m/rad" },
      ],
    },
    {
      id: "differential-settlement-geometry",
      title: "Signed differential movement and angular distortion",
      source: "Geometric compatibility definition: absolute differential settlement divided by support spacing",
      sourceKind: "independent-closed-form-recalculation",
      assumptions: [
        "Settlements are positive downward and supports are 5 m apart.",
      ],
      evaluate: differentialMovementOutput,
      expectations: [
        { id: "differential-settlement", path: "differentialSettlement", expected: 0.01, tolerance: 1e-12, units: "m" },
        { id: "angular-distortion", path: "angularDistortion", expected: 0.002, tolerance: 1e-12 },
      ],
    },
  ];
}

export function runGeotechnicalShallowFoundationServiceabilityValidationCampaign() {
  const results = validationCases().map(evaluateCase);
  const passed = results.filter(({ status }) => status === "ok").length;
  return {
    id: "geotechnical-shallow-foundation-serviceability-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalShallowFoundationServiceabilityValidationReport(
  campaign,
) {
  const lines = [
    "# Geotechnical shallow-foundation SLS validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}; passed: ${campaign.passed}; failed: ${campaign.failed}`,
    "",
  ];
  for (const caseResult of campaign.results) {
    lines.push(
      `- ${caseResult.id}: ${caseResult.status} (${caseResult.source})`,
    );
  }
  return lines.join("\n");
}
