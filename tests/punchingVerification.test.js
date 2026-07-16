import test from "node:test";
import assert from "node:assert/strict";

import {
  PunchingActionState,
  PunchingConnectionModel,
  PunchingVerificationRequest,
  RC_PUNCHING_DESIGN_CODE_IDS,
  RC_PUNCHING_PARAMETER_PROFILES,
  verifyPunching,
} from "../src/index.js";
import {
  calculateEn1992PunchingBeta2004,
  calculateEn1992PunchingBetaE2023,
} from "../src/norms/en1992/punching/index.js";

const units = { force: "N", length: "mm" };

function connection({
  id,
  columnSize,
  thickness,
  effectiveDepthX,
  effectiveDepthY,
  ratioX,
  ratioY,
  fck,
  lowerAggregateSize = null,
  openings = [],
  boundary = null,
}) {
  return new PunchingConnectionModel({
    id,
    units,
    slab: {
      thickness,
      boundary: boundary ?? [
        { x: -4000, y: -4000 },
        { x: 4000, y: -4000 },
        { x: 4000, y: 4000 },
        { x: -4000, y: 4000 },
      ],
      openings,
      beams: [],
    },
    support: {
      id: `${id}:column`,
      kind: "column",
      position: "interior",
      footprint: {
        shape: "rectangle",
        center: { x: 0, y: 0 },
        sizeX: columnSize,
        sizeY: columnSize,
        rotation: 0,
      },
    },
    materials: {
      concrete: { fck },
      concreteAggregate: lowerAggregateSize == null
        ? null
        : { lowerSize: lowerAggregateSize },
    },
    reinforcement: {
      flexuralTension: {
        x: { effectiveDepth: effectiveDepthX, ratio: ratioX },
        y: { effectiveDepth: effectiveDepthY, ratio: ratioY },
        source: { method: "worked-example-effective-ratios" },
      },
      punching: { present: false },
    },
  });
}

function request({ id, connectionModel, force, code, punchingDemand = null, perimeterDefinition }) {
  return new PunchingVerificationRequest({
    id,
    connection: connectionModel,
    actionStates: [new PunchingActionState({
      id: "ULS-01",
      connectionId: connectionModel.id,
      localFrameId: connectionModel.localFrame.id,
      combinationType: "ULS",
      units,
      components: { fz: force, mx: 0, my: 0 },
      punchingDemand,
      source: { method: "manual", reference: "published-worked-example" },
    })],
    code,
    perimeterDefinition,
  });
}

function externalConnection(position, { fck = 30, aggregate = 16 } = {}) {
  const supportCenter = position === "corner"
    ? { x: 200, y: 200 }
    : { x: 200, y: 0 };
  const boundary = position === "corner"
    ? [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 4000 },
        { x: 0, y: 4000 },
      ]
    : [
        { x: 0, y: -4000 },
        { x: 4000, y: -4000 },
        { x: 4000, y: 4000 },
        { x: 0, y: 4000 },
      ];

  return new PunchingConnectionModel({
    id: `${position}-column`,
    units,
    slab: { thickness: 300, boundary, openings: [], beams: [] },
    support: {
      kind: "column",
      position,
      footprint: {
        shape: "rectangle",
        center: supportCenter,
        sizeX: 400,
        sizeY: 400,
        rotation: 0,
      },
    },
    materials: {
      concrete: { fck },
      concreteAggregate: { lowerSize: aggregate },
    },
    reinforcement: {
      flexuralTension: {
        x: { effectiveDepth: 250, ratio: 0.008 },
        y: { effectiveDepth: 250, ratio: 0.008 },
      },
      punching: { present: false },
    },
  });
}

