import test from "node:test";
import assert from "node:assert/strict";

import {
  RESULT_STATUS,
  RcBuildingVerificationApplication,
} from "../src/index.js";
import {
  configureCompleteRcBuildingFixture,
  createGlobalFemBuildingFixture,
} from "./fixtures/globalFemBuildingFixture.js";

function addCompliantLinearDynamicData(fixture) {
  fixture.capabilities.analyses.responseSpectrum = true;
  fixture.analysis.spectra = ["X", "Y"].map((direction) => ({
    id: `SPECTRUM-${direction}`,
    direction,
    dampingRatio: 0.05,
    points: [
      { period: 0, acceleration: 1 },
      { period: 1, acceleration: 0.5 },
    ],
  }));
  fixture.analysis.procedures.push({
    id: "PROC-RS",
    type: "response-spectrum",
    massSourceId: "MASS-1",
    requestedModes: 2,
    directions: ["X", "Y"],
    requestedOutputs: ["modes"],
    spectrumIds: ["SPECTRUM-X", "SPECTRUM-Y"],
    modalCombinationMethod: "cqc",
    componentCombinationRule: "100-30-30",
    accidentalEccentricities: ["L1", "L2"].flatMap((storeyId) =>
      ["X", "Y"].flatMap((direction) => [1, -1].map((sign) => ({
        id: `ECC-${storeyId}-${direction}-${sign > 0 ? "P" : "N"}`,
        storeyId,
        direction,
        offset: sign * 0.2,
      })))),
  });
  fixture.result.results.modes[0].participatingMassRatios = {
    X: 0.8,
    Y: 0.06,
  };
  fixture.result.results.modes[1].participatingMassRatios = {
    X: 0.06,
    Y: 0.8,
  };
  fixture.result.results.modes.push(
    ...fixture.result.results.modes.map((mode) => ({
      ...mode,
      procedureId: "PROC-RS",
    })),
  );
  fixture.linearDynamicAssessmentInput = {
    modalProcedureId: "PROC-MODAL",
    responseSpectrumProcedureId: "PROC-RS",
    meanPlanDimensions: { X: 4, Y: 4 },
  };
}

test("incomplete RC building input cannot emit a positive compliance result", () => {
  const fixture = createGlobalFemBuildingFixture();
  const result = new RcBuildingVerificationApplication().run(fixture);

  assert.equal(
    result.status,
    RESULT_STATUS.NOT_VERIFIED,
    JSON.stringify(result.outputs.errors ?? []),
  );
  assert.equal(result.isSuccessful(), false);
  assert.match(result.summary, /missing|not satisfied/i);
  assert.equal(result.outputs.behavior.status, "not-evaluated");
  assert.equal(result.outputs.behavior.behavior, null);
});

test("missing optional mapping is reported without a runtime failure", () => {
  const fixture = createGlobalFemBuildingFixture();
  delete fixture.mapping;

  const result = new RcBuildingVerificationApplication().run(fixture);
  const regularityReadiness = result.outputs.readiness.find(
    (entry) => entry.assessment === "structural-regularity",
  );

  assert.equal(result.status, RESULT_STATUS.NOT_VERIFIED);
  assert.equal(regularityReadiness.status, "blocked");
  assert.ok(regularityReadiness.missing.includes("mapping"));
});

test("structural behavior is evaluated only from explicit project choices", () => {
  const nonDissipativeFixture = createGlobalFemBuildingFixture();
  nonDissipativeFixture.behavior = "non-dissipative";
  nonDissipativeFixture.structuralType = "frame";
  const nonDissipative = new RcBuildingVerificationApplication().run(
    nonDissipativeFixture,
  );

  assert.equal(nonDissipative.outputs.behavior.status, "evaluated");
  assert.equal(nonDissipative.outputs.behavior.behavior, "non-dissipative");
  assert.equal(nonDissipative.outputs.behavior.q, 1.5);
  assert.ok(nonDissipative.outputs.jointHierarchy.results.every((item) =>
    item.status === "not-applicable"));

  const dissipativeFixture = createGlobalFemBuildingFixture();
  dissipativeFixture.behavior = "cd-a";
  dissipativeFixture.structuralType = "frame";
  dissipativeFixture.structuralBehaviorParameters = {
    frameStoreyCount: 2,
    frameBayCount: 2,
  };
  const dissipative = new RcBuildingVerificationApplication().run(
    dissipativeFixture,
  );

  assert.equal(dissipative.outputs.behavior.status, "not-evaluated");
  assert.match(dissipative.outputs.behavior.reason, /regularity assessment/i);
});

