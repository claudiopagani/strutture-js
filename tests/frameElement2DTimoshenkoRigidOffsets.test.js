import test from "node:test";
import assert from "node:assert/strict";

import {
  FrameElement2DTimoshenko,
  FrameElement2DTimoshenkoRigidOffsets,
  NodalLoad,
  Node,
  LinearStaticSolver2D,
  Support,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createNode(id, x = 0, y = 0) {
  return new Node({ id, x, y, units });
}

test("rigid-offset timoshenko element collapses to the base element when offsets are zero", () => {
  const startNode = createNode("A");
  const endNode = createNode("B", 2);
  const properties = {
    id: "beam",
    startNode,
    endNode,
    axialRigidity: 1000,
    flexuralRigidity: 500,
    shearRigidity: 1200,
    shearCorrectionFactor: 5 / 6,
  };
  const baseElement = new FrameElement2DTimoshenko(properties);
  const rigidOffsetElement = new FrameElement2DTimoshenkoRigidOffsets(properties);
  const baseStiffness = baseElement.localStiffness();
  const offsetStiffness = rigidOffsetElement.localStiffness();

  for (let row = 0; row < baseStiffness.length; row += 1) {
    for (let column = 0; column < baseStiffness[row].length; column += 1) {
      approx(offsetStiffness[row][column], baseStiffness[row][column]);
    }
  }
});

test("rigid base offset preserves the physical lever arm while shortening the deformable cantilever", () => {
  const fixedNode = createNode("A");
  const freeNode = createNode("B", 3);
  const element = new FrameElement2DTimoshenkoRigidOffsets({
    id: "rigid-base-cantilever",
    startNode: fixedNode,
    endNode: freeNode,
    axialRigidity: 1e6,
    flexuralRigidity: 1000,
    shearRigidity: 100,
    shearCorrectionFactor: 1,
    rigidStartOffset: 1,
  });
  const support = new Support({
    id: "fixed-A",
    node: fixedNode,
    restraints: { ux: true, uy: true, rz: true },
  });
  const load = new NodalLoad({
    id: "tip-load",
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
  const deformableLength = 2;
  const loadAbs = 10;
  const expectedTipDisplacement =
    (-loadAbs * deformableLength ** 3) / (3 * 1000) -
    (loadAbs * deformableLength) / 100;
  const expectedTipRotation = (-loadAbs * deformableLength ** 2) / (2 * 1000);

  approx(element.deformableLength(), deformableLength);
  approx(result.displacementByNode.B.uy, expectedTipDisplacement);
  approx(result.displacementByNode.B.rz, expectedTipRotation);
  approx(Math.abs(result.reactionByNode.A.uy), loadAbs);
  approx(Math.abs(result.reactionByNode.A.rz), loadAbs * 3);
});
