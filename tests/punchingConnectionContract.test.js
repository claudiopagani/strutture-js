import test from "node:test";
import assert from "node:assert/strict";

import {
  PUNCHING_ACTION_SCHEMA_VERSION,
  PUNCHING_CONNECTION_SCHEMA_VERSION,
  PUNCHING_CONTROL_PERIMETER_SCHEMA_VERSION,
  PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION,
  PunchingActionState,
  PunchingConnectionModel,
  PunchingControlPerimeter,
  PunchingVerificationRequest,
  RC_PUNCHING_DESIGN_CODE_IDS,
  RC_PUNCHING_DESIGN_CODE_ID_VALUES,
  getRcPunchingDesignCodeManifest,
  resolvePunchingTransferFromJointActions,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

function connectionInput(overrides = {}) {
  return {
    id: "C1-L2",
    units,
    localFrame: {
      origin: { x: 1, y: 2, z: 3 },
    },
    slab: {
      thickness: 0.25,
      boundary: [
        { x: -3, y: -2 },
        { x: 3, y: -2 },
        { x: 3, y: 2 },
        { x: -3, y: 2 },
        { x: -3, y: -2 },
      ],
      openings: [{
        id: "O1",
        boundary: [
          { x: 1, y: 0.5 },
          { x: 1.5, y: 0.5 },
          { x: 1.5, y: 1 },
          { x: 1, y: 1 },
        ],
      }],
    },
    support: {
      id: "C1",
      kind: "column",
      footprint: {
        shape: "rectangle",
        center: { x: 0, y: 0 },
        sizeX: 0.4,
        sizeY: 0.5,
        rotation: 15,
      },
      memberIdsAbove: ["C1-L2-L3"],
      memberIdsBelow: ["C1-L1-L2"],
    },
    ...overrides,
  };
}

test("punching connection normalizes geometry and remains serializable", () => {
  const connection = new PunchingConnectionModel(connectionInput());
  const serialized = connection.toJSON();

  assert.equal(connection.schemaVersion, PUNCHING_CONNECTION_SCHEMA_VERSION);
  assert.deepEqual(connection.units, { force: "N", length: "mm" });
  assert.deepEqual(connection.localFrame.origin, { x: 1000, y: 2000, z: 3000 });
  assert.deepEqual(connection.localFrame.zAxis, { x: 0, y: 0, z: 1 });
  assert.equal(connection.slab.thickness, 250);
  assert.equal(connection.slab.boundary.length, 4);
  assert.equal(connection.slab.openings[0].boundary[0].x, 1000);
  assert.equal(connection.support.footprint.sizeX, 400);
  assert.equal(connection.support.footprint.sizeY, 500);
  assert.equal(connection.metadata.sourceUnitSystem.force, "kN");
  assert.doesNotThrow(() => JSON.stringify(serialized));
});

test("punching connection validates the local frame and non-degenerate rings", () => {
  assert.throws(
    () => new PunchingConnectionModel(connectionInput({
      localFrame: {
        xAxis: { x: 1, y: 0, z: 0 },
        yAxis: { x: 1, y: 0, z: 0 },
      },
    })),
    /must be orthogonal/,
  );

  assert.throws(
    () => new PunchingConnectionModel(connectionInput({
      slab: {
        thickness: 0.25,
        boundary: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    })),
    /non-zero plan area/,
  );
});

test("punching connection normalizes verification material and reinforcement data", () => {
  const input = connectionInput({
    materials: {
      concrete: { fck: 30_000 },
      concreteAggregate: { lowerSize: 0.016 },
    },
    reinforcement: {
      flexuralTension: {
        x: { effectiveDepth: 0.21, ratio: 0.008 },
        y: { effectiveDepth: 0.20, ratio: 0.007 },
      },
    },
  });
  const connection = new PunchingConnectionModel(input);

  assert.equal(connection.materials.concrete.fck, 30);
  assert.equal(connection.materials.concreteAggregate.lowerSize, 16);
  assert.equal(connection.reinforcement.flexuralTension.x.effectiveDepth, 210);
  assert.equal(connection.reinforcement.flexuralTension.y.effectiveDepth, 200);
  assert.equal(connection.reinforcement.flexuralTension.x.ratio, 0.008);
});

test("punching reinforcement layout is normalized into the shared serializable contract", () => {
  const connection = new PunchingConnectionModel(connectionInput({
    materials: { concrete: { fck: 30_000 } },
    reinforcement: {
      punching: {
        present: true,
        system: "studs",
        steel: { fywk: 500_000, gammaS: 1.15 },
        layout: {
          legDiameter: 0.012,
          legArea: 0.000113,
          areaPerPerimeter: 0.0012,
          radialSpacing: 0.15,
          tangentialSpacing: 0.2,
          firstPerimeterOffset: 0.1,
          perimeterCount: 4,
        },
      },
    },
  }));
  const punching = connection.reinforcement.punching;

  assert.equal(punching.system, "studs");
  assert.equal(punching.steel.fywk, 500);
  assert.equal(punching.layout.legDiameter, 12);
  assert.equal(punching.layout.legArea, 113);
  assert.equal(punching.layout.areaPerPerimeter, 1200);
  assert.equal(punching.layout.radialSpacing, 150);
  assert.doesNotThrow(() => JSON.stringify(connection.toJSON()));
});

test("manual punching action state preserves signs and converts units", () => {
  const state = new PunchingActionState({
    id: "ULS-01",
    connectionId: "C1-L2",
    localFrameId: "C1-L2:local-frame",
    combinationType: "uls fundamental",
    units,
    referencePoint: { x: 0.1, y: -0.2, z: 0 },
    components: { fz: 850, mx: 120, my: -40 },
    source: { method: "manual", reference: "engineer-supplied" },
  });

  assert.equal(state.schemaVersion, PUNCHING_ACTION_SCHEMA_VERSION);
  assert.equal(state.combinationType, "ULS_FUNDAMENTAL");
  assert.deepEqual(state.referencePoint, { x: 100, y: -200, z: 0 });
  assert.deepEqual(state.components, {
    fz: 850_000,
    mx: 120_000_000,
    my: -40_000_000,
  });
  assert.equal(state.source.method, "manual");
  assert.doesNotThrow(() => JSON.stringify(state.toJSON()));
});

test("punching demand normalizes reaction, direct force and enclosed loads", () => {
  const state = new PunchingActionState({
    id: "ULS-demand",
    connectionId: "C1-L2",
    units,
    punchingDemand: {
      supportReaction: 900,
      punchingForceByPerimeter: { "support-face": 880 },
      enclosedLoadByPerimeter: { "basic-control": 35 },
      source: { method: "tributary-load-balance" },
    },
  });

  assert.equal(state.punchingDemand.supportReaction, 900_000);
  assert.equal(
    state.punchingDemand.punchingForceByPerimeter["support-face"],
    880_000,
  );
  assert.equal(
    state.punchingDemand.enclosedLoadByPerimeter["basic-control"],
    35_000,
  );
  assert.equal(state.punchingDemand.source.method, "tributary-load-balance");
  assert.throws(
    () => new PunchingActionState({
      id: "ULS-negative-demand",
      connectionId: "C1-L2",
      units,
      punchingDemand: { supportReaction: -1 },
    }),
    /must be non-negative/,
  );
});

test("segment-based punching perimeter calculates length and line centroid", () => {
  const perimeter = new PunchingControlPerimeter({
    id: "u-open",
    codeId: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
    role: "basic-control",
    position: "edge",
    offset: 0.5,
    units,
    components: [{
      closed: false,
      segments: [
        { type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
        {
          type: "arc",
          center: { x: 1, y: 0.5 },
          radius: 0.5,
          startAngle: -Math.PI / 2,
          sweepAngle: Math.PI,
        },
        { type: "line", start: { x: 1, y: 1 }, end: { x: 0, y: 1 } },
      ],
    }],
  });

  assert.equal(perimeter.schemaVersion, PUNCHING_CONTROL_PERIMETER_SCHEMA_VERSION);
  assert.ok(Math.abs(perimeter.properties.length - (2000 + 500 * Math.PI)) < 1e-9);
  assert.ok(Math.abs(perimeter.properties.lineCentroid.y - 500) < 1e-9);
  assert.equal(perimeter.properties.segmentCount, 3);
  assert.doesNotThrow(() => JSON.stringify(perimeter.toJSON()));

  assert.throws(
    () => new PunchingControlPerimeter({
      id: "discontinuous",
      codeId: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
      role: "basic-control",
      position: "edge",
      units,
      components: [{
        segments: [
          { type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
          { type: "line", start: { x: 2, y: 0 }, end: { x: 3, y: 0 } },
        ],
      }],
    }),
    /continuous curve/,
  );
});

test("joint equilibrium reduces eccentric vertical actions to a common point", () => {
  const state = resolvePunchingTransferFromJointActions({
    id: "ULS-01-resolved",
    connectionId: "C1-L2",
    localFrameId: "C1-L2:local-frame",
    combinationType: "ULS",
    units,
    referencePoint: { x: 0, y: 0, z: 0 },
    contributors: [
      {
        id: "column-below",
        kind: "column-end",
        side: "below",
        referencePoint: { x: 0, y: 0, z: 0 },
        components: { fz: 1000, mx: 10, my: 20 },
      },
      {
        id: "column-above",
        kind: "column-end",
        side: "above",
        referencePoint: { x: 0.2, y: -0.1, z: 0 },
        components: { fz: -700, mx: -5, my: -8 },
      },
    ],
  });

  assert.deepEqual(state.components, {
    fz: 300_000,
    mx: 75_000_000,
    my: 152_000_000,
  });
  assert.equal(state.source.method, "joint-equilibrium");
  assert.deepEqual(state.source.balance.slabActionOnJoint, {
    fz: -300_000,
    mx: -75_000_000,
    my: -152_000_000,
  });
  assert.deepEqual(state.source.balance.residual, { fz: 0, mx: 0, my: 0 });
  assert.doesNotThrow(() => JSON.stringify(state.toJSON()));
});

test("joint equilibrium rejects out-of-scope components and ambiguous empty input", () => {
  assert.throws(
    () => resolvePunchingTransferFromJointActions({
      id: "empty",
      connectionId: "C1-L2",
      units,
      contributors: [],
    }),
    /at least one non-slab action contributor/,
  );

  assert.throws(
    () => resolvePunchingTransferFromJointActions({
      id: "horizontal",
      connectionId: "C1-L2",
      units,
      contributors: [{
        id: "column",
        components: { fx: 1, fz: 10 },
      }],
    }),
    /fx is outside the punching transfer contract/,
  );
});

test("punching verification request selects either EC2 generation as input", () => {
  const connection = new PunchingConnectionModel(connectionInput());
  const state = new PunchingActionState({
    id: "ULS-01",
    connectionId: connection.id,
    localFrameId: connection.localFrame.id,
    combinationType: "ULS",
    units,
    components: { fz: 850, mx: 120, my: -40 },
  });
  const firstGeneration = new PunchingVerificationRequest({
    id: "C1-L2-EC2-2004",
    connection,
    actionStates: [state],
    code: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
  });
  const secondGeneration = new PunchingVerificationRequest({
    id: "C1-L2-EC2-2023",
    connection,
    actionStates: [state],
    code: {
      id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
      nationalAnnex: { country: "IT", id: "pending-selection" },
      parameterProfile: "project-explicit",
      parameters: { gammaC: 1.5 },
    },
  });

  assert.deepEqual(RC_PUNCHING_DESIGN_CODE_ID_VALUES, [
    "EN1992_1_1_2004_A1_2014",
    "EN1992_1_1_2023",
  ]);
  assert.equal(
    firstGeneration.schemaVersion,
    PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION,
  );
  assert.equal(firstGeneration.code.edition, "2004");
  assert.deepEqual(firstGeneration.code.amendments, ["AC:2010", "A1:2014"]);
  assert.equal(firstGeneration.code.nationalAnnex, null);
  assert.equal(firstGeneration.code.parameterProfile, null);
  assert.equal(secondGeneration.code.edition, "2023");
  assert.equal(secondGeneration.code.punchingReference, "8.4");
  assert.equal(secondGeneration.code.nationalAnnex.country, "IT");
  assert.equal(secondGeneration.code.parameters.gammaC, 1.5);
  assert.strictEqual(firstGeneration.connection, secondGeneration.connection);
  assert.strictEqual(firstGeneration.actionStates[0], secondGeneration.actionStates[0]);
  assert.doesNotThrow(() => JSON.stringify(firstGeneration.toJSON()));
  assert.doesNotThrow(() => JSON.stringify(secondGeneration.toJSON()));
});

test("punching verification request rejects unknown codes and mismatched actions", () => {
  const connection = new PunchingConnectionModel(connectionInput());
  const mismatchedState = new PunchingActionState({
    id: "ULS-other",
    connectionId: "another-connection",
    units,
    components: { fz: 100 },
  });

  assert.throws(
    () => getRcPunchingDesignCodeManifest("EC2-latest"),
    /Unsupported RC punching design code/,
  );
  assert.throws(
    () => new PunchingVerificationRequest({
      id: "unknown-code",
      connection,
      actionStates: [mismatchedState],
      code: "EC2-latest",
    }),
    /targets connection another-connection/,
  );
  assert.throws(
    () => new PunchingVerificationRequest({
      id: "missing-actions",
      connection,
      actionStates: [],
      code: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
    }),
    /at least one action state/,
  );
});
