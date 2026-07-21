import {
  DeepFoundationModel,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  LateralPileBeamOnSpringsAnalysis,
  LateralPileResponseScenario,
  PileTransferLaw,
  SoilMaterial,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const source =
  "FHWA GEC 9, FHWA-HIF-18-031 (2018), sections 6.3 and 6.3.1, equations 6-1 through 6-5";

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
  embedment,
  flexuralRigidity,
  shear,
  points,
  maxElementLength,
  headCondition = null,
  tipCondition = null,
  loadSteps = 1,
  extrapolation = "constant",
}) {
  const material = new SoilMaterial({
    id: `${id}-soil`,
    name: `${id}-soil`,
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [{
      id: `${id}-parameters`,
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 30,
        cohesion: 0,
      },
      provenance: { source: "validation-input" },
    }],
    angleUnits: "deg",
    units,
  });
  const layerId = `${id}-layer`;
  const profile = new GroundProfile({
    id: `${id}-profile`,
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [{
      id: layerId,
      topElevation: 0,
      bottomElevation: -Math.max(embedment + 5, 20),
      materialId: material.id,
    }],
    units,
  });
  const groundModel = new GroundModel({
    id: `${id}-ground`,
    materials: [material],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: `${id}-sls`,
    groundModel,
    limitState: "SLS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    units,
  });
  const pile = new DeepFoundationModel({
    id: `${id}-pile`,
    geometry: { model: "circular", diameter: 1 },
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
  const transferLaw = new PileTransferLaw({
    id: `${id}-law`,
    points,
    extrapolation,
    provenance: { source: "validation-assigned-law" },
    units,
  });
  const scenario = new LateralPileResponseScenario({
    id: `${id}-scenario`,
    action: {
      lateralShear: shear,
      overturningMoment: 0,
      referencePoint: "pile-head",
    },
    flexuralRigidity: {
      model: "constant",
      value: flexuralRigidity,
      provenance: { source: "validation-assigned-EI" },
    },
    headCondition,
    tipCondition,
    soilResponse: {
      model: "assigned-py-curves",
      curvesByLayer: {
        [layerId]: {
          stations: [{ depth: embedment / 2, law: transferLaw }],
        },
      },
    },
    discretization: { maxElementLength },
    solver: {
      loadSteps,
      maxIterations: 50,
      relativeResidualTolerance: 1e-10,
      displacementTolerance: 1e-12,
    },
    units,
  });
  return new LateralPileBeamOnSpringsAnalysis().analyze({
    groundModel,
    designSituation,
    pile,
    scenario,
    units,
  }).outputs;
}

function cases() {
  const winklerStiffness = 1000;
  const winklerRigidity = 10000;
  const beta = (winklerStiffness / (4 * winklerRigidity)) ** 0.25;
  return [{
    id: "py-euler-bernoulli-cantilever",
    title: "Euler-Bernoulli beam kernel without mobilized soil reaction",
    source,
    sourceKind: "independent-closed-form-beam-solution",
    assumptions: [
      "L=1 m, EI=600 kN.m2, P=12 kN, fixed translation and rotation at the toe.",
      "The assigned p-y law has zero resistance, reducing the model to an exact cantilever benchmark.",
    ],
    evaluate: () => analyze({
      id: "cantilever",
      embedment: 1,
      flexuralRigidity: 600,
      shear: 12,
      points: [
        { displacement: 0, resistancePerLength: 0 },
        { displacement: 1, resistancePerLength: 0 },
      ],
      maxElementLength: 1,
      tipCondition: { translation: "fixed", rotation: "fixed" },
    }),
    expectations: [
      { id: "head-displacement", path: "response.pileHead.displacement", expected: 12 / (3 * 600), tolerance: 1e-12, units: "m" },
      { id: "head-rotation", path: "response.pileHead.rotation", expected: -12 / (2 * 600), tolerance: 1e-12, units: "rad" },
      { id: "maximum-moment", path: "response.extrema.maximumAbsoluteBendingMoment.bendingMoment", expected: 12, tolerance: 1e-10, units: "kN.m" },
      { id: "moment-equilibrium", path: "equilibrium.normalizedMomentEquilibriumResidual", expected: 0, tolerance: 1e-10 },
    ],
  }, {
    id: "py-linear-semi-infinite-winkler",
    title: "Long beam on a constant linear Winkler foundation",
    source,
    sourceKind: "independent-semi-infinite-closed-form-solution",
    assumptions: [
      "L=15 m approximates a semi-infinite beam, EI=10000 kN.m2, k=1000 kN/m2 and P=100 kN.",
      "The closed form uses beta=(k/(4EI))^0.25; finite-length and mesh effects are covered by explicit tolerances.",
    ],
    evaluate: () => analyze({
      id: "winkler",
      embedment: 15,
      flexuralRigidity: winklerRigidity,
      shear: 100,
      points: [
        { displacement: 0, resistancePerLength: 0 },
        { displacement: 1, resistancePerLength: winklerStiffness },
      ],
      maxElementLength: 0.25,
      extrapolation: "linear",
    }),
    expectations: [
      { id: "head-displacement", path: "response.pileHead.displacement", expected: 100 / (2 * winklerRigidity * beta ** 3), tolerance: 8e-4, units: "m" },
      { id: "head-rotation", path: "response.pileHead.rotation", expected: -100 / (2 * winklerRigidity * beta ** 2), tolerance: 5e-4, units: "rad" },
      { id: "force-equilibrium", path: "equilibrium.normalizedForceEquilibriumResidual", expected: 0, tolerance: 1e-9 },
      { id: "moment-equilibrium", path: "equilibrium.normalizedMomentEquilibriumResidual", expected: 0, tolerance: 1e-9 },
    ],
  }, {
    id: "py-nonlinear-plateau-equilibrium",
    title: "Nonlinear plateau spring coupled to a fixed-fixed beam element",
    source,
    sourceKind: "independent-piecewise-equilibrium-solution",
    assumptions: [
      "L=1 m, EI=100 kN.m2, fixed rotations, fixed toe translation and P=24 kN.",
      "The head tributary is 0.5 m; after p=10 kN/m is mobilized, y=(24-5)/(12EI/L3).",
    ],
    evaluate: () => analyze({
      id: "nonlinear",
      embedment: 1,
      flexuralRigidity: 100,
      shear: 24,
      points: [
        { displacement: 0, resistancePerLength: 0 },
        { displacement: 0.01, resistancePerLength: 10 },
        { displacement: 0.02, resistancePerLength: 10 },
      ],
      maxElementLength: 1,
      headCondition: { translation: "free", rotation: "fixed" },
      tipCondition: { translation: "fixed", rotation: "fixed" },
      loadSteps: 4,
    }),
    expectations: [
      { id: "head-displacement", path: "response.pileHead.displacement", expected: 19 / 1200, tolerance: 1e-12, units: "m" },
      { id: "soil-reaction", path: "equilibrium.totalSoilReaction", expected: -5, tolerance: 1e-10, units: "kN" },
      { id: "toe-support-reaction", path: "equilibrium.totalTranslationSupportReaction", expected: -19, tolerance: 1e-10, units: "kN" },
      { id: "force-equilibrium", path: "equilibrium.forceEquilibriumResidual", expected: 0, tolerance: 1e-10, units: "kN" },
      { id: "moment-equilibrium", path: "equilibrium.momentEquilibriumResidual", expected: 0, tolerance: 1e-10, units: "kN.m" },
    ],
  }];
}

export function runGeotechnicalLateralPilePyValidationCampaign() {
  const results = cases().map(evaluateCase);
  const passed = results.filter(({ status }) => status === "ok").length;
  return {
    id: "geotechnical-lateral-pile-py-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalLateralPilePyValidationReport(campaign) {
  const lines = [
    "# Geotechnical lateral-pile p-y validation campaign",
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
