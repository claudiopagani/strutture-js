import {
  PunchingActionState,
  PunchingConnectionModel,
  PunchingVerificationRequest,
  RC_PUNCHING_DESIGN_CODE_IDS,
  RC_PUNCHING_PARAMETER_PROFILES,
  verifyPunching,
} from "../src/index.js";

const units = Object.freeze({ force: "N", length: "mm" });
const edgeBoundary = Object.freeze([
  { x: -200, y: -4000 },
  { x: 4000, y: -4000 },
  { x: 4000, y: 4000 },
  { x: -200, y: 4000 },
]);
const cornerBoundary = Object.freeze([
  { x: -200, y: -200 },
  { x: 4000, y: -200 },
  { x: 4000, y: 4000 },
  { x: -200, y: 4000 },
]);

function model(definition) {
  const {
    id,
    column,
    thickness,
    dx,
    dy,
    rhoX,
    rhoY,
    fck,
    aggregate,
    sizeX = column,
    sizeY = column,
    position = "interior",
    center = { x: 0, y: 0 },
    punching = { present: false },
    boundary = [
    { x: -4000, y: -4000 },
    { x: 4000, y: -4000 },
    { x: 4000, y: 4000 },
    { x: -4000, y: 4000 },
    ],
  } = definition;

  return new PunchingConnectionModel({
    id,
    units,
    slab: {
      thickness,
      boundary,
      openings: [],
    },
    support: {
      kind: "column",
      position,
      footprint: {
        shape: "rectangle",
        center,
        sizeX,
        sizeY,
      },
    },
    materials: {
      concrete: { fck },
      concreteAggregate: aggregate == null ? null : { lowerSize: aggregate },
    },
    reinforcement: {
      flexuralTension: {
        x: { effectiveDepth: dx, ratio: rhoX },
        y: { effectiveDepth: dy, ratio: rhoY },
      },
      punching,
    },
  });
}

function evaluateCase(definition) {
  const connection = model(definition.connection);
  const request = new PunchingVerificationRequest({
    id: definition.id,
    connection,
    actionStates: [new PunchingActionState({
      id: "ULS",
      connectionId: connection.id,
      units,
      combinationType: "ULS",
      components: definition.actions ?? { fz: definition.force, mx: 0, my: 0 },
    })],
    code: definition.code,
  });
  const result = verifyPunching(request);
  const checks = definition.expectations.map((expectation) => {
    const actual = expectation.read(result);
    const passed = Math.abs(actual - expectation.expected) <= expectation.tolerance;

    return {
      id: expectation.id,
      actual,
      expected: expectation.expected,
      tolerance: expectation.tolerance,
      status: passed ? "ok" : "failed",
    };
  });

  return {
    id: definition.id,
    source: definition.source,
    status: checks.every((check) => check.status === "ok") ? "ok" : "failed",
    checks,
  };
}

