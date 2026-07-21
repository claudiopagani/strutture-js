import {
  EmbeddedRetainingWallAnalysis,
  EmbeddedRetainingWallModel,
  EmbeddedRetainingWallScenario,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  SoilMaterial,
  WallSoilReactionLaw,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const reference =
  "FHWA GEC 4, FHWA-IF-99-015 (1999), chapters 5 and 8; Euler-Bernoulli independent closed forms";

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
  length,
  flexuralRigidity,
  points,
  stages,
  supports = [],
  headCondition = null,
  toeCondition = null,
  maxElementLength,
}) {
  const material = new SoilMaterial({
    id: `${id}-soil`,
    name: `${id} soil`,
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
      provenance: { source: "validation material" },
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
      bottomElevation: -Math.max(20, length + 5),
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
  const wall = new EmbeddedRetainingWallModel({
    id: `${id}-wall`,
    topElevation: 0,
    toeElevation: -length,
    analysisWidth: 1,
    flexuralRigiditySegments: [{
      topElevation: 0,
      bottomElevation: -length,
      flexuralRigidity,
      provenance: { source: "validation assigned EI" },
    }],
    headCondition,
    toeCondition,
    units,
  });
  const transferLaw = new WallSoilReactionLaw({
    id: `${id}-law`,
    points,
    extrapolation: "linear",
    provenance: { source: "validation assigned wall-soil law" },
    units,
  });
  const side = {
    profileId: profile.id,
    curvesByLayer: {
      [layerId]: {
        stations: [{ depth: length / 2, law: transferLaw }],
      },
    },
  };
  const scenario = new EmbeddedRetainingWallScenario({
    id: `${id}-scenario`,
    soilResponse: {
      sides: { retained: side, excavation: side },
    },
    supports,
    stages,
    discretization: { maxElementLength },
    solver: {
      incrementsPerStage: 4,
      maxIterations: 50,
      relativeResidualTolerance: 1e-10,
      displacementTolerance: 1e-12,
    },
    units,
  });
  const result = new EmbeddedRetainingWallAnalysis().analyze({
    groundModel,
    designSituation,
    wall,
    scenario,
    units,
  });
  if (result.status !== "ok") {
    throw new Error(`${id} validation analysis failed: ${result.summary}`);
  }
  return result.outputs;
}

function cases() {
  const winklerPressureModulus = 500;
  const winklerLineModulus = 2 * winklerPressureModulus;
  const winklerRigidity = 10000;
  const beta = (winklerLineModulus / (4 * winklerRigidity)) ** 0.25;
  return [{
    id: "embedded-wall-uniform-cantilever",
    title: "Uniform pressure on an exact Euler-Bernoulli cantilever",
    source: reference,
    sourceKind: "independent-closed-form-beam-solution",
    assumptions: [
      "L=1 m, EI=600 kN.m2 and uniform assigned pressure q=10 kN/m on a one-metre strip.",
      "Both soil laws are zero; the wall is fixed at the toe.",
    ],
    evaluate: () => analyze({
      id: "cantilever",
      length: 1,
      flexuralRigidity: 600,
      points: [
        { closureDisplacement: -1, effectivePressure: 0 },
        { closureDisplacement: 1, effectivePressure: 0 },
      ],
      stages: [{
        id: "loaded",
        retainedGroundElevation: 0,
        excavationGroundElevation: 0,
        pressureLoads: [{
          side: "retained",
          segments: [{
            topElevation: 0,
            bottomElevation: -1,
            topPressure: 10,
            bottomPressure: 10,
          }],
          provenance: { source: "validation uniform pressure" },
        }],
      }],
      toeCondition: { translation: "fixed", rotation: "fixed" },
      maxElementLength: 1,
    }),
    expectations: [
      { id: "head-displacement", path: "finalStage.response.nodes.0.displacement", expected: 10 / (8 * 600), tolerance: 1e-12, units: "m" },
      { id: "head-rotation", path: "finalStage.response.nodes.0.rotation", expected: -10 / (6 * 600), tolerance: 1e-12, units: "rad" },
      { id: "maximum-moment", path: "demand.maximumAbsoluteBendingMoment.bendingMoment", expected: 5, tolerance: 1e-10, units: "kN.m" },
      { id: "moment-equilibrium", path: "finalStage.equilibrium.normalizedMomentResidual", expected: 0, tolerance: 1e-10 },
    ],
  }, {
    id: "embedded-wall-two-sided-winkler",
    title: "Long wall on two equal linear pressure-displacement foundations",
    source: reference,
    sourceKind: "independent-semi-infinite-winkler-solution",
    assumptions: [
      "L=15 m approximates a semi-infinite beam, EI=10000 kN.m2 and P=100 kN.",
      "Each side has tangent pressure modulus 500 kN/m3, giving combined line modulus 1000 kN/m2 for a one-metre strip.",
    ],
    evaluate: () => analyze({
      id: "winkler",
      length: 15,
      flexuralRigidity: winklerRigidity,
      points: [
        { closureDisplacement: -0.1, effectivePressure: 0 },
        { closureDisplacement: 0, effectivePressure: 50 },
        { closureDisplacement: 0.1, effectivePressure: 100 },
      ],
      stages: [{
        id: "lateral-load",
        retainedGroundElevation: 0,
        excavationGroundElevation: 0,
        nodalActions: [{
          elevation: 0,
          force: 100,
          provenance: { source: "validation head load" },
        }],
      }],
      maxElementLength: 0.25,
    }),
    expectations: [
      { id: "head-displacement", path: "finalStage.response.nodes.0.displacement", expected: 100 / (2 * winklerRigidity * beta ** 3), tolerance: 8e-4, units: "m" },
      { id: "head-rotation", path: "finalStage.response.nodes.0.rotation", expected: -100 / (2 * winklerRigidity * beta ** 2), tolerance: 5e-4, units: "rad" },
      { id: "force-equilibrium", path: "finalStage.equilibrium.normalizedForceResidual", expected: 0, tolerance: 1e-9 },
      { id: "moment-equilibrium", path: "finalStage.equilibrium.normalizedMomentResidual", expected: 0, tolerance: 1e-9 },
    ],
  }, {
    id: "embedded-wall-linear-support",
    title: "Single beam degree of freedom coupled to a linear support",
    source: reference,
    sourceKind: "independent-stiffness-summation-solution",
    assumptions: [
      "L=1 m, EI=100 kN.m2, fixed rotations and fixed toe translation.",
      "The head translation has beam stiffness 12EI/L3 in parallel with a 500 kN/m bilateral support under P=24 kN.",
    ],
    evaluate: () => analyze({
      id: "support",
      length: 1,
      flexuralRigidity: 100,
      points: [
        { closureDisplacement: -1, effectivePressure: 0 },
        { closureDisplacement: 1, effectivePressure: 0 },
      ],
      supports: [{
        id: "head-support",
        elevation: 0,
        stiffness: 500,
        behavior: "bilateral",
        actionDirection: "toward-retained-side",
        provenance: { source: "validation support" },
      }],
      stages: [{
        id: "supported-load",
        retainedGroundElevation: 0,
        excavationGroundElevation: 0,
        activeSupportIds: ["head-support"],
        nodalActions: [{
          elevation: 0,
          force: 24,
          provenance: { source: "validation head load" },
        }],
      }],
      headCondition: { translation: "free", rotation: "fixed" },
      toeCondition: { translation: "fixed", rotation: "fixed" },
      maxElementLength: 1,
    }),
    expectations: [
      { id: "head-displacement", path: "finalStage.response.nodes.0.displacement", expected: 24 / 1700, tolerance: 1e-12, units: "m" },
      { id: "support-force", path: "finalStage.response.supports.0.scalarForce", expected: 500 * 24 / 1700, tolerance: 1e-10, units: "kN" },
      { id: "force-equilibrium", path: "finalStage.equilibrium.forceResidual", expected: 0, tolerance: 1e-10, units: "kN" },
      { id: "moment-equilibrium", path: "finalStage.equilibrium.momentResidual", expected: 0, tolerance: 1e-10, units: "kN.m" },
    ],
  }];
}

export function runGeotechnicalEmbeddedRetainingWallValidationCampaign() {
  const results = cases().map(evaluateCase);
  const passed = results.filter(({ status }) => status === "ok").length;
  return {
    id: "geotechnical-embedded-retaining-wall-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatGeotechnicalEmbeddedRetainingWallValidationReport(
  campaign,
) {
  const lines = [
    "# Geotechnical embedded-retaining-wall validation campaign",
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
