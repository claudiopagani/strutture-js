import test from "node:test";
import assert from "node:assert/strict";

import {
  BeamLinePreprocessor2D,
  LinearStaticSolver2D,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("beam line preprocessor inserts nodes at supports, loads and distributed-load bounds", () => {
  const model = new BeamLinePreprocessor2D().build({
    id: "beam",
    span: 6,
    units,
    element: {
      axialRigidity: 10000,
      flexuralRigidity: 1000,
    },
    supports: [
      { id: "A", x: 0, restraints: { ux: true, uy: true } },
      { id: "B", x: 6, restraints: { uy: true } },
    ],
    loads: [
      { id: "P", type: "point", x: 3, value: -12, direction: "y" },
      { id: "q", type: "uniform", from: 1, to: 5, value: -2, direction: "y" },
    ],
    discretization: {
      elementCount: 3,
    },
  });

  assert.deepEqual(model.stations, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(model.nodes.length, 7);
  assert.equal(model.elements.length, 6);
  assert.equal(model.supports.length, 2);
  assert.equal(model.nodalLoads.length, 1);
  assert.equal(model.distributedLoads.length, 4);
  assert.equal(model.nodalLoads[0].node.x, 3);
  assert.deepEqual(
    model.distributedLoads.map((load) => [load.metadata.from, load.metadata.to]),
    [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ],
  );
});

test("beam line preprocessor solves a midspan point load through a generated node", () => {
  const span = 4;
  const pointLoad = -12;
  const ei = 1000;
  const model = new BeamLinePreprocessor2D().build({
    id: "midspan",
    span,
    units,
    element: {
      axialRigidity: 10000,
      flexuralRigidity: ei,
    },
    supports: [
      { id: "A", x: 0, restraints: { ux: true, uy: true } },
      { id: "B", x: span, restraints: { uy: true } },
    ],
    loads: [
      { id: "P", type: "point", x: span / 2, value: pointLoad, direction: "y" },
    ],
  });
  const result = new LinearStaticSolver2D().solve(model);
  const loadedNode = model.nodalLoads[0].node;
  const pAbs = Math.abs(pointLoad);

  approx(result.reactionByNode[model.supports[0].node.id].uy, pAbs / 2);
  approx(result.reactionByNode[model.supports[1].node.id].uy, pAbs / 2);
  approx(result.displacementByNode[loadedNode.id].uy, (-pAbs * span ** 3) / (48 * ei));
  approx(result.displacementByNode[loadedNode.id].rz, 0);
});

test("beam line preprocessor solves a partial uniform load by splitting into covered subelements", () => {
  const model = new BeamLinePreprocessor2D().build({
    id: "partial-q",
    span: 6,
    units,
    element: {
      axialRigidity: 10000,
      flexuralRigidity: 1000,
    },
    supports: [
      { id: "A", x: 0, restraints: { ux: true, uy: true } },
      { id: "B", x: 6, restraints: { uy: true } },
    ],
    loads: [
      { id: "q", type: "uniform", from: 2, to: 4, value: -3, direction: "y" },
    ],
  });
  const result = new LinearStaticSolver2D().solve(model);

  approx(result.reactionByNode[model.supports[0].node.id].uy, 3);
  approx(result.reactionByNode[model.supports[1].node.id].uy, 3);
});

test("beam line preprocessor rejects trapezoidal loads", () => {
  assert.throws(
    () =>
      new BeamLinePreprocessor2D().build({
        id: "bad",
        span: 6,
        units,
        element: {
          axialRigidity: 10000,
          flexuralRigidity: 1000,
        },
        loads: [
          {
            id: "trap",
            type: "trapezoidal",
            from: 0,
            to: 6,
            startValue: -2,
            endValue: -4,
          },
        ],
      }),
    /trapezoidal loads/i,
  );
});