test("EC2 2004 kernel reproduces the published interior-column worked example", () => {
  const connectionModel = connection({
    id: "ECP-C2",
    columnSize: 400,
    thickness: 300,
    effectiveDepthX: 260,
    effectiveDepthY: 240,
    ratioX: 0.0085,
    ratioY: 0.0048,
    fck: 30,
  });
  const result = verifyPunching(request({
    id: "ECP-C2-2004",
    connectionModel,
    force: 1_204_800,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
      parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
    },
  }));

  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.stateResults[0].perimeters.u0, 1600);
  assert.ok(Math.abs(result.outputs.stateResults[0].perimeters.u1 - 4741.593) < 0.001);
  assert.ok(Math.abs(result.outputs.stateResults[0].demands.supportFace - 3.464) < 0.001);
  assert.ok(Math.abs(result.outputs.stateResults[0].demands.basicControlPerimeter - 1.169) < 0.001);
  assert.ok(Math.abs(result.outputs.resistance.vRdMax - 5.28) < 0.001);
  assert.ok(Math.abs(result.outputs.resistance.vRdc - 0.61) < 0.005);
  assert.equal(result.checks[0].ok, true);
  assert.equal(result.checks[1].ok, false);
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});

test("EC2 2023 kernel reproduces the published second-generation worked example", () => {
  const connectionModel = connection({
    id: "EC2-2023-example",
    columnSize: 500,
    thickness: 320,
    effectiveDepthX: 280,
    effectiveDepthY: 280,
    ratioX: 0.0091,
    ratioY: 0.0091,
    fck: 42.8,
    lowerAggregateSize: 32,
  });
  const result = verifyPunching(request({
    id: "EC2-2023-example-request",
    connectionModel,
    force: 1_167_000,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      parameters: { gammaV: 1.4, betaE: 1.15 },
    },
  }));

  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.stateResults[0].perimeters.b0, 2000);
  assert.ok(Math.abs(result.outputs.stateResults[0].perimeters.b05 - 2879.646) < 0.001);
  assert.ok(Math.abs(result.outputs.stateResults[0].demands.controlPerimeter - 1.664) < 0.005);
  assert.equal(result.outputs.resistance.dDg, 40);
  assert.ok(Math.abs(result.outputs.resistance.kpb - 1.99) < 0.005);
  assert.ok(Math.abs(result.outputs.resistance.tauRdc - 1.51) < 0.01);
  assert.ok(Math.abs(result.outputs.resistance.resistanceLimit - 2.34) < 0.01);
  assert.equal(result.checks[0].ok, false);
});

test("generated interior perimeters retain support for general slab boundaries", () => {
  const connectionModel = connection({
    id: "interior-general-boundary",
    columnSize: 400,
    thickness: 300,
    effectiveDepthX: 250,
    effectiveDepthY: 250,
    ratioX: 0.008,
    ratioY: 0.008,
    fck: 30,
    lowerAggregateSize: 16,
    boundary: [
      { x: 0, y: -4000 },
      { x: 4000, y: 0 },
      { x: 0, y: 4000 },
      { x: -4000, y: 0 },
    ],
  });
  const result = verifyPunching(request({
    id: "interior-general-boundary-2023",
    connectionModel,
    force: 100_000,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
    },
  }));

  assert.notEqual(result.status, "not-supported");
  assert.equal(result.outputs.geometry.perimeters.length, 2);
});

test("punching verification reports missing parameters and excluded geometry", () => {
  const connectionModel = connection({
    id: "unsupported",
    columnSize: 400,
    thickness: 300,
    effectiveDepthX: 250,
    effectiveDepthY: 250,
    ratioX: 0.008,
    ratioY: 0.008,
    fck: 30,
    lowerAggregateSize: 16,
    openings: [{
      id: "O1",
      boundary: [
        { x: 600, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 200 },
        { x: 600, y: 200 },
      ],
    }],
  });
  const result = verifyPunching(request({
    id: "unsupported-request",
    connectionModel,
    force: 500_000,
    code: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
  }));

  assert.equal(result.status, "not-supported");
  assert.equal(result.checks.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("Openings")));
  assert.ok(result.warnings.some((warning) => warning.includes("gammaV")));
  assert.ok(result.warnings.some((warning) => warning.includes("gammaV")));
});