export function runPunchingValidationCampaign() {
  const cases = [
    {
      id: "en1992-2004-automatic-beta-interior",
      source: "EN 1992-1-1:2004+A1:2014, equation (6.43); independent closed-form calculation",
      connection: {
        id: "EC2-2004-beta",
        column: 500,
        thickness: 320,
        dx: 280,
        dy: 280,
        rhoX: 0.009,
        rhoY: 0.009,
        fck: 40,
      },
      actions: { fz: 500_000, mx: 50_000_000, my: -25_000_000 },
      code: {
        id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
        parameters: {
          gammaC: 1.5,
          alphaCc: 1,
          cRdc: 0.12,
          k1: 0.1,
          sigmaCp: 0,
          concentrationMethod: "automatic",
        },
      },
      expectations: [{
        id: "beta",
        expected: 1 + 1.8 * Math.hypot(50 / 1620, 100 / 1620),
        tolerance: 1e-12,
        read: (result) => result.outputs.stateResults[0].beta,
      }],
    },
    {
      id: "en1992-2023-vertical-studs",
      source: "EN 1992-1-1:2023, 8.4.4 and 12.5.1; Muttoni et al. (2023), equations (17)-(20)",
      connection: {
        id: "EC2-2023-studs",
        column: 500,
        thickness: 320,
        dx: 280,
        dy: 280,
        rhoX: 0.0091,
        rhoY: 0.0091,
        fck: 42.8,
        aggregate: 32,
        punching: {
          present: true,
          system: "studs",
          steel: { fywd: 435 },
          layout: {
            legDiameter: 12,
            legArea: 113,
            areaPerPerimeter: 1800,
            radialSpacing: 150,
            tangentialSpacing: 150,
            firstPerimeterOffset: 140,
            perimeterCount: 6,
          },
        },
      },
      force: 1_167_000,
      code: {
        id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
        parameters: { gammaV: 1.4, betaE: 1.15 },
      },
      expectations: [
        {
          id: "tauRd-cs",
          expected: 3.03,
          tolerance: 0.02,
          read: (result) => result.outputs.stateResults[0]
            .punchingReinforcement.resistance.tauRdCs,
        },
        {
          id: "tauRd-max",
          expected: 2.61,
          tolerance: 0.02,
          read: (result) => result.outputs.stateResults[0]
            .punchingReinforcement.resistance.tauRdMax,
        },
      ],
    },
    {
      id: "en1992-2004-ecp-flat-slab-c2",
      source: "European Concrete Platform, Worked Examples to Eurocode 2, example 3.4.10, pp. 82-83",
      connection: {
        id: "ECP-C2",
        column: 400,
        thickness: 300,
        dx: 260,
        dy: 240,
        rhoX: 0.0085,
        rhoY: 0.0048,
        fck: 30,
      },
      force: 1_204_800,
      code: {
        id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
        parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
      },
      expectations: [
        {
          id: "u1",
          expected: 4741,
          tolerance: 1,
          read: (result) => result.outputs.stateResults[0].perimeters.u1,
        },
        {
          id: "vEd-u1",
          expected: 1.17,
          tolerance: 0.005,
          read: (result) => result.outputs.stateResults[0].demands.basicControlPerimeter,
        },
        {
          id: "vRd-c",
          expected: 0.61,
          tolerance: 0.005,
          read: (result) => result.outputs.resistance.vRdc,
        },
        {
          id: "vRd-max",
          expected: 5.28,
          tolerance: 0.005,
          read: (result) => result.outputs.resistance.vRdMax,
        },
      ],
    },
    {
      id: "en1992-2023-muttoni-example",
      source: "Muttoni et al. (2023), A Mechanical Approach for the Punching Shear Provisions in the Second Generation of Eurocode 2",
      connection: {
        id: "Muttoni-2023",
        column: 500,
        thickness: 320,
        dx: 280,
        dy: 280,
        rhoX: 0.0091,
        rhoY: 0.0091,
        fck: 42.8,
        aggregate: 32,
      },
      force: 1_167_000,
      code: {
        id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
        parameters: { gammaV: 1.4, betaE: 1.15 },
      },
      expectations: [
        {
          id: "b0.5",
          expected: 2880,
          tolerance: 1,
          read: (result) => result.outputs.stateResults[0].perimeters.b05,
        },
        {
          id: "tauEd",
          expected: 1.66,
          tolerance: 0.01,
          read: (result) => result.outputs.stateResults[0].demands.controlPerimeter,
        },
        {
          id: "kpb",
          expected: 1.99,
          tolerance: 0.005,
          read: (result) => result.outputs.resistance.kpb,
        },
        {
          id: "tauRd-c",
          expected: 1.51,
          tolerance: 0.01,
          read: (result) => result.outputs.resistance.tauRdc,
        },
      ],
    },
    {
      id: "en1992-2004-edge-perimeter-geometry",
      source: "EN 1992-1-1:2004+A1:2014, 6.4.2 Figure 6.15 and 6.4.5(3); independent analytic perimeter calculation",
      connection: {
        id: "EC2-2004-edge",
        column: 400,
        position: "edge",
        boundary: edgeBoundary,
        thickness: 300,
        dx: 250,
        dy: 250,
        rhoX: 0.008,
        rhoY: 0.008,
        fck: 30,
      },
      force: 500_000,
      code: {
        id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
        parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
      },
      expectations: [
        {
          id: "u0-edge",
          expected: 400 + 3 * 250,
          tolerance: 1e-9,
          read: (result) => result.outputs.stateResults[0].perimeters.u0,
        },
        {
          id: "u1-edge",
          expected: 2 * 400 + 400 + 2 * Math.PI * 250,
          tolerance: 1e-9,
          read: (result) => result.outputs.stateResults[0].perimeters.u1,
        },
      ],
    },
    {
      id: "en1992-2004-corner-perimeter-geometry",
      source: "EN 1992-1-1:2004+A1:2014, 6.4.2 Figure 6.16 and 6.4.5(3); independent analytic perimeter calculation",
      connection: {
        id: "EC2-2004-corner",
        column: 400,
        position: "corner",
        boundary: cornerBoundary,
        thickness: 300,
        dx: 250,
        dy: 250,
        rhoX: 0.008,
        rhoY: 0.008,
        fck: 30,
      },
      force: 500_000,
      code: {
        id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
        parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
      },
      expectations: [
        {
          id: "u0-corner",
          expected: 3 * 250,
          tolerance: 1e-9,
          read: (result) => result.outputs.stateResults[0].perimeters.u0,
        },
        {
          id: "u1-corner",
          expected: 2 * 400 + Math.PI * 250,
          tolerance: 1e-9,
          read: (result) => result.outputs.stateResults[0].perimeters.u1,
        },
      ],
    },
    {
      id: "en1992-2023-edge-perimeter-geometry",
      source: "EN 1992-1-1:2023, 8.4.2 Figures 8.18-8.19; Muttoni et al. (2023), Figure 10",
      connection: {
        id: "EC2-2023-edge",
        column: 400,
        position: "edge",
        boundary: edgeBoundary,
        thickness: 300,
        dx: 250,
        dy: 250,
        rhoX: 0.008,
        rhoY: 0.008,
        fck: 30,
        aggregate: 16,
      },
      force: 500_000,
      code: {
        id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
        parameters: { gammaV: 1.4, betaE: 1.4 },
      },
      expectations: [
        {
          id: "b0-edge",
          expected: 400 + 2 * 1.5 * 250,
          tolerance: 1e-9,
          read: (result) => result.outputs.stateResults[0].perimeters.b0,
        },
        {
          id: "b0.5-edge",
          expected: 400 + 2 * 1.5 * 250 + Math.PI * 250 / 2,
          tolerance: 1e-9,
          read: (result) => result.outputs.stateResults[0].perimeters.b05,
        },
      ],
    },
    {
      id: "en1992-2023-corner-perimeter-geometry",
      source: "EN 1992-1-1:2023, 8.4.2 Figures 8.18-8.19; Abu-Salma et al. (2023), corner-column control-perimeter figures",
      connection: {
        id: "EC2-2023-corner",
        column: 400,
        position: "corner",
        boundary: cornerBoundary,
        thickness: 300,
        dx: 250,
        dy: 250,
        rhoX: 0.008,
        rhoY: 0.008,
        fck: 30,
        aggregate: 16,
      },
      force: 500_000,
      code: {
        id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
        parameters: { gammaV: 1.4, betaE: 1.5 },
      },
      expectations: [
        {
          id: "b0-corner",
          expected: 2 * 1.5 * 250,
          tolerance: 1e-9,
          read: (result) => result.outputs.stateResults[0].perimeters.b0,
        },
        {
          id: "b0.5-corner",
          expected: 2 * 1.5 * 250 + Math.PI * 250 / 4,
          tolerance: 1e-9,
          read: (result) => result.outputs.stateResults[0].perimeters.b05,
        },
      ],
    },
  ];
  const results = cases.map(evaluateCase);
  const passed = results.filter((result) => result.status === "ok").length;

  return {
    id: "reinforced-concrete-punching-validation-campaign",
    status: passed === results.length ? "ok" : "failed",
    caseCount: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function formatPunchingValidationReport(campaign) {
  const lines = [
    "# Reinforced-concrete punching validation campaign",
    "",
    `Status: ${campaign.status}`,
    `Cases: ${campaign.caseCount}; passed: ${campaign.passed}; failed: ${campaign.failed}`,
    "",
  ];

  for (const result of campaign.results) {
    lines.push(`- ${result.id}: ${result.status} (${result.source})`);
  }

  return lines.join("\n");
}
