import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_SHEAR_WALL_REFERENCES,
  computeWallBoundaryLength,
  computeWallCapacityShear,
  computeWallConfinementOmegaWd,
  computeWallCriticalZoneHeight,
  computeWallMomentShift,
  createWallSectionAssessment,
  verifyWallBoundaryConfinement,
  verifyWallShear,
} from "../src/index.js";

test("wall references are immutable and point to § 7.4.4.5", () => {
  assert.equal(Object.isFrozen(NTC2018_SHEAR_WALL_REFERENCES), true);
  assert.match(NTC2018_SHEAR_WALL_REFERENCES[0].citation, /7\.4\.4\.5/);
});

test("critical-zone height uses one storey through six and two from seven", () => {
  const sixStoreys = computeWallCriticalZoneHeight({
    wallLength: 4,
    wallHeight: 24,
    storeyHeight: 3,
    storeyCount: 6,
  });
  const sevenStoreys = computeWallCriticalZoneHeight({
    wallLength: 4,
    wallHeight: 24,
    storeyHeight: 3,
    storeyCount: 7,
  });
  assert.equal(sixStoreys.uncapped, 4);
  assert.equal(sixStoreys.hCr, 3);
  assert.equal(sevenStoreys.hCr, 4);
});

test("moment-diagram translation applies only to slender dissipative walls", () => {
  const slender = computeWallMomentShift({
    wallLength: 4,
    wallHeight: 24,
    storeyHeight: 3,
    storeyCount: 7,
    behavior: "cd-a",
  });
  const squat = computeWallMomentShift({
    wallLength: 5,
    wallHeight: 9,
    storeyHeight: 3,
    storeyCount: 3,
    behavior: "cd-a",
  });
  const nonDissipative = computeWallMomentShift({
    wallLength: 4,
    wallHeight: 24,
    storeyHeight: 3,
    storeyCount: 7,
    behavior: "non-dissipative",
  });
  assert.equal(slender.shift, 4);
  assert.equal(squat.shift, 0);
  assert.equal(nonDissipative.shift, 0);
});

test("slender-wall shear amplification reproduces Eq. 7.4.14", () => {
  const result = computeWallCapacityShear({
    analysisShear: 100,
    momentResistance: 200,
    momentDemand: 100,
    q: 4,
    behavior: "cd-a",
    wallLength: 4,
    wallHeight: 20,
    elasticSpectrumTc: 2,
    elasticSpectrumT1: 1,
  });
  const expected = 4 * Math.sqrt(
    ((1.2 / 4) * (200 / 100)) ** 2 +
    0.1 * (2 / 1) ** 2,
  );
  assert.ok(Math.abs(result.rawAmplificationFactor - expected) < 1e-12);
  assert.ok(Math.abs(result.amplificationFactor - expected) < 1e-12);
  assert.ok(Math.abs(result.shearDemand - 100 * expected) < 1e-12);
});

test("slender-wall Eq. 7.4.14 factor is bounded between 1.5 and q", () => {
  const lower = computeWallCapacityShear({
    analysisShear: 100,
    momentResistance: 100,
    momentDemand: 100,
    q: 4,
    behavior: "cd-b",
    wallLength: 4,
    wallHeight: 20,
    elasticSpectrumTc: 0.1,
    elasticSpectrumT1: 1,
  });
  const upper = computeWallCapacityShear({
    analysisShear: 100,
    momentResistance: 1000,
    momentDemand: 100,
    q: 4,
    behavior: "cd-a",
    wallLength: 4,
    wallHeight: 20,
    elasticSpectrumTc: 2,
    elasticSpectrumT1: 1,
  });
  assert.equal(lower.amplificationFactor, 1.5);
  assert.equal(upper.amplificationFactor, 4);
});

test("squat-wall amplification follows Eq. 7.4.15", () => {
  const result = computeWallCapacityShear({
    analysisShear: 100,
    momentResistance: 150,
    momentDemand: 100,
    q: 4,
    behavior: "cd-a",
    wallLength: 5,
    wallHeight: 9,
  });
  assert.ok(Math.abs(result.amplificationFactor - 1.8) < 1e-12);
  assert.equal(result.shearDemand, 180);
});

