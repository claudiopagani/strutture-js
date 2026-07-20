import test from "node:test";
import assert from "node:assert/strict";

import { CyclicMasonryShearMaterial } from "../src/domain/materials/masonry/CyclicMasonryShearMaterial.js";
import { SlidingStrengthModel } from "../src/domain/materials/masonry/shearStrength/SlidingStrengthModel.js";
import { TurnsekSheppardModel } from "../src/domain/materials/masonry/shearStrength/TurnsekSheppardModel.js";

const units = { force: "N", length: "mm" };

const context = {
  deformableHeight: 2.5,
  effectiveShearArea: 0.25,
  thickness: 0.25,
  compressedLength: 1,
  currentAxialCompression: 200,
  compressionDamage: 0,
};

function createShearMaterial(overrides = {}) {
  return new CyclicMasonryShearMaterial({
    units,
    shearModulus: 800,
    diagonalTensionModel: new TurnsekSheppardModel({
      units,
      tensileStrength: 0.15,
      shearStressDistributionFactor: 1.2,
      damageCoefficient: 0.8,
      crushingReductionCoefficient: 0.5,
    }),
    slidingModel: new SlidingStrengthModel({
      units,
      cohesion: 0.12,
      frictionCoefficient: 0.4,
      residualCohesionRatio: 0.1,
    }),
    peakShearStrain: 0.004,
    ultimateShearStrain: 0.012,
    hardeningRatio: 0.05,
    residualStrengthRatio: 0.25,
    pinching: { enabled: true, factor: 0.3, recoveryRatio: 0.8 },
    stiffnessDegradation: {
      enabled: true,
      ductilityCoefficient: 0.4,
      energyCoefficient: 0.1,
      limit: 0.9,
    },
    strengthDegradation: {
      enabled: true,
      ductilityCoefficient: 0.3,
      energyCoefficient: 0.1,
      limit: 0.75,
    },
    ...overrides,
  });
}

