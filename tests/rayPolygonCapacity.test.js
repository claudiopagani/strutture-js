import test from "node:test";
import assert from "node:assert/strict";

import { rayPolygonCapacity } from "strutture-js/domain/math";

const rectangle = [
  { x: -100, y: -50 },
  { x: 100, y: -50 },
  { x: 100, y: 50 },
  { x: -100, y: 50 },
];

test("ray-polygon capacity returns the radial boundary instead of its support projection", () => {
  const result = rayPolygonCapacity(rectangle, 60, 40);

  assert.ok(Math.abs(result.intersection.x - 75) < 1e-9);
  assert.ok(Math.abs(result.intersection.y - 50) < 1e-9);
  assert.ok(Math.abs(result.capacityNorm - Math.hypot(75, 50)) < 1e-9);
  assert.ok(Math.abs(result.utilizationRatio - 0.8) < 1e-12);
});

test("ray-polygon capacity handles zero demand without requiring an intersection", () => {
  const result = rayPolygonCapacity(rectangle, 0, 0);

  assert.equal(result.demandNorm, 0);
  assert.equal(result.capacityNorm, Number.POSITIVE_INFINITY);
  assert.equal(result.utilizationRatio, 0);
  assert.equal(result.intersection, null);
});
