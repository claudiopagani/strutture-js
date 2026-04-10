import test from "node:test";
import assert from "node:assert/strict";

import {
  DistributedLoad,
  FrameElement2DEulerBernoulli,
  LinearStaticSolver2D,
  NodalLoad,
  Node,
  Support,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createNode(id, x = 0, y = 0) {
  return new Node({ id, x, y, units });
}

function createElement({
  id = "frame",
  startNode = createNode("A"),
  endNode = createNode("B", 2),
  axialRigidity = 1000,
  flexuralRigidity = 500,
} = {}) {
  return new FrameElement2DEulerBernoulli({
    id,
    startNode,
    endNode,
    axialRigidity,
    flexuralRigidity,
  });
}

test("euler-bernoulli frame element builds the expected local stiffness matrix", () => {
  const element = createElement();
  const stiffness = element.localStiffness();

  approx(stiffness[0][0], 500);
  approx(stiffness[0][3], -500);
  approx(stiffness[1][1], 750);
  approx(stiffness[1][2], 750);
  approx(stiffness[2][2], 1000);
  approx(stiffness[2][5], 500);
  approx(stiffness[4][4], 750);
  approx(stiffness[5][5], 1000);

  for (let row = 0; row < stiffness.length; row += 1) {
    for (let column = 0; column < stiffness.length; column += 1) {
      approx(stiffness[row][column], stiffness[column][row]);
    }
  }
});

test("horizontal frame element global stiffness matches local stiffness", () => {
  const element = createElement();

  assert.deepEqual(element.globalStiffness(), element.localStiffness());
});

test("vertical frame element transforms axial stiffness into global uy DOFs", () => {
  const startNode = createNode("A");
  const endNode = createNode("B", 0, 2);
  const element = createElement({ startNode, endNode });
  const stiffness = element.globalStiffness();

  approx(element.directionCosines().c, 0);
  approx(element.directionCosines().s, 1);
  approx(stiffness[1][1], 500);
  approx(stiffness[1][4], -500);
  approx(stiffness[4][1], -500);
  approx(stiffness[4][4], 500);
});

test("linear static solver uses the euler-bernoulli element for a cantilever tip load", () => {
  const fixedNode = createNode("A");
  const freeNode = createNode("B", 2);
  const element = createElement({
    startNode: fixedNode,
    endNode: freeNode,
    axialRigidity: 10000,
    flexuralRigidity: 500,
  });
  const support = new Support({
    id: "fixed-A",
    node: fixedNode,
    restraints: { ux: true, uy: true, rz: true },
  });
  const load = new NodalLoad({
    node: freeNode,
    components: { fy: -10 },
    units,
  });
  const result = new LinearStaticSolver2D().solve({
    nodes: [fixedNode, freeNode],
    elements: [element],
    supports: [support],
    nodalLoads: [load],
  });

  approx(result.displacementByNode.B.uy, (-10 * 2 ** 3) / (3 * 500));
  approx(result.displacementByNode.B.rz, (-10 * 2 ** 2) / (2 * 500));
  approx(result.reactionByNode.A.uy, 10);
  approx(result.reactionByNode.A.rz, 20);
});

test("euler-bernoulli element recovers local end forces from solved displacements", () => {
  const fixedNode = createNode("A");
  const freeNode = createNode("B", 2);
  const element = createElement({
    startNode: fixedNode,
    endNode: freeNode,
    axialRigidity: 10000,
    flexuralRigidity: 500,
  });
  const support = new Support({
    id: "fixed-A",
    node: fixedNode,
    restraints: { ux: true, uy: true, rz: true },
  });
  const load = new NodalLoad({
    node: freeNode,
    components: { fy: -10 },
    units,
  });
  const result = new LinearStaticSolver2D().solve({
    nodes: [fixedNode, freeNode],
    elements: [element],
    supports: [support],
    nodalLoads: [load],
  });
  const localEndForces = element.localEndForces(
    result.displacements,
    result.dofRegistry,
  );

  approx(localEndForces[0], 0);
  approx(localEndForces[1], 10);
  approx(localEndForces[2], 20);
  approx(localEndForces[3], 0);
  approx(localEndForces[4], -10);
  approx(localEndForces[5], 0);
});

test("euler-bernoulli element applies a full-span uniform distributed load", () => {
  const nodeA = createNode("A");
  const nodeB = createNode("B", 4);
  const element = createElement({
    startNode: nodeA,
    endNode: nodeB,
    axialRigidity: 10000,
    flexuralRigidity: 1000,
  });
  const supports = [
    new Support({
      id: "pin-A",
      node: nodeA,
      restraints: { ux: true, uy: true },
    }),
    new Support({
      id: "roller-B",
      node: nodeB,
      restraints: { uy: true },
    }),
  ];
  const load = new DistributedLoad({
    id: "q",
    element,
    startValue: -2,
    direction: "y",
    units,
  });
  const result = new LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeB],
    elements: [element],
    supports,
    loads: [load],
  });
  const samples = element.sampleInternalForces({
    displacements: result.displacements,
    dofRegistry: result.dofRegistry,
    loads: [load],
    stations: [0, 2, 4],
  });

  approx(result.reactionByNode.A.uy, 4);
  approx(result.reactionByNode.B.uy, 4);
  approx(result.reactionByNode.A.rz, 0);
  approx(result.reactionByNode.B.rz, 0);
  approx(samples[0].shearForce, 4);
  approx(samples[1].shearForce, 0);
  approx(samples[2].shearForce, -4);
  approx(samples[0].bendingMoment, 0);
  approx(samples[1].bendingMoment, 4);
  approx(samples[2].bendingMoment, 0);
});

test("euler-bernoulli element rejects tapered distributed loads", () => {
  const element = createElement();
  const load = new DistributedLoad({
    id: "trapezoid",
    element,
    startValue: -2,
    endValue: -4,
    direction: "y",
    units,
  });

  assert.throws(
    () => element.equivalentNodalLoadVector({ loads: [load] }),
    /tapered distributed loads/i,
  );
});
