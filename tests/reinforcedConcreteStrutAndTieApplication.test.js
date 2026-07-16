import test from "node:test";
import assert from "node:assert/strict";

import {
  ReinforcedConcreteStrutAndTieApplication,
  ReinforcedConcreteStrutAndTieModel,
  calculateEn1992NodalDesignStrength,
  calculateEn1992StrutDesignStrength,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createMaterials() {
  return {
    concreteMaterial: createNTC2018ConcreteMaterial({
      strengthClass: "C35/45",
      units,
    }),
    reinforcementMaterial: createNTC2018ReinforcementSteelMaterial({
      grade: "B450C",
      units,
    }),
  };
}

function createInput(overrides = {}) {
  const source = {
    id: "corbel-stm",
    units,
    materials: createMaterials(),
    nodes: [
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 0, y: 288 },
      { id: "C", x: 169, y: 288 },
    ],
    members: [
      {
        id: "C1",
        type: "strut",
        startNodeId: "A",
        endNodeId: "C",
        area: 100000,
        strengthModel: "transverse-tension",
      },
      {
        id: "T1",
        type: "tie",
        startNodeId: "B",
        endNodeId: "C",
        area: 1232,
      },
    ],
    loads: [{ id: "P", nodeId: "C", fy: -700000 }],
    supports: [
      { id: "SA", nodeId: "A", ux: true, uy: true },
      { id: "SB", nodeId: "B", ux: true, uy: true },
    ],
    nodalZones: [
      {
        id: "load-face",
        nodeId: "C",
        type: "cct",
        area: 45000,
        forceReference: {
          kind: "load",
          id: "P",
          normal: { x: 0, y: 1 },
        },
        factors: { k2: 1 },
      },
      {
        id: "strut-face",
        nodeId: "A",
        type: "ccc",
        area: 100000,
        forceReference: { kind: "member", id: "C1" },
      },
    ],
  };

  return { ...source, ...overrides };
}

test("EN 1992 strut and nodal strengths reproduce independent arithmetic", () => {
  const strut = calculateEn1992StrutDesignStrength({
    fck: 35,
    fcd: 19.83,
    strengthModel: "transverse-tension",
  });
  const node = calculateEn1992NodalDesignStrength({
    fck: 35,
    fcd: 19.83,
    nodeType: "cct",
  });

  assert.ok(Math.abs(strut.nuPrime - 0.86) < 1e-12);
  assert.ok(Math.abs(strut.designStrength - 10.23228) < 1e-9);
  assert.ok(Math.abs(node.designStrength - 14.49573) < 1e-9);
  assert.equal(node.factor, 0.85);
  assert.equal(node.factorSource, "EN1992-recommended");
});

test("RC strut-and-tie application reproduces the published corbel equilibrium", () => {
  const result = new ReinforcedConcreteStrutAndTieApplication().run({
    model: createInput(),
  });
  const strut = result.outputs.analysis.members.find((member) => member.id === "C1");
  const tie = result.outputs.analysis.members.find((member) => member.id === "T1");

  assert.equal(result.status, "ok");
  assert.ok(Math.abs(tie.force - 410763.888889) < 0.01);
  assert.ok(Math.abs(strut.force + 811619.967975) < 0.01);
  assert.deepEqual(result.outputs.analysis.equilibrium.residual, { fx: 0, fy: 0 });
  assert.equal(result.outputs.analysis.topology.staticIndeterminacy, 0);
  assert.equal(result.outputs.nodalZones[0].strength.factorSource, "explicit-national-parameter");
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("RC strut-and-tie verification rejects a force-sign incompatible topology", () => {
  const input = createInput();
  input.members[1] = {
    ...input.members[1],
    type: "strut",
    strengthModel: "transverse-tension",
  };
  const result = new ReinforcedConcreteStrutAndTieApplication().run({ model: input });

  assert.equal(result.status, "not-verified");
  assert.deepEqual(result.outputs.incompatibleMembers, ["T1"]);
  assert.equal(
    result.checks.find((check) => check.id === "stm-member-sign-T1").ok,
    false,
  );
});

test("RC strut-and-tie verification reports a singular assigned mechanism", () => {
  const input = createInput({
    members: [createInput().members[0]],
    nodalZones: [createInput().nodalZones[0]],
  });
  const result = new ReinforcedConcreteStrutAndTieApplication().run({ model: input });

  assert.equal(result.status, "not-supported");
  assert.match(result.summary, /unstable or singular/);
});

test("RC strut-and-tie model requires explicitly mapped nodal zones", () => {
  assert.throws(
    () => new ReinforcedConcreteStrutAndTieModel(createInput({ nodalZones: [] })),
    /At least one explicitly mapped nodal zone/,
  );
});
