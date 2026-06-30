import test from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_CURVATURE_TOLERANCE,
  appendUniquePoint,
  bracketDistanceFromHint,
  createCurvatureValues,
  createLinearSamples,
  findBrackets,
} from "../src/applications/reinforced-concrete-sections/analysis/moment-curvature/MomentCurvatureSampling.js";

test("moment-curvature sampling utilities build stable intervals and point lists", () => {
  assert.deepEqual(
    createLinearSamples({ minimum: -1, maximum: 1, count: 5 }),
    [-1, -0.5, 0, 0.5, 1],
  );
  assert.deepEqual(
    createCurvatureValues({ curvatureMax: 0.004, pointCount: 3 }),
    [0, 0.002, 0.004],
  );

  const brackets = findBrackets(
    [
      { eps0: -1, value: -2 },
      { eps0: 0.25, value: 1 },
      { eps0: 1, value: 3 },
    ],
    0,
  );

  assert.deepEqual(brackets, [{ min: -1, max: 0.25 }]);
  assert.equal(bracketDistanceFromHint(brackets[0], -2), 1);
  assert.equal(bracketDistanceFromHint(brackets[0], 0), 0);

  const points = [{ absoluteCurvature: 0, id: "initial" }];
  appendUniquePoint(points, {
    absoluteCurvature: EVENT_CURVATURE_TOLERANCE / 2,
    id: "replacement",
  });
  appendUniquePoint(points, {
    absoluteCurvature: 10 * EVENT_CURVATURE_TOLERANCE,
    id: "next",
  });

  assert.deepEqual(points.map((point) => point.id), ["replacement", "next"]);
});

test("moment-curvature sampling utilities reject invalid input", () => {
  assert.throws(
    () => createLinearSamples({ minimum: 1, maximum: -1, count: 3 }),
    /valid sample interval/,
  );
  assert.throws(
    () => createLinearSamples({ minimum: 0, maximum: 1, count: 1 }),
    /at least two samples/,
  );
  assert.throws(
    () => createCurvatureValues({ curvatureMax: 0, pointCount: 3 }),
    /positive curvatureMax/,
  );
});
