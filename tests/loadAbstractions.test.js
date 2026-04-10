import test from "node:test";
import assert from "node:assert/strict";

import {
  AreaLoad,
  Combination,
  DistributedLoad,
  ElementPointLoad,
  Load,
  LoadCase,
  LoadCombination,
  NodalLoad,
  VolumeLoad,
} from "../src/index.js";

test("base load and combination classes are abstract", () => {
  assert.throws(
    () => new Load({ type: "generic", dimension: "point" }),
    /abstract class/,
  );

  assert.throws(
    () => new Combination({ id: "C0" }),
    /abstract class/,
  );
});

test("point and nodal loads compute force resultants", () => {
  const pointLoad = new ElementPointLoad({
    id: "EP1",
    element: { id: "B1" },
    position: 2.5,
    direction: "globalY",
    components: { fy: -10, fz: 6, mz: 2 },
  });

  const nodalLoad = new NodalLoad({
    id: "N1",
    node: { id: "N2" },
    direction: "globalY",
    components: { fy: -12 },
  });

  assert.equal(Number(pointLoad.forceResultant().toFixed(6)), Number(Math.sqrt(136).toFixed(6)));
  assert.equal(pointLoad.position, 2.5);
  assert.equal(nodalLoad.referenceValue(), 12);
});

test("line, area and volume loads expose intensities and resultants", () => {
  const lineLoad = new DistributedLoad({
    id: "q1",
    element: { id: "B2", length: () => 5 },
    startValue: -18,
    endValue: -12,
    direction: "globalY",
  });

  const areaLoad = new AreaLoad({
    id: "a1",
    type: "surface_generic",
    intensity: 3.5,
    area: 12,
  });

  const volumeLoad = new VolumeLoad({
    id: "v1",
    type: "body_force",
    intensity: 24,
    volume: 0.8,
  });

  assert.equal(lineLoad.averageIntensity(), -15);
  assert.equal(lineLoad.resultant(), -75);
  assert.equal(areaLoad.referenceValue(), 3.5);
  assert.equal(areaLoad.resultant(), 42);
  assert.equal(Number(volumeLoad.resultant().toFixed(6)), 19.2);
});

test("load combinations remain generic linear combinations over load cases", () => {
  const g1 = new LoadCase({ id: "G1" });
  const q1 = new LoadCase({ id: "Q1" });

  const combination = new LoadCombination({
    id: "ULS-1",
    combinationType: "ULS",
  })
    .addFactor(g1, 1.3)
    .addFactor(q1, 1.5);

  assert.equal(combination.evaluate({ G1: 10, Q1: 4 }), 19);
});