test("punching concentration factors can be supplied independently by action state", () => {
  const connectionModel = connection({
    id: "state-factors",
    columnSize: 500,
    thickness: 320,
    effectiveDepthX: 280,
    effectiveDepthY: 280,
    ratioX: 0.0091,
    ratioY: 0.0091,
    fck: 42.8,
    lowerAggregateSize: 32,
  });
  const base = request({
    id: "state-factors-request",
    connectionModel,
    force: 500_000,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      parameters: { gammaV: 1.4, betaEByState: { "ULS-01": 1.2 } },
    },
  });
  const result = verifyPunching(base);

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.stateResults[0].betaE, 1.2);
});

test("EC2 2004 generates canonical edge and corner control perimeters", () => {
  const edge = externalConnection("edge");
  const corner = externalConnection("corner");
  const edgeResult = verifyPunching(request({
    id: "edge-2004",
    connectionModel: edge,
    force: 609_500,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
      parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
    },
  }));
  const cornerResult = verifyPunching(request({
    id: "corner-2004",
    connectionModel: corner,
    force: 400_000,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
      parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
    },
  }));

  assert.notEqual(edgeResult.status, "not-supported");
  assert.notEqual(cornerResult.status, "not-supported");
  assert.equal(edgeResult.outputs.stateResults[0].beta, 1.4);
  assert.equal(cornerResult.outputs.stateResults[0].beta, 1.5);
  assert.equal(edgeResult.outputs.stateResults[0].perimeters.u0, 1150);
  assert.ok(Math.abs(edgeResult.outputs.stateResults[0].perimeters.u1 - 2770.796) < 0.001);
  assert.equal(cornerResult.outputs.stateResults[0].perimeters.u0, 750);
  assert.ok(Math.abs(cornerResult.outputs.stateResults[0].perimeters.u1 - 1585.398) < 0.001);
  assert.equal(edgeResult.outputs.geometry.perimeters[1].components[0].closed, false);
});

test("EC2 2023 generates canonical edge and corner b0 and b0.5 perimeters", () => {
  const edge = externalConnection("edge", { fck: 40, aggregate: 16 });
  const corner = externalConnection("corner", { fck: 40, aggregate: 16 });
  const edgeResult = verifyPunching(request({
    id: "edge-2023",
    connectionModel: edge,
    force: 400_000,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      parameters: { gammaV: 1.4, betaE: 1.4 },
    },
  }));
  const cornerResult = verifyPunching(request({
    id: "corner-2023",
    connectionModel: corner,
    force: 250_000,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      parameters: { gammaV: 1.4, betaE: 1.5 },
    },
  }));

  assert.notEqual(edgeResult.status, "not-supported");
  assert.notEqual(cornerResult.status, "not-supported");
  assert.equal(edgeResult.outputs.stateResults[0].perimeters.b0, 1150);
  assert.ok(Math.abs(edgeResult.outputs.stateResults[0].perimeters.b05 - 1542.699) < 0.001);
  assert.equal(cornerResult.outputs.stateResults[0].perimeters.b0, 750);
  assert.ok(Math.abs(cornerResult.outputs.stateResults[0].perimeters.b05 - 946.35) < 0.001);
});

test("explicit segment perimeters reproduce generated results", () => {
  const connectionModel = connection({
    id: "explicit-perimeters",
    columnSize: 500,
    thickness: 320,
    effectiveDepthX: 280,
    effectiveDepthY: 280,
    ratioX: 0.0091,
    ratioY: 0.0091,
    fck: 42.8,
    lowerAggregateSize: 32,
  });
  const baseInput = {
    id: "generated-perimeters",
    connectionModel,
    force: 1_167_000,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      parameters: { gammaV: 1.4, betaE: 1.15 },
    },
  };
  const generated = verifyPunching(request(baseInput));
  const explicitPerimeters = generated.outputs.geometry.perimeters.map((perimeter) => ({
    ...perimeter,
    source: { method: "explicit", reference: "designer-controlled-contour" },
  }));
  const explicit = verifyPunching(request({
    ...baseInput,
    id: "explicit-perimeters-request",
    perimeterDefinition: { method: "explicit", perimeters: explicitPerimeters },
  }));

  assert.equal(explicit.status, generated.status);
  assert.equal(explicit.demand, generated.demand);
  assert.equal(explicit.capacity, generated.capacity);
  assert.equal(explicit.outputs.geometry.perimeterMethod, "explicit");
});

