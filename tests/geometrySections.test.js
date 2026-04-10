import test from "node:test";
import assert from "node:assert/strict";

import {
  CircularSection,
  PolygonSection,
  RectangularSection,
  TSection,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("rectangular section computes geometric properties", () => {
  const section = new RectangularSection({
    width: 220,
    height: 250,
    units,
  });

  approx(section.area, 55000);
  approx(section.inertiaY, (220 * 250 ** 3) / 12);
  approx(section.elasticSectionModulusY, section.inertiaY / 125);
});

test("circular section computes area and inertia", () => {
  const section = new CircularSection({
    diameter: 200,
    units,
  });

  approx(section.area, Math.PI * 100 ** 2);
  approx(section.inertiaY, (Math.PI * 100 ** 4) / 4);
});

test("t section computes centroid and inertia", () => {
  const section = new TSection({
    flangeWidth: 300,
    flangeThickness: 80,
    webWidth: 120,
    webHeight: 220,
    units,
  });

  assert.ok(section.centroidY > 0);
  assert.ok(section.inertiaY > section.inertiaZ);
  assert.equal(section.metadata.shape, "t-section");
});

test("polygon section computes the same properties as an equivalent rectangle", () => {
  const section = new PolygonSection({
    points: [
      { y: 0, z: 0 },
      { y: 0, z: 220 },
      { y: 250, z: 220 },
      { y: 250, z: 0 },
    ],
    units,
  });

  approx(section.area, 55000);
  approx(section.centroidY, 125);
  approx(section.centroidZ, 110);
  approx(section.inertiaY, (220 * 250 ** 3) / 12);
  approx(section.inertiaZ, (250 * 220 ** 3) / 12);
});
