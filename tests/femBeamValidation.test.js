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

function createNode(id, x) {
  return new Node({ id, x, units });
}

function createBeamElement(id, startNode, endNode, { ea = 10000, ei = 1000 } = {}) {
  return new FrameElement2DEulerBernoulli({
    id,
    startNode,
    endNode,
    axialRigidity: ea,
    flexuralRigidity: ei,
  });
}

test("cantilever beam under uniform load matches closed-form tip response", () => {
  const length = 4;
  const q = -2;
  const ei = 1000;
  const fixedNode = createNode("A", 0);
  const freeNode = createNode("B", length);
  const element = createBeamElement("beam", fixedNode, freeNode, { ei });
  const support = new Support({
    id: "fixed-A",
    node: fixedNode,
    restraints: { ux: true, uy: true, rz: true },
  });
  const load = new DistributedLoad({
    id: "q",
    element,
    startValue: q,
    direction: "y",
    units,
  });
  const result = new LinearStaticSolver2D().solve({
    nodes: [fixedNode, freeNode],
    elements: [element],
    supports: [support],
    loads: [load],
  });
  const samples = element.sampleInternalForces({
    displacements: result.displacements,
    dofRegistry: result.dofRegistry,
    loads: [load],
    stations: [0, length],
  });
  const qAbs = Math.abs(q);

  approx(result.displacementByNode.B.uy, (-qAbs * length ** 4) / (8 * ei));
  approx(result.displacementByNode.B.rz, (-qAbs * length ** 3) / (6 * ei));
  approx(result.reactionByNode.A.uy, qAbs * length);
  approx(result.reactionByNode.A.rz, (qAbs * length ** 2) / 2);
  approx(samples[0].bendingMoment, -(qAbs * length ** 2) / 2);
  approx(samples[1].bendingMoment, 0);
});

test("simply supported beam with midspan point load is modeled by inserting a loaded node", () => {
  const length = 4;
  const loadValue = -12;
  const ei = 1000;
  const nodeA = createNode("A", 0);
  const nodeC = createNode("C", length / 2);
  const nodeB = createNode("B", length);
  const leftElement = createBeamElement("left", nodeA, nodeC, { ei });
  const rightElement = createBeamElement("right", nodeC, nodeB, { ei });
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
  const load = new NodalLoad({
    id: "P",
    node: nodeC,
    components: { fy: loadValue },
    units,
  });
  const result = new LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeC, nodeB],
    elements: [leftElement, rightElement],
    supports,
    nodalLoads: [load],
  });
  const leftSamples = leftElement.sampleInternalForces({
    displacements: result.displacements,
    dofRegistry: result.dofRegistry,
    stations: [0, length / 2],
  });
  const pAbs = Math.abs(loadValue);

  approx(result.reactionByNode.A.uy, pAbs / 2);
  approx(result.reactionByNode.B.uy, pAbs / 2);
  approx(result.displacementByNode.C.uy, (-pAbs * length ** 3) / (48 * ei));
  approx(result.displacementByNode.C.rz, 0);
  approx(leftSamples[0].bendingMoment, 0);
  approx(leftSamples[1].bendingMoment, (pAbs * length) / 4);
});

test("fixed-fixed beam under uniform load recovers fixed-end reactions and moments", () => {
  const length = 4;
  const q = -2;
  const ei = 1000;
  const nodeA = createNode("A", 0);
  const nodeB = createNode("B", length);
  const element = createBeamElement("beam", nodeA, nodeB, { ei });
  const supports = [
    new Support({
      id: "fixed-A",
      node: nodeA,
      restraints: { ux: true, uy: true, rz: true },
    }),
    new Support({
      id: "fixed-B",
      node: nodeB,
      restraints: { ux: true, uy: true, rz: true },
    }),
  ];
  const load = new DistributedLoad({
    id: "q",
    element,
    startValue: q,
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
    stations: [0, length / 2, length],
  });
  const qAbs = Math.abs(q);

  approx(result.displacementByNode.A.uy, 0);
  approx(result.displacementByNode.B.uy, 0);
  approx(result.reactionByNode.A.uy, (qAbs * length) / 2);
  approx(result.reactionByNode.B.uy, (qAbs * length) / 2);
  approx(result.reactionByNode.A.rz, (qAbs * length ** 2) / 12);
  approx(result.reactionByNode.B.rz, -(qAbs * length ** 2) / 12);
  approx(samples[0].bendingMoment, -(qAbs * length ** 2) / 12);
  approx(samples[1].bendingMoment, (qAbs * length ** 2) / 24);
  approx(samples[2].bendingMoment, -(qAbs * length ** 2) / 12);
});
