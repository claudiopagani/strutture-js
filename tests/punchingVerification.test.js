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
}) {
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

function request({ id, connectionModel, force, code }) {
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
      source: { method: "manual", reference: "published-worked-example" },
    })],
    code,
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
  assert.ok(result.warnings.some((warning) => warning.includes("concentration factor")));
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