test("perimeter demand subtracts enclosed load or accepts a direct force", () => {
  const connectionModel = connection({
    id: "enclosed-load",
    columnSize: 500,
    thickness: 320,
    effectiveDepthX: 280,
    effectiveDepthY: 280,
    ratioX: 0.0091,
    ratioY: 0.0091,
    fck: 42.8,
    lowerAggregateSize: 32,
  });
  const result = verifyPunching(request({
    id: "enclosed-load-request",
    connectionModel,
    force: 1_167_000,
    punchingDemand: {
      supportReaction: 1_167_000,
      punchingForceByPerimeter: { "support-face": 1_100_000 },
      enclosedLoadByPerimeter: { "basic-control": 100_000 },
      source: { method: "manual-equilibrium" },
    },
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      parameters: { gammaV: 1.4, betaE: 1.15 },
    },
  }));
  const force = result.outputs.stateResults[0].designForces.basicControl;

  assert.equal(force.value, 1_067_000);
  assert.equal(force.supportReaction, 1_167_000);
  assert.equal(force.enclosedLoad, 100_000);
  assert.equal(force.method, "reaction-minus-enclosed-load");
});

test("automatic beta and betaE are derived from the action resultant", () => {
  const connectionModel = connection({
    id: "automatic-concentration",
    columnSize: 500,
    thickness: 320,
    effectiveDepthX: 280,
    effectiveDepthY: 280,
    ratioX: 0.009,
    ratioY: 0.009,
    fck: 40,
    lowerAggregateSize: 16,
  });
  const action = new PunchingActionState({
    id: "ULS-eccentric",
    connectionId: connectionModel.id,
    localFrameId: connectionModel.localFrame.id,
    combinationType: "ULS",
    units,
    components: { fz: 500_000, mx: 50_000_000, my: -25_000_000 },
  });
  const evaluate = (code) => verifyPunching(new PunchingVerificationRequest({
    id: `automatic-${code.id}`,
    connection: connectionModel,
    actionStates: [action],
    code,
  }));
  const first = evaluate({
    id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
    parameters: {
      gammaC: 1.5,
      alphaCc: 1,
      cRdc: 0.12,
      k1: 0.1,
      sigmaCp: 0,
      concentrationMethod: "automatic",
    },
  });
  const second = evaluate({
    id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
    parameters: { gammaV: 1.4, concentrationMethod: "automatic" },
  });
  const expectedBeta = 1 + 1.8 * Math.hypot(50 / 1620, 100 / 1620);
  const expectedBetaE = Math.max(
    1.05,
    1 + 1.1 * Math.hypot(50, 100) / 780,
  );

  assert.ok(Math.abs(first.outputs.stateResults[0].beta - expectedBeta) < 1e-12);
  assert.equal(
    first.outputs.stateResults[0].concentration.method,
    "equation-6.43-rectangular-interior-biaxial",
  );
  assert.ok(Math.abs(second.outputs.stateResults[0].betaE - expectedBetaE) < 1e-12);
  assert.equal(second.outputs.stateResults[0].concentration.method, "table-8.3-interior");
});

