import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_RC_BUILDING_CAPABILITIES,
  evaluateNTC2018RcBuildingCompleteness,
  getNTC2018RcBuildingCoverage,
} from "../src/index.js";

test("RC building coverage inventory does not claim whole chapters 4 and 7", () => {
  const coverage = getNTC2018RcBuildingCoverage();

  assert.equal(coverage.wholeChapter4And7CoverageClaimed, false);
  assert.equal(coverage.declaredScopeCoverageComplete, true);
  assert.ok(coverage.capabilities
    .filter((item) => item.status !== "outside-declared-scope")
    .every((item) => item.status === "available"));
  assert.deepEqual(JSON.parse(JSON.stringify(coverage)), coverage);
  assert.ok(Object.isFrozen(NTC2018_RC_BUILDING_CAPABILITIES));
});

test("default RC building completeness is closed in the declared scope", () => {
  const result = evaluateNTC2018RcBuildingCompleteness();

  assert.equal(result.status, "complete");
  assert.equal(result.complete, true);
  assert.deepEqual(result.blockingCapabilities, []);
});

test("a declared implemented subset can be assessed independently", () => {
  const result = evaluateNTC2018RcBuildingCompleteness({
    requiredCapabilityIds: [
      "solver-neutral-demand-extraction",
      "structural-behavior-and-q",
      "regularity",
      "displacements-and-second-order",
      "global-member-axis-mapping",
      "modal-combination-and-accidental-torsion-verification",
    ],
  });

  assert.equal(result.status, "complete");
  assert.equal(result.complete, true);
  assert.deepEqual(result.blockingCapabilities, []);
});