test("an injected verifier without an explicit status cannot default to ok", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.memberVerifiers = {
    beam: () => ({ checks: [] }),
    column: () => ({ checks: [] }),
  };

  const result = new RcBuildingVerificationApplication().run(fixture);
  const attempted = result.outputs.members.results.filter(
    (entry) => entry.role === "beam" || entry.role === "column",
  );

  assert.ok(attempted.length > 0);
  assert.ok(attempted.every((entry) => entry.status === RESULT_STATUS.NOT_VERIFIED));
});

test("member verifiers receive the solver-neutral concurrent demand context", () => {
  const fixture = createGlobalFemBuildingFixture();
  const received = [];
  fixture.memberVerifiers = {
    beam: (payload) => {
      received.push(payload);
      return { status: RESULT_STATUS.NOT_VERIFIED, checks: [] };
    },
    column: (payload) => {
      received.push(payload);
      return { status: RESULT_STATUS.NOT_VERIFIED, checks: [] };
    },
  };

  const result = new RcBuildingVerificationApplication().run(fixture);
  const column = received.find((payload) =>
    payload.member.id === "MEMBER-COL-A-1");

  assert.equal(
    result.outputs.globalFemDemandSet.schema,
    "strutture-js/global-fem-demand-set",
  );
  assert.equal(
    column.demand.schema,
    "strutture-js/rc-member-fem-demand-context",
  );
  assert.equal(column.demand.units.force, "kN");
  assert.equal(column.demand.concurrentActionStates.length, 4);
  assert.equal(column.demand.concurrentResistanceActionStates.length, 4);
  assert.ok(column.demand.concurrentActionStates.every((state) =>
    state.lineElementId === "COL-A-1"));
  assert.equal(
    column.demand.concurrentResistanceActionStates[0]
      .resistanceCoordinateSystem.id,
    "RESISTANCE-COL-A-1",
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.outputs.globalFemDemandSet)),
    result.outputs.globalFemDemandSet,
  );
});

test("joint and wall consumers receive explicitly axis-mapped concurrent FEM contexts", () => {
  const fixture = createGlobalFemBuildingFixture();
  const receivedJoints = [];
  let receivedWall = null;
  fixture.jointVerifier = (payload) => {
    receivedJoints.push(payload);
    return { status: RESULT_STATUS.NOT_VERIFIED, checks: [] };
  };
  fixture.wallSections = {
    "WALL-W1": {
      section: {},
      selectActionsFromFem: ({ demand }) => {
        receivedWall = demand;
        return null;
      },
    },
  };

  const result = new RcBuildingVerificationApplication().run(fixture);

  assert.equal(receivedJoints.length, 2);
  assert.equal(
    receivedJoints[0].demand.schema,
    "strutture-js/rc-joint-fem-demand-context",
  );
  assert.equal(receivedJoints[0].demand.concurrentActionStates.length, 2);
  assert.equal(
    receivedJoints[0].demand.concurrentResistanceActionStates.length,
    2,
  );
  assert.ok(receivedJoints[0].demand.concurrentActionStates.every((state) =>
    state.elementEnds.length === 4));
  assert.equal(receivedWall.concurrentShellResultantStates.length, 4);
  assert.equal(receivedWall.concurrentSectionCutStates.length, 4);
  assert.equal(receivedWall.concurrentResistanceSectionCutStates.length, 4);
  assert.equal(
    receivedWall.concurrentResistanceSectionCutStates[0]
      .resistanceResultants.axialForce,
    620,
  );
  assert.equal(result.outputs.walls.results[0].status, RESULT_STATUS.NOT_ANALYZED);
});

