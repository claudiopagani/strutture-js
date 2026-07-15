import {
  PunchingActionState,
  PunchingConnectionModel,
  PunchingVerificationRequest,
  RC_PUNCHING_DESIGN_CODE_IDS,
  RC_PUNCHING_PARAMETER_PROFILES,
  verifyPunching,
} from "../src/index.js";

const units = Object.freeze({ force: "N", length: "mm" });

function model({ id, column, thickness, dx, dy, rhoX, rhoY, fck, aggregate }) {
  return new PunchingConnectionModel({
    id,
    units,
    slab: {
      thickness,
      boundary: [
        { x: -4000, y: -4000 },
        { x: 4000, y: -4000 },
        { x: 4000, y: 4000 },
        { x: -4000, y: 4000 },
      ],
      openings: [],
    },
    support: {
      kind: "column",
      position: "interior",
      footprint: {
        shape: "rectangle",
        center: { x: 0, y: 0 },
        sizeX: column,
        sizeY: column,
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
      punching: { present: false },
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
      components: { fz: definition.force, mx: 0, my: 0 },
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
