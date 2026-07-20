import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018MasonryPierAnalysis,
  NTC2018MasonryPierModel,
  AlignmentSeismicAggregatedAnalysis,
  MasonryWallOpeningsModel,
  calculateNTC2018MasonryPierElasticStiffness,
  calculateNTC2018MasonryPierFlexuralCapacity,
  calculateNTC2018MasonryPierIrregularDiagonalCapacity,
  calculateNTC2018MasonryPierRegularDiagonalCapacity,
  calculateNTC2018MasonryPierSlidingCapacity,
  calculateNTC2018MasonryPierUltimateDisplacement,
  selectNTC2018MasonryPierGoverningCapacity,
} from "../src/index.js";

function approx(actual, expected, relativeTolerance = 1e-9) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${actual} != ${expected}`,
  );
}

function createModel(overrides = {}) {
  return new NTC2018MasonryPierModel({
    id: "ntc-pier",
    units: { force: "kN", length: "m" },
    geometry: {
      height: 3,
      length: 1.5,
      thickness: 0.3,
    },
    material: {
      units: { force: "kN", length: "m" },
      fm: 4000,
      tau0: 80,
      fv0: 120,
      E: 1.8e6,
      G: 0.6e6,
    },
    actions: {
      axialForce: 300,
      axialForceConvention: "compression-positive",
    },
    design: { confidenceFactor: 1.2 },
    normative: {
      scope: "existing",
      masonryTexture: "irregular",
      blockCompressiveStrength: 12000,
    },
    ...overrides,
  });
}

test("NTC pier flexural capacity reproduces equation 7.8.2 and keeps zero in the exact minimum", () => {
  const capacity = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression: 300000,
    compressiveStrength: 4,
    length: 1500,
    thickness: 300,
    shearSpan: 3000,
  });
  const sigma0 = 300000 / (1500 * 300);
  const expectedMoment =
    (1500 ** 2 * 300 * sigma0 * (1 - sigma0 / (0.85 * 4))) / 2;

  approx(capacity.momentCapacity, expectedMoment);
  approx(capacity.capacity, expectedMoment / 3000);

  const zero = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression: -10,
    compressiveStrength: 4,
    length: 1500,
    thickness: 300,
    shearSpan: 3000,
  });
  const governing = selectNTC2018MasonryPierGoverningCapacity([
    { mechanism: "shear-a", available: true, capacity: 100 },
    zero,
    { mechanism: "shear-b", available: true, capacity: 80 },
  ]);

  assert.equal(zero.capacity, 0);
  assert.equal(governing.mechanism, "flexural");
});

test("NTC sliding capacity solves the piecewise compressed-length equilibrium", () => {
  const result = calculateNTC2018MasonryPierSlidingCapacity({
    axialCompression: 1e6,
    cohesion: 0.1,
    shearStrengthLimit: 10,
    length: 1500,
    thickness: 300,
    shearSpan: 1500,
  });
  const equilibrium =
    result.cohesion * 300 * result.compressedLength;

  assert.equal(result.governingLimit, "cohesion-friction");
  assert.ok(result.eccentricity > 1500 / 6);
  approx(result.compressedLength, 3 * (1500 / 2 - result.eccentricity));
  approx(result.capacity, equilibrium + 0.4 * 1e6);

  const tension = calculateNTC2018MasonryPierSlidingCapacity({
    axialCompression: -1e6,
    cohesion: 0.1,
    shearStrengthLimit: 10,
    length: 1500,
    thickness: 300,
    shearSpan: 1500,
  });

  approx(tension.capacity, 0.1 * 1500 * 300);
});

test("NTC irregular and regular diagonal capacities reproduce their independent strategies", () => {
  const irregular = calculateNTC2018MasonryPierIrregularDiagonalCapacity({
    axialCompression: 300000,
    referenceShearStrength: 0.08,
    length: 1500,
    thickness: 300,
    height: 3000,
  });
  const ftd = 1.5 * 0.08;
  const sigma0 = 300000 / (1500 * 300);
  const expectedIrregular =
    ((1500 * 300 * ftd) / 1.5) * Math.sqrt(1 + sigma0 / ftd);

  approx(irregular.capacity, expectedIrregular);

  const regular = calculateNTC2018MasonryPierRegularDiagonalCapacity({
    axialCompression: 300000,
    cohesion: 0.1,
    interlockingCoefficient: 0.5,
    localFrictionCoefficient: 0.577,
    blockTensileStrength: 1,
    length: 1500,
    thickness: 300,
    height: 3000,
  });
  const denominator = 1 + 0.577 * 0.5;
  const expectedJoint =
    ((1500 * 300) / 1.5) * ((0.1 + 0.577 * sigma0) / denominator);

  approx(regular.jointCandidate, expectedJoint);
  assert.equal(regular.capacity, Math.min(regular.jointCandidate, regular.blockCandidate));
});

test("NTC elastic stiffness combines cracked flexural and shear compliances without double counting", () => {
  const stiffness = calculateNTC2018MasonryPierElasticStiffness({
    elasticModulus: 1800,
    shearModulus: 600,
    length: 1500,
    thickness: 300,
    deformableHeight: 3000,
    boundaryCondition: "cantilever",
  });
  const expected =
    1 / (1 / stiffness.bendingStiffness + 1 / stiffness.shearStiffness);

  approx(stiffness.totalStiffness, expected);
  assert.equal(stiffness.crackedStiffnessFactor, 0.5);

  const fixed = calculateNTC2018MasonryPierElasticStiffness({
    elasticModulus: 1800,
    shearModulus: 600,
    length: 1500,
    thickness: 300,
    deformableHeight: 3000,
    boundaryCondition: "fixed-fixed",
  });

  approx(fixed.bendingStiffness / stiffness.bendingStiffness, 4);
});

test("NTC ultimate displacement is selected after the governing mechanism", () => {
  const flexural = calculateNTC2018MasonryPierUltimateDisplacement({
    height: 3000,
    mechanism: "flexural",
    scope: "existing",
  });
  const sliding = calculateNTC2018MasonryPierUltimateDisplacement({
    height: 3000,
    mechanism: "bed-joint-sliding",
    scope: "existing",
  });
  const modernDiagonal = calculateNTC2018MasonryPierUltimateDisplacement({
    height: 3000,
    mechanism: "diagonal-cracking-regular",
    scope: "existing",
    modernPerforatedBlocks: true,
  });

  assert.equal(flexural.ultimateDisplacement, 30);
  assert.equal(sliding.ultimateDisplacement, 15);
  assert.equal(modernDiagonal.ultimateDisplacement, 12);
});

test("autonomous NTC model applies FC only to existing-masonry strengths and remains serializable", () => {
  const model = createModel();
  const material = model.resolvedNormativeMaterial();
  const evaluation = model.evaluate();

  approx(material.compressiveStrength, 4 / 1.2);
  approx(material.cohesion, 0.12 / 1.2);
  approx(material.referenceShearStrength, 0.08 / 1.2);
  assert.equal(material.elasticModulus, 1800);
  assert.equal(material.shearModulus, 600);
  assert.equal(evaluation.complete, true);
  assert.equal(evaluation.governing.mechanism, "flexural");
  assert.equal(evaluation.deformation.ultimateDisplacement, 30);
  assert.doesNotThrow(() => JSON.stringify(model.toJSON()));
  assert.doesNotThrow(() => JSON.stringify(evaluation));
});

test("autonomous NTC analysis reports missing normative data instead of inventing a block limit", () => {
  const model = createModel({
    normative: {
      scope: "existing",
      masonryTexture: "irregular",
    },
  });
  const result = new NTC2018MasonryPierAnalysis().analyze({ model });

  assert.equal(result.status, "not-implemented");
  assert.equal(result.outputs.complete, false);
  assert.deepEqual(
    result.outputs.missing[0].parameters,
    ["shearStrengthLimit"],
  );
});

test("autonomous NTC analysis enforces the SLC displacement limit on its bilinear envelope", () => {
  const model = createModel({
    actions: {
      axialForce: 300,
      axialForceConvention: "compression-positive",
      lateralDisplacement: 0.031,
    },
  });
  const result = new NTC2018MasonryPierAnalysis().analyze({ model });

  assert.equal(result.status, "not-verified");
  assert.equal(result.demand, 31);
  assert.equal(result.capacity, 30);
  assert.equal(result.outputs.response.branch, "failed");
  assert.equal(result.outputs.response.force, 0);
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});

test("alignment aggregation reuses the same normative flexural and stiffness kernels", () => {
  const units = { force: "N", length: "m" };
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-common-ntc-kernel",
    units,
    walls: [
      {
        id: "wall",
        length: 1.5,
        height: 3,
        thickness: 0.3,
        material: {
          units,
          fm: 4e6,
          tau0: 0.08e6,
          fv0: 0.12e6,
          E: 1.8e9,
          G: 0.6e9,
          density: 0,
        },
        verticalLineLoad: { G1: 200000 },
      },
    ],
  });
  const result = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment,
    options: { crackedStiffnessFactor: 0.5 },
  });
  const pier = result.outputs.piers[0];
  const expectedFlexural = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression: pier.axialForces.base,
    compressiveStrength: 4e6,
    length: 1.5,
    thickness: 0.3,
    shearSpan: 3,
  });
  const expectedStiffness = calculateNTC2018MasonryPierElasticStiffness({
    elasticModulus: 1.8e9,
    shearModulus: 0.6e9,
    length: 1.5,
    thickness: 0.3,
    deformableHeight: 3,
    crackedStiffnessFactor: 0.5,
  });

  approx(pier.mechanics.flexural.V, expectedFlexural.capacity);
  approx(pier.stiffness, expectedStiffness.totalStiffness);
});