test("non-dissipative walls retain analysis shear without chapter-7 amplification", () => {
  const result = computeWallCapacityShear({
    analysisShear: -100,
    momentResistance: 120,
    momentDemand: 100,
    q: 1.5,
    behavior: "non-dissipative",
    wallLength: 4,
    wallHeight: 20,
  });
  assert.equal(result.shearDemand, 100);
  assert.equal(result.amplificationFactor, 1);
});

test("wall shear reduces chapter-4 compression resistance by 0.4 in dissipative zones", () => {
  const result = verifyWallShear({
    shearDemand: 100,
    chapter4ConcreteCompressionResistance: 300,
    wallWebTensionResistance: 150,
    slidingResistance: 130,
    isDissipativeZone: true,
    isSquatWall: false,
  });
  assert.equal(result.concreteCompressionResistance, 120);
  assert.equal(result.ok, true);
});

test("squat walls require inclined reinforcement contribution greater than VEd/2", () => {
  const failing = verifyWallShear({
    shearDemand: 100,
    chapter4ConcreteCompressionResistance: 400,
    wallWebTensionResistance: 200,
    slidingResistance: 200,
    inclinedReinforcementContribution: 50,
    isDissipativeZone: true,
    isSquatWall: true,
  });
  const passing = verifyWallShear({
    shearDemand: 100,
    chapter4ConcreteCompressionResistance: 400,
    wallWebTensionResistance: 200,
    slidingResistance: 200,
    inclinedReinforcementContribution: 50.01,
    isDissipativeZone: true,
    isSquatWall: true,
  });
  assert.equal(failing.ok, false);
  assert.equal(passing.ok, true);
});

test("boundary confinement region is defined by concrete strain above 0.35 percent", () => {
  assert.equal(verifyWallBoundaryConfinement({
    maximumConcreteCompressiveStrain: 0.0035,
  }).confinementRequired, false);
  assert.equal(verifyWallBoundaryConfinement({
    maximumConcreteCompressiveStrain: 0.00351,
  }).confinementRequired, true);
});

test("boundary length applies strain-derived and simplified minima", () => {
  const strainBased = computeWallBoundaryLength({
    wallLength: 4,
    wallThickness: 0.3,
    strainDerivedLength: 0.8,
  });
  const simplified = computeWallBoundaryLength({
    wallLength: 4,
    wallThickness: 0.3,
    simplifiedDetailing: true,
  });
  assert.equal(strainBased.minimumLength, 0.6);
  assert.equal(strainBased.boundaryLength, 0.8);
  assert.equal(simplified.minimumLength, 0.8);
});

test("wall confinement Eq. 7.4.32 uses every explicit mechanical term", () => {
  const result = computeWallConfinementOmegaWd({
    behavior: "cd-a",
    confinementEffectiveness: 0.8,
    curvatureDuctilityDemand: 6,
    normalizedAxialForce: 0.2,
    verticalWebMechanicalRatio: 0.05,
    reinforcementYieldStrain: 0.002,
    grossSectionDepth: 0.3,
    confinedCoreDepth: 0.25,
  });
  const equation = (
    30 * 6 * (0.2 + 0.05) * 0.002 * (0.3 / 0.25) - 0.035
  ) / 0.8;
  assert.ok(Math.abs(result.equationValue - equation) < 1e-12);
  assert.equal(result.omegaWd, Math.max(0.12, equation));
});

test("wall section assessment cannot complete without local flexural and shear capacities", () => {
  const result = createWallSectionAssessment({
    sectionId: "W1",
    behavior: "cd-b",
    wallLength: 4,
    wallThickness: 0.3,
    axialCompressionRatio: 0.2,
  });
  assert.equal(result.status, "not-implemented");
  assert.equal(result.allChecksOk, false);
});
