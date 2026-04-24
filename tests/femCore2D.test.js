import test from "node:test";
import assert from "node:assert/strict";

import {
  DofRegistry,
  FemAssembler2D,
  LinearStaticSolver2D,
  NodalLoad,
  Node,
  Support,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createNode(id, x = 0) {
  return new Node({ id, x, units });
}

function createAxialSpringElement({ id, startNode, endNode, stiffness }) {
  return {
    id,
    nodes: [startNode, endNode],
    getDofIds(dofRegistry) {
      return [
        dofRegistry.getDofId(startNode, "ux"),
        dofRegistry.getDofId(endNode, "ux"),
      ];
    },
    globalStiffness() {
      return [
        [stiffness, -stiffness],
        [-stiffness, stiffness],
      ];
    },
  };
}

test("dof registry assigns stable 2D frame DOFs to registered nodes", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 1000);
  const registry = new DofRegistry();

  registry.registerNodes([nodeA, nodeB]);

  assert.equal(registry.size(), 6);
  assert.equal(registry.getDofId(nodeA, "ux"), "A.ux");
  assert.equal(registry.getIndex(nodeA, "ux"), 0);
  assert.equal(registry.getIndex(nodeA, "uy"), 1);
  assert.equal(registry.getIndex(nodeA, "rz"), 2);
  assert.equal(registry.getIndex(nodeB, "rz"), 5);
  assert.deepEqual(registry.getDofIds(), [
    "A.ux",
    "A.uy",
    "A.rz",
    "B.ux",
    "B.uy",
    "B.rz",
  ]);
});

test("fem assembler builds global stiffness and nodal load vectors", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 1000);
  const element = createAxialSpringElement({
    id: "spring-AB",
    startNode: nodeA,
    endNode: nodeB,
    stiffness: 100,
  });
  const load = new NodalLoad({
    node: nodeB,
    components: { fx: 50 },
    units,
  });
  const assembly = new FemAssembler2D().assemble({
    nodes: [nodeA, nodeB],
    elements: [element],
    nodalLoads: [load],
  });

  const aUx = assembly.dofRegistry.getIndex(nodeA, "ux");
  const bUx = assembly.dofRegistry.getIndex(nodeB, "ux");

  approx(assembly.stiffnessMatrix[aUx][aUx], 100);
  approx(assembly.stiffnessMatrix[aUx][bUx], -100);
  approx(assembly.stiffnessMatrix[bUx][aUx], -100);
  approx(assembly.stiffnessMatrix[bUx][bUx], 100);
  approx(assembly.loadVector[bUx], 50);
});

test("linear static solver partitions constrained DOFs and recovers reactions", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 1000);
  const element = createAxialSpringElement({
    id: "spring-AB",
    startNode: nodeA,
    endNode: nodeB,
    stiffness: 100,
  });
  const supports = [
    new Support({
      id: "fixed-A",
      node: nodeA,
      restraints: { ux: true, uy: true, rz: true },
    }),
    new Support({
      id: "roller-B",
      node: nodeB,
      restraints: { uy: true, rz: true },
    }),
  ];
  const load = new NodalLoad({
    node: nodeB,
    components: { fx: 50 },
    units,
  });

  const result = new LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeB],
    elements: [element],
    supports,
    nodalLoads: [load],
  });

  approx(result.displacementByNode.B.ux, 0.5);
  approx(result.displacementByNode.A.ux, 0);
  approx(result.reactionByNode.A.ux, -50);
  approx(result.reactionByNode.B.ux, 0);
  assert.deepEqual(result.freeDofIds, ["B.ux"]);
  assert.deepEqual(result.constrainedDofIds, [
    "A.ux",
    "A.uy",
    "A.rz",
    "B.uy",
    "B.rz",
  ]);
});

test("linear static solver includes nodal support springs in the assembled stiffness", () => {
  const node = createNode("A");
  const support = new Support({
    id: "spring-A",
    node,
    restraints: { uy: true, rz: true },
    springStiffness: { ux: 100 },
  });
  const load = new NodalLoad({
    node,
    components: { fx: 50 },
    units,
  });

  const result = new LinearStaticSolver2D().solve({
    nodes: [node],
    supports: [support],
    nodalLoads: [load],
  });

  approx(result.displacementByNode.A.ux, 0.5);
  const uxIndex = result.dofRegistry.getIndex(node, "ux");
  approx(result.stiffnessMatrix[uxIndex][uxIndex], 100);
});

test("linear static solver rejects conflicting displacement constraints", () => {
  const node = createNode("A");

  assert.throws(
    () =>
      new LinearStaticSolver2D().solve({
        nodes: [node],
        constraints: [
          { node, dof: "ux", value: 0 },
          { node, dof: "ux", value: 1 },
        ],
      }),
    /conflicting constraints/i,
  );
});

test("linear static solver condenses equal-DOF diaphragm constraints onto a master control DOF", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 1);
  const nodeC = createNode("C", 2);
  const nodeM = createNode("M", 1.5);
  const elementAB = createAxialSpringElement({
    id: "spring-AB",
    startNode: nodeA,
    endNode: nodeB,
    stiffness: 100,
  });
  const elementAC = createAxialSpringElement({
    id: "spring-AC",
    startNode: nodeA,
    endNode: nodeC,
    stiffness: 200,
  });
  const supports = [
    new Support({
      id: "fixed-A",
      node: nodeA,
      restraints: { ux: true, uy: true, rz: true },
    }),
    new Support({
      id: "guide-B",
      node: nodeB,
      restraints: { uy: true, rz: true },
    }),
    new Support({
      id: "guide-C",
      node: nodeC,
      restraints: { uy: true, rz: true },
    }),
    new Support({
      id: "guide-M",
      node: nodeM,
      restraints: { uy: true, rz: true },
    }),
  ];
  const nodalLoads = [
    new NodalLoad({
      node: nodeB,
      components: { fx: 30 },
      units,
    }),
    new NodalLoad({
      node: nodeC,
      components: { fx: 60 },
      units,
    }),
  ];
  const result = new LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeB, nodeC, nodeM],
    elements: [elementAB, elementAC],
    supports,
    nodalLoads,
    constraints: [
      {
        id: "diaphragm-B",
        type: "equal-dof",
        masterNode: nodeM,
        slaveNode: nodeB,
        dof: "ux",
      },
      {
        id: "diaphragm-C",
        type: "equal-dof",
        masterNode: nodeM,
        slaveNode: nodeC,
        dof: "ux",
      },
    ],
  });

  approx(result.displacementByNode.M.ux, 0.3);
  approx(result.displacementByNode.B.ux, 0.3);
  approx(result.displacementByNode.C.ux, 0.3);
  approx(result.reactionByNode.A.ux, -90);
  assert.deepEqual(result.freeDofIds, ["M.ux"]);
  assert.ok(result.constrainedDofIds.includes("B.ux"));
  assert.ok(result.constrainedDofIds.includes("C.ux"));
});