test("external-column beta and betaE branches reproduce their closed forms", () => {
  const footprint = {
    shape: "rectangle",
    center: { x: 0, y: 0 },
    sizeX: 400,
    sizeY: 500,
  };
  const d = 250;
  const edgeU1 = 2 * 400 + 500 + 2 * Math.PI * d;
  const edge = calculateEn1992PunchingBeta2004({
    position: "edge",
    footprint,
    effectiveDepth: d,
    controlPerimeter: edgeU1,
    lineOfAction: { x: 0, y: 100 },
  });
  const edgeU1Star = 2 * 200 + 500 + 2 * Math.PI * d;
  const edgeW1 = 500 ** 2 / 4 + 400 * 500 + 4 * 400 * d
    + 8 * d ** 2 + Math.PI * d * 500;
  const expectedEdge = edgeU1 / edgeU1Star
    + 0.45 * edgeU1 / edgeW1 * 100;
  const cornerU1 = 400 + 500 + Math.PI * d;
  const corner = calculateEn1992PunchingBeta2004({
    position: "corner",
    footprint,
    effectiveDepth: d,
    controlPerimeter: cornerU1,
    lineOfAction: { x: 20, y: 30 },
  });
  const expectedCorner = cornerU1 / (200 + 250 + Math.PI * d);
  const common2023 = {
    controlPerimeterCentroid: { x: 0, y: 0 },
    controlPerimeterWidths: { x: 1000, y: 800 },
    lineOfAction: { x: 100, y: -200 },
  };
  const edge2023 = calculateEn1992PunchingBetaE2023({
    ...common2023,
    position: "edge",
  });
  const corner2023 = calculateEn1992PunchingBetaE2023({
    ...common2023,
    position: "corner",
  });

  assert.ok(Math.abs(edge.beta - expectedEdge) < 1e-12);
  assert.ok(Math.abs(corner.beta - expectedCorner) < 1e-12);
  assert.ok(Math.abs(edge2023.eb - 0.5 * (100 + Math.hypot(100, 200))) < 1e-12);
  assert.equal(corner2023.eb, 0.27 * 300);
});

test("EC2 2004 verifies vertical punching reinforcement and its outer perimeter", () => {
  const base = connection({
    id: "reinforced-2004",
    columnSize: 400,
    thickness: 300,
    effectiveDepthX: 250,
    effectiveDepthY: 250,
    ratioX: 0.0085,
    ratioY: 0.0048,
    fck: 30,
  });
  const reinforced = new PunchingConnectionModel({
    ...base.toJSON(),
    reinforcement: {
      ...base.reinforcement,
      punching: {
        present: true,
        system: "studs",
        steel: { fywd: 435 },
        layout: {
          legDiameter: 12,
          legArea: 113,
          areaPerPerimeter: 1500,
          radialSpacing: 150,
          tangentialSpacing: 300,
          firstPerimeterOffset: 125,
          perimeterCount: 6,
        },
      },
    },
  });
  const result = verifyPunching(request({
    id: "reinforced-2004-request",
    connectionModel: reinforced,
    force: 1_204_800,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
      parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
    },
  }));
  const state = result.outputs.stateResults[0];

  assert.equal(result.status, "ok");
  assert.equal(state.punchingReinforcement.system, "studs");
  assert.ok(state.punchingReinforcement.resistance.vRdCs > state.demands.basicControlPerimeter);
  assert.ok(state.demands.outerControlPerimeter < result.outputs.resistance.vRdc);
  assert.equal(result.outputs.geometry.perimeters.at(-1).role, "outer-control");
});

test("EC2 2023 verifies studs, maximum resistance and the outer control perimeter", () => {
  const base = connection({
    id: "reinforced-2023",
    columnSize: 500,
    thickness: 320,
    effectiveDepthX: 280,
    effectiveDepthY: 280,
    ratioX: 0.0091,
    ratioY: 0.0091,
    fck: 42.8,
    lowerAggregateSize: 32,
  });
  const reinforced = new PunchingConnectionModel({
    ...base.toJSON(),
    reinforcement: {
      ...base.reinforcement,
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
  });
  const result = verifyPunching(request({
    id: "reinforced-2023-request",
    connectionModel: reinforced,
    force: 1_167_000,
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      parameters: { gammaV: 1.4, betaE: 1.15 },
    },
  }));
  const state = result.outputs.stateResults[0];

  assert.equal(result.status, "ok");
  assert.ok(state.punchingReinforcement.resistance.tauRdCs > state.demands.controlPerimeter);
  assert.ok(state.punchingReinforcement.resistance.tauRdMax > state.demands.controlPerimeter);
  assert.ok(state.punchingReinforcement.outerControl.resistance.tauRdc
    > state.demands.outerControlPerimeter);
  assert.equal(result.checks.filter((check) => check.type === "punching-shear-stress").length, 3);
});
