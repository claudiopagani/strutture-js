import test from "node:test";
import assert from "node:assert/strict";

import {
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GlobalFemPostProcessingApplication,
  collectConcurrentJointActionStates,
  collectConcurrentLineElementActionStates,
  collectConcurrentMemberActionStates,
  collectConcurrentSectionCutStates,
  collectConcurrentSupportReactionStates,
  collectConcurrentSurfaceResultantStates,
  filterConcurrentFemStates,
} from "../src/index.js";
import { createGlobalFemBuildingFixture } from "./fixtures/globalFemBuildingFixture.js";

function createDemandSet() {
  const fixture = createGlobalFemBuildingFixture();
  return new GlobalFemPostProcessingApplication().run({
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  }).outputs.demands;
}

test("member action projection preserves every element, station and concurrent component", () => {
  const demandSet = createDemandSet();
  const first = demandSet.memberDemands.find((item) =>
    item.id === "MEMBER-COL-A-1");
  const second = demandSet.memberDemands.find((item) =>
    item.id === "MEMBER-COL-A-2");
  const multiElementMember = {
    id: "MEMBER-COL-A",
    classification: { role: "column", status: "confirmed" },
    lineElementIds: ["COL-A-1", "COL-A-2"],
    elementDemands: [...first.elementDemands, ...second.elementDemands],
  };

  const states = collectConcurrentMemberActionStates(multiElementMember);
  assert.deepEqual(
    [...new Set(states.map((state) => state.lineElementId))].sort(),
    ["COL-A-1", "COL-A-2"],
  );
  assert.equal(states.length, 8);

  const ulsStart = states.find((state) =>
    state.lineElementId === "COL-A-1" &&
    state.reference.combinationId === "ULS-1" &&
    state.station.xi === 0);
  assert.deepEqual(ulsStart.actions, {
    N: -120,
    Vy: 15,
    Vz: 8,
    T: 2,
    My: 25,
    Mz: 40,
  });

  const slsStates = filterConcurrentFemStates(states, {
    procedureId: "PROC-STATIC",
    combinationId: "SLS-1",
  });
  assert.equal(slsStates.length, 4);
  assert.ok(slsStates.every((state) =>
    state.reference.combinationId === "SLS-1"));
});

test("line action projection rejects missing components instead of inventing zeroes", () => {
  assert.throws(
    () => collectConcurrentLineElementActionStates({
      lineElementId: "E1",
      actionStates: [{
        reference: { combinationId: "ULS" },
        coordinateSystem: "element-local",
        stations: [{
          xi: 0,
          actions: { N: -10, Vy: 2, Vz: 3, My: 4, Mz: 5 },
        }],
      }],
    }),
    /actions\.T must be finite/,
  );
});

test("joint and support projections retain concurrent result references", () => {
  const demandSet = createDemandSet();
  const joint = demandSet.jointDemands.find((item) =>
    item.jointId === "JOINT-A1");
  const jointStates = collectConcurrentJointActionStates(joint);

  assert.equal(jointStates.length, 2);
  assert.ok(jointStates.every((state) => state.complete));
  assert.ok(jointStates.every((state) => state.elementEnds.length === 4));
  assert.equal(
    jointStates.find((state) =>
      state.reference.combinationId === "ULS-1").elementEnds[0].station.actions.N,
    -120,
  );

  const reactions = collectConcurrentSupportReactionStates({
    nodeId: "A0",
    globalResponses: demandSet.globalResponses,
  });
  assert.equal(reactions.length, 2);
  assert.deepEqual(
    reactions.map((state) => state.reference.combinationId).sort(),
    ["SLS-1", "ULS-1"],
  );
  assert.deepEqual(
    reactions.find((state) =>
      state.reference.combinationId === "ULS-1").forces,
    { x: -25, y: -8, z: 250 },
  );
});

test("surface and section-cut projections preserve axes and concurrent references", () => {
  const demandSet = createDemandSet();
  const wall = demandSet.surfaceDemands.find((item) => item.id === "WALL-W1");
  const shellStates = collectConcurrentSurfaceResultantStates(wall);
  const cutStates = collectConcurrentSectionCutStates({
    sectionCutIds: ["CUT-WALL-BASE", "CUT-WALL-L1"],
    globalResponses: demandSet.globalResponses,
  });

  assert.equal(shellStates.length, 4);
  assert.ok(shellStates.every((state) =>
    state.coordinateSystem === "element-local"));
  assert.deepEqual(
    [...new Set(shellStates.map((state) => state.shellElementId))].sort(),
    ["WALL-S1", "WALL-S2"],
  );
  assert.equal(cutStates.length, 4);
  assert.deepEqual(
    cutStates.find((state) =>
      state.sectionCutId === "CUT-WALL-BASE" &&
      state.reference.combinationId === "ULS-1").resultants,
    { Fx: 180, Fy: 620, Fz: 35, Mx: 90, My: 140, Mz: 25 },
  );
});