test("building workflow exposes a complete solver-neutral linear dynamic assessment", () => {
  const fixture = createGlobalFemBuildingFixture();
  addCompliantLinearDynamicData(fixture);

  const result = new RcBuildingVerificationApplication().run(fixture);
  const readiness = result.outputs.readiness.find((entry) =>
    entry.assessment === "linear-dynamic-analysis");

  assert.equal(
    result.status,
    RESULT_STATUS.NOT_VERIFIED,
    JSON.stringify(result.outputs.errors ?? []),
  );
  assert.equal(readiness.status, "ready");
  assert.equal(result.outputs.linearDynamicAnalysis.status, "ok");
  assert.equal(result.outputs.linearDynamicAnalysis.checks.length, 6);
  assert.ok(Math.abs(
    result.outputs.linearDynamicAnalysis
      .massParticipation.directions[0].totalParticipatingMassRatio -
      0.86,
  ) < 1e-12);
});

test("wall-system workflow verifies every mapped concurrent section-cut state", () => {
  const fixture = createGlobalFemBuildingFixture();
  const received = [];
  fixture.behavior = "non-dissipative";
  fixture.structuralType = "wall";
  fixture.wallSectionStateVerifier = (payload) => {
    received.push(payload);
    return {
      flexure: { ok: true, demand: 1, capacity: 2 },
      shear: { ok: true, demand: 1, capacity: 2 },
    };
  };
  fixture.wallSystemData = {
    "WALL-W1": {
      systemType: "wall",
      redistributionApplied: false,
      additionalChecks: [],
      couplingBeamInputs: [],
      detailingInput: {
        wallThickness: 0.20,
        clearStoreyHeight: 3,
        supportedFromFoundationOrRigidBox: true,
        irregularOpeningsIncludedInAnalysis: true,
        verticalReinforcementRatio: 0.002,
        horizontalReinforcementRatio: 0.002,
        maximumBarDiameter: 0.016,
        barsOnBothFaces: true,
        maximumBarSpacing: 0.25,
        tiesPerSquareMetre: 9,
      },
    },
  };

  const result = new RcBuildingVerificationApplication().run(fixture);
  const wallSystem = result.outputs.wallSystems.results[0];

  assert.equal(received.length, 4);
  assert.ok(received.every((payload) =>
    payload.state.resistanceCoordinateSystem.id ===
      "RESISTANCE-WALL-W1"));
  assert.equal(wallSystem.sourceStateCount, 4);
  assert.equal(wallSystem.resistanceStateCount, 4);
  assert.equal(wallSystem.status, "ok");
});

test("wall-system workflow cannot complete when a required state check is missing", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.behavior = "non-dissipative";
  fixture.structuralType = "wall";
  fixture.wallSectionStateVerifier = ({ state }) => ({
    flexure: { ok: true },
    ...(state.sectionCutId === "CUT-WALL-BASE"
      ? { shear: { ok: true } }
      : {}),
  });
  fixture.wallSystemData = {
    "WALL-W1": {
      systemType: "wall",
      redistributionApplied: false,
      additionalChecks: [],
      couplingBeamInputs: [],
      detailingInput: {
        wallThickness: 0.20,
        clearStoreyHeight: 3,
        supportedFromFoundationOrRigidBox: true,
        irregularOpeningsIncludedInAnalysis: true,
        verticalReinforcementRatio: 0.002,
        horizontalReinforcementRatio: 0.002,
        maximumBarDiameter: 0.016,
        barsOnBothFaces: true,
        maximumBarSpacing: 0.25,
        tiesPerSquareMetre: 9,
      },
    },
  };

  const result = new RcBuildingVerificationApplication().run(fixture);
  const wallSystem = result.outputs.wallSystems.results[0];

  assert.equal(wallSystem.status, "not-implemented");
  assert.ok(wallSystem.sectionStateAssessments.some((assessment) =>
    assessment.missing.includes("shear")));
});