function approx(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("sliding capacity uses compressed length and compression but never tensile axial force", () => {
  const model = new SlidingStrengthModel({
    units,
    cohesion: 0.1,
    frictionCoefficient: 0.5,
    residualCohesionRatio: 0.2,
  });
  const compressed = model.evaluate({
    thickness: 0.25,
    compressedLength: 1,
    currentAxialCompression: 100,
  });
  const tension = model.evaluate({
    thickness: 0.25,
    compressedLength: 0.5,
    currentAxialCompression: -100,
  });

  approx(compressed.capacity, 75);
  approx(tension.capacity, 12.5);
  approx(tension.frictionContribution, 0);
});

test("Turnsek-Sheppard strategy depends on current compression and compressed length", () => {
  const model = new TurnsekSheppardModel({
    units,
    tensileStrength: 0.15,
    shearStressDistributionFactor: 1.2,
  });
  const full = model.evaluate({
    thickness: 0.25,
    compressedLength: 1,
    currentAxialCompression: 200,
  });
  const partial = model.evaluate({
    thickness: 0.25,
    compressedLength: 0.5,
    currentAxialCompression: 200,
  });
  const lowCompression = model.evaluate({
    thickness: 0.25,
    compressedLength: 1,
    currentAxialCompression: 20,
  });

  assert.ok(full.capacity > partial.capacity);
  assert.ok(full.capacity > lowCompression.capacity);
});

test("Turnsek-Sheppard strategy transmits configured crushing damage to shear capacity", () => {
  const model = new TurnsekSheppardModel({
    units,
    tensileStrength: 0.15,
    shearStressDistributionFactor: 1.2,
    crushingReductionCoefficient: 0.6,
  });
  const undamaged = model.evaluate({
    ...context,
    compressionDamage: 0,
  });
  const crushed = model.evaluate({
    ...context,
    compressionDamage: 0.5,
  });

  approx(crushed.capacity, 0.7 * undamaged.capacity, 1e-10);
});

test("cyclic shear monotonic branches are antisymmetric", () => {
  const positive = createShearMaterial();
  const negative = createShearMaterial();

  for (const deformation of [0.001, 0.004, 0.01, 0.02, 0.035]) {
    positive.setTrialDeformation(deformation, context);
    negative.setTrialDeformation(-deformation, context);
    approx(positive.getForce(), -negative.getForce(), 1e-8);
    positive.commitState();
    negative.commitState();
  }

  assert.equal(positive.getState().branch, "residual");
  assert.ok(
    Math.abs(positive.getForce()) <=
      positive.getState().capacities.combined * 0.26,
  );
});

test("cyclic shear reversal produces pinching and plastic deformation", () => {
  const material = createShearMaterial();
  material.setTrialDeformation(0.02, context);
  material.commitState();
  material.setTrialDeformation(0, context);
  material.commitState();
  material.setTrialDeformation(-0.002, context);

  const state = material.getState();
  assert.equal(state.pinchingActive, true);
  assert.ok(state.pinchingFactor < 1);
  assert.ok(Math.abs(state.plasticDeformation) > 0);
  assert.ok(state.branch.startsWith("pinched"));
});

test("cyclic shear repeated excursions accumulate energy and degradation", () => {
  const material = createShearMaterial();
  const history = [0.018, 0, -0.018, 0, 0.018, 0, -0.018];

  for (const deformation of history) {
    material.setTrialDeformation(deformation, context);
    material.commitState();
  }

  const state = material.getCommittedState();
  assert.ok(state.reversalCount >= 3);
  assert.ok(state.dissipatedEnergy > 0);
  assert.ok(state.stiffnessDamage > 0);
  assert.ok(state.strengthDamage > 0);
});

test("shear capacity and diagnostic mechanism change with axial/contact context", () => {
  const lowCohesionMaterial = createShearMaterial({
    slidingModel: new SlidingStrengthModel({
      units,
      cohesion: 0.01,
      frictionCoefficient: 0.2,
      residualCohesionRatio: 0,
    }),
  });
  lowCohesionMaterial.setTrialDeformation(0.01, {
    ...context,
    currentAxialCompression: 20,
    compressedLength: 0.4,
  });
  const lowState = lowCohesionMaterial.getState();
  const highCompressionMaterial = createShearMaterial();
  highCompressionMaterial.setTrialDeformation(0.01, {
    ...context,
    currentAxialCompression: 500,
    compressedLength: 1,
  });
  const highState = highCompressionMaterial.getState();

  assert.equal(lowState.predominantMechanism, "sliding");
  assert.ok(
    highState.capacities.combined > lowState.capacities.combined,
  );
});

test("cyclic shear trial state can be reverted and cloned independently", () => {
  const material = createShearMaterial();
  material.setTrialDeformation(0.01, context);
  approx(material.getCommittedState().force, 0);
  material.revertToLastCommit();
  approx(material.getForce(), 0);

  material.setTrialDeformation(0.01, context);
  material.commitState();
  const clone = material.clone();
  clone.setTrialDeformation(-0.01, context);
  clone.commitState();

  assert.notEqual(
    clone.getCommittedState().deformation,
    material.getCommittedState().deformation,
  );
});

test("optional sliding residual floor preserves transferred friction", () => {
  const material = createShearMaterial({
    residualStrengthMode: "sliding-floor",
    diagonalTensionModel: new TurnsekSheppardModel({
      units,
      tensileStrength: 10,
      shearStressDistributionFactor: 1,
    }),
    slidingModel: new SlidingStrengthModel({
      units,
      cohesion: 0.02,
      frictionCoefficient: 0.4,
      residualCohesionRatio: 0,
    }),
  });
  material.setTrialDeformation(0.05, context);
  const state = material.getState();
  const frictionFloor = 0.4 * context.currentAxialCompression;

  assert.ok(state.capacities.residual >= 0.95 * frictionFloor);
  assert.ok(Math.abs(state.force) >= 0.95 * frictionFloor);
});
