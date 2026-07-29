import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_ELEVATION_REGULARITY,
  NTC2018_PLAN_REGULARITY,
  NTC2018_REGULARITY_REFERENCES,
  createNTC2018RegularityAssessment,
  evaluateNTC2018ElevationRegularity,
  evaluateNTC2018PlanRegularity,
} from "../src/index.js";

function regularPlan(overrides = {}) {
  return {
    massAndStiffnessApproximatelySymmetric: true,
    floors: [{
      storeyId: "L1",
      planLengthX: 20,
      planLengthY: 10,
      contourConvex: true,
      diaphragmInPlaneRigidityAdequate: true,
      diaphragmInPlaneStrengthAdequate: true,
      ...(overrides.floor ?? {}),
    }],
    ...overrides,
  };
}

function storey(storeyId, overrides = {}) {
  return {
    storeyId,
    mass: 100,
    stiffnessX: 100,
    stiffnessY: 100,
    capacityDemandRatioX: 1,
    capacityDemandRatioY: 1,
    planLengthX: 20,
    planLengthY: 10,
    ...overrides,
  };
}

function regularElevation(overrides = {}) {
  return {
    continuousVerticalSystems: true,
    storeys: [
      storey("L1"),
      storey("L2", {
        mass: 90,
        stiffnessX: 90,
        stiffnessY: 95,
        capacityDemandRatioX: 0.9,
        capacityDemandRatioY: 1.1,
        planLengthX: 19,
        planLengthY: 9.5,
      }),
    ],
    ...overrides,
  };
}

test("regularity references point to NTC 2018 § 7.2.1", () => {
  assert.equal(Object.isFrozen(NTC2018_REGULARITY_REFERENCES), true);
  assert.match(NTC2018_REGULARITY_REFERENCES[0].citation, /7\.2\.1/);
});

test("plan regularity requires qualitative evidence instead of positive defaults", () => {
  assert.throws(
    () => evaluateNTC2018PlanRegularity({
      planLengthX: 20,
      planLengthY: 10,
    }),
    /massAndStiffnessApproximatelySymmetric/,
  );
});

test("a compact symmetric floor with adequate diaphragm is regular", () => {
  const result = evaluateNTC2018PlanRegularity(regularPlan());
  assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.REGULAR);
  assert.equal(result.allChecksOk, true);
});

test("the bounding rectangle ratio must be strictly less than four", () => {
  const result = evaluateNTC2018PlanRegularity(regularPlan({
    floor: { planLengthX: 40, planLengthY: 10 },
  }));
  assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
  assert.equal(
    result.checks.find((check) =>
      check.check === "plan-bounding-rectangle-ratio").ok,
    false,
  );
});

test("non-convex plans use the five-percent area criterion per re-entrant corner", () => {
  const passing = evaluateNTC2018PlanRegularity(regularPlan({
    floor: {
      contourConvex: false,
      reentrantAreaRatios: [0.04, 0.05],
      reentrantInfluenceNegligible: true,
    },
  }));
  const failing = evaluateNTC2018PlanRegularity(regularPlan({
    floor: {
      contourConvex: false,
      reentrantAreaRatios: [0.0501],
      reentrantInfluenceNegligible: true,
    },
  }));
  assert.equal(passing.regularity, NTC2018_PLAN_REGULARITY.REGULAR);
  assert.equal(failing.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
});

test("diaphragm rigidity and strength are separate mandatory checks", () => {
  const result = evaluateNTC2018PlanRegularity(regularPlan({
    floor: { diaphragmInPlaneStrengthAdequate: false },
  }));
  assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
});

test("elevation regularity evaluates every criterion in both directions", () => {
  const result = evaluateNTC2018ElevationRegularity(regularElevation());
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.REGULAR);
  assert.equal(result.allChecksOk, true);
  assert.ok(result.checks.some((check) =>
    check.check === "elevation-capacity-demand-y"));
});

test("vertical resisting-system continuity must be explicit", () => {
  assert.throws(
    () => evaluateNTC2018ElevationRegularity({
      storeys: regularElevation().storeys,
    }),
    /continuousVerticalSystems/,
  );
});

test("mass changes greater than twenty-five percent are irregular", () => {
  const input = regularElevation();
  input.storeys[1].mass = 126;
  const result = evaluateNTC2018ElevationRegularity(input);
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

test("stiffness must neither reduce over thirty percent nor increase over ten percent", () => {
  const reduction = regularElevation();
  reduction.storeys[1].stiffnessX = 69;
  const increase = regularElevation();
  increase.storeys[1].stiffnessY = 111;

  assert.equal(
    evaluateNTC2018ElevationRegularity(reduction).regularity,
    NTC2018_ELEVATION_REGULARITY.NON_REGULAR,
  );
  assert.equal(
    evaluateNTC2018ElevationRegularity(increase).regularity,
    NTC2018_ELEVATION_REGULARITY.NON_REGULAR,
  );
});

test("adjacent capacity-to-demand ratios may differ by at most thirty percent", () => {
  const input = regularElevation();
  input.storeys[1].capacityDemandRatioX = 0.69;
  const result = evaluateNTC2018ElevationRegularity(input);
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

test("setbacks satisfy both ten-percent adjacent and thirty-percent first-floor limits", () => {
  const input = regularElevation();
  input.storeys[1].setbackX = 2.01;
  const result = evaluateNTC2018ElevationRegularity(input);
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

test("the top-storey resistance exception applies only to frames of at least three storeys", () => {
  const input = {
    continuousVerticalSystems: true,
    isFrameStructure: true,
    storeys: [
      storey("L1"),
      storey("L2"),
      {
        ...storey("L3"),
        capacityDemandRatioX: undefined,
        capacityDemandRatioY: undefined,
      },
    ],
  };
  const result = evaluateNTC2018ElevationRegularity(input);
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.REGULAR);
  assert.equal(result.storeyDetails[1].topResistanceException, true);
});

test("the top-storey setback exception applies from four storeys", () => {
  const input = {
    continuousVerticalSystems: true,
    storeys: [
      storey("L1"),
      storey("L2"),
      storey("L3"),
      storey("L4", {
        planLengthX: 5,
        planLengthY: 2,
      }),
    ],
  };
  const result = evaluateNTC2018ElevationRegularity(input);
  assert.equal(result.storeyDetails[2].topSetbackException, true);
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.REGULAR);
});

test("combined assessment exposes allChecksOk and analysis-method evidence", () => {
  const result = createNTC2018RegularityAssessment({
    planInput: regularPlan(),
    elevationInput: regularElevation(),
    behavior: "cd-b",
    t1X: 0.8,
    t1Y: 0.9,
    tc: 0.4,
    td: 2.0,
  });
  assert.equal(result.allChecksOk, true);
  assert.equal(result.reductionFactorKr, 1);
  assert.equal(result.analysisMethodsX.linearStaticAllowed, true);
  assert.equal(result.analysisMethodsY.linearStaticAllowed, true);
  assert.equal(result.metadata.normativeConformityClaimed, false);
  assert.ok(result.metadata.normativeReferences.every((reference) =>
    reference.resolutionStatus === "outside-corpus"));
  assert.ok(result.checks.every((check) =>
    check.metadata.normativeReferences.length === 2));
});