test("slab workflow covers every shell state and amplified diaphragm action", () => {
  const fixture = createGlobalFemBuildingFixture();
  const slabStates = [];
  const diaphragmStates = [];
  fixture.slabStateVerifier = ({ state, limitState }) => {
    slabStates.push({ state, limitState });
    return limitState === "ultimate"
      ? {
          bending: { ok: true },
          oneWayShear: { ok: true },
        }
      : {
          stress: { ok: true },
          cracking: { ok: true },
          deflection: { ok: true },
        };
  };
  fixture.diaphragmStateVerifier = (payload) => {
    diaphragmStates.push(payload);
    return {
      capacityChecks: [{
        id: "diaphragm-membrane-resistance",
        demand: Math.abs(payload.designActions.Nx),
        capacity: 1000,
        ok: true,
      }],
    };
  };
  fixture.slabSystemData = Object.fromEntries(
    ["SLAB-1", "SLAB-2"].map((slabId) => [
      slabId,
      {
        detailingChecks: [{ id: `${slabId}-detailing`, ok: true }],
        punchingRequired: false,
        punchingNotApplicableReason:
          "Synthetic orchestration fixture declares no punching connection.",
        diaphragmRequired: true,
      },
    ]),
  );

  const result = new RcBuildingVerificationApplication().run(fixture);

  assert.equal(slabStates.length, 4);
  assert.deepEqual(
    slabStates.map((item) => item.limitState).sort(),
    ["serviceability", "serviceability", "ultimate", "ultimate"],
  );
  assert.equal(diaphragmStates.length, 2);
  assert.equal(diaphragmStates[0].designActions.Nx, 156);
  assert.ok(result.outputs.slabSystems.results.every((slab) =>
    slab.status === "ok" &&
    slab.resistanceStateCount === 2));
});

test("slab workflow cannot complete when an SLS family is omitted", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.slabStateVerifier = ({ limitState }) =>
    limitState === "ultimate"
      ? {
          bending: { ok: true },
          oneWayShear: { ok: true },
        }
      : {
          stress: { ok: true },
          cracking: { ok: true },
        };
  fixture.slabSystemData = Object.fromEntries(
    ["SLAB-1", "SLAB-2"].map((slabId) => [
      slabId,
      {
        detailingChecks: [{ id: `${slabId}-detailing`, ok: true }],
        punchingRequired: false,
        punchingNotApplicableReason: "No punching connection.",
        diaphragmRequired: false,
        diaphragmNotApplicableReason: "No diaphragm action in this test.",
      },
    ]),
  );

  const result = new RcBuildingVerificationApplication().run(fixture);

  assert.ok(result.outputs.slabSystems.results.every((slab) =>
    slab.status === "not-implemented"));
  assert.ok(result.outputs.slabSystems.results[0]
    .stateAssessments.some((assessment) =>
      assessment.missing.includes("deflection")));
});

test("punching orchestration requires every ultimate combination", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.mapping.punchingConnections.push({
    id: "PUNCH-A1",
    slabId: "SLAB-1",
    nodeId: "A1",
    shellElementIds: ["SLAB-S1"],
    supportLineElementEnds: [
      { lineElementId: "COL-A-1", end: "end" },
      { lineElementId: "COL-A-2", end: "start" },
    ],
  });
  fixture.slabStateVerifier = ({ limitState }) =>
    limitState === "ultimate"
      ? {
          bending: { ok: true },
          oneWayShear: { ok: true },
        }
      : {
          stress: { ok: true },
          cracking: { ok: true },
          deflection: { ok: true },
        };
  fixture.punchingVerifier = ({ connection }) => ({
    assessedCombinationIds: ["ULS-1"],
    checks: [{
      id: `punching-${connection.id}`,
      ok: true,
    }],
  });
  fixture.slabSystemData = {
    "SLAB-1": {
      detailingChecks: [{ id: "SLAB-1-detailing", ok: true }],
      punchingRequired: true,
      diaphragmRequired: false,
      diaphragmNotApplicableReason: "No diaphragm action in this test.",
    },
    "SLAB-2": {
      detailingChecks: [{ id: "SLAB-2-detailing", ok: true }],
      punchingRequired: false,
      punchingNotApplicableReason: "No mapped concentrated support.",
      diaphragmRequired: false,
      diaphragmNotApplicableReason: "No diaphragm action in this test.",
    },
  };

  const result = new RcBuildingVerificationApplication().run(fixture);
  const punching = result.outputs.slabSystems.results[0].punching;

  assert.equal(punching.status, "ok");
  assert.equal(punching.connections.length, 1);
  assert.deepEqual(
    punching.connections[0].missingCombinationIds,
    [],
  );
});

test("foundation workflow maps and groups every concurrent support reaction", () => {
  const fixture = createGlobalFemBuildingFixture();
  const received = [];
  fixture.foundationSystemData = Object.fromEntries(
    ["A0", "B0", "C0", "D0"].map((nodeId) => [
      `FOUNDATION-${nodeId}`,
      { localVerificationModelId: `FOOTING-${nodeId}` },
    ]),
  );
  fixture.foundationVerifier = (payload) => {
    received.push(payload);
    return {
      assessedCombinationIds: ["ULS-1", "SLS-1"],
      structural: { ok: true },
      geotechnicalUltimate: { ok: true },
      serviceability: { ok: true },
      supportConnection: { ok: true },
      seismicFoundation: { ok: true },
    };
  };

  const result = new RcBuildingVerificationApplication().run(fixture);

  assert.equal(received.length, 4);
  assert.ok(received.every((payload) =>
    payload.demand.concurrentReactionStates.length === 2 &&
    payload.demand.concurrentResistanceReactionStates.length === 2 &&
    payload.demand.groupedResistanceReactionStates.length === 2 &&
    payload.demand.groupedResistanceReactionStates.every((group) =>
      group.complete)));
  assert.ok(result.outputs.foundationSystems.results.every((foundation) =>
    foundation.status === "ok"));
});

test("foundation workflow cannot complete without serviceability verification", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.foundationSystemData = Object.fromEntries(
    ["A0", "B0", "C0", "D0"].map((nodeId) => [
      `FOUNDATION-${nodeId}`,
      {},
    ]),
  );
  fixture.foundationVerifier = () => ({
    assessedCombinationIds: ["ULS-1", "SLS-1"],
    structural: { ok: true },
    geotechnicalUltimate: { ok: true },
    supportConnection: { ok: true },
    seismicFoundation: { ok: true },
  });

  const result = new RcBuildingVerificationApplication().run(fixture);

  assert.ok(result.outputs.foundationSystems.results.every((foundation) =>
    foundation.status === "not-implemented" &&
    foundation.missing.includes("serviceability")));
});

test("complete RC building fixture closes every declared readiness assessment", () => {
  const fixture = configureCompleteRcBuildingFixture(
    createGlobalFemBuildingFixture(),
  );

  const result = new RcBuildingVerificationApplication().run(fixture);

  assert.equal(result.status, RESULT_STATUS.OK);
  assert.equal(result.isSuccessful(), true);
  assert.equal(result.outputs.completeness.complete, true);
  assert.equal(
    result.outputs.blockedAssessments.length,
    0,
    JSON.stringify(result.outputs.blockedAssessments),
  );
  assert.ok(result.outputs.readiness.every((assessment) =>
    assessment.status !== "blocked"));
  assert.equal(result.outputs.linearDynamicAnalysis.status, "ok");
  assert.ok(result.outputs.members.results.every((item) =>
    item.status === "ok"));
  assert.ok(result.outputs.joints.results.every((item) =>
    item.status === "ok"));
  assert.ok(result.outputs.wallSystems.results.every((item) =>
    item.status === "ok"));
  assert.ok(result.outputs.slabSystems.results.every((item) =>
    item.status === "ok"));
  assert.ok(result.outputs.foundationSystems.results.every((item) =>
    item.status === "ok"));
});
