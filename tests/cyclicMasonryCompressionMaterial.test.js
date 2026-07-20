import test from "node:test";
import assert from "node:assert/strict";

import { CyclicMasonryCompressionMaterial } from "../src/domain/materials/masonry/CyclicMasonryCompressionMaterial.js";

const units = { force: "N", length: "mm" };

function createMaterial(overrides = {}) {
  return new CyclicMasonryCompressionMaterial({
    units,
    elasticModulus: 2000,
    compressiveStrength: 4,
    peakStrain: 0.004,
    damageOnsetStrain: 0.004,
    ultimateStrain: 0.012,
    residualStrengthRatio: 0.2,
    unloadingStiffnessDegradation: 0.4,
    strengthDegradation: 0.3,
    energyDamageCoefficient: 0.05,
    hingeLength: 100,
    ...overrides,
  });
}

function approx(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("cyclic masonry compression follows the monotonic envelope and residual branch", () => {
  const material = createMaterial();

  material.setTrialStrain(-0.002);
  assert.ok(material.getStress() < 0);
  assert.ok(material.getTangent() > 0);
  material.commitState();

  material.setTrialStrain(-0.004);
  approx(material.getStress(), -4000, 1e-6);
  material.commitState();

  material.setTrialStrain(-0.008);
  assert.ok(material.getStress() > -4000);
  assert.ok(material.getTangent() < 0);
  assert.equal(material.getState().crushingActivated, true);
  material.commitState();

  material.setTrialStrain(-0.014);
  approx(material.getStress(), -800, 1e-6);
  assert.equal(material.getState().failed, true);
});

test("unloading before crushing is reversible and opening causes no damage", () => {
  const material = createMaterial();

  material.setTrialStrain(-0.002);
  material.commitState();
  material.setTrialStrain(0);

  approx(material.getStress(), 0);
  approx(material.getState().plasticStrain, 0);
  approx(material.getState().damage, 0);
  material.commitState();
  material.setTrialStrain(0.001);

  approx(material.getStress(), 0);
  approx(material.getState().damage, 0);
  assert.equal(material.getState().branch, "open");
});

test("post-peak unloading creates permanent closure strain and contact recloses", () => {
  const material = createMaterial();

  material.setTrialStrain(-0.008);
  material.commitState();
  const residualClosure = material.getCommittedState().plasticStrain;

  assert.ok(residualClosure < 0);
  material.setTrialStrain(residualClosure + 0.0005);
  approx(material.getStress(), 0);
  assert.equal(material.getState().branch, "open");
  material.commitState();

  material.setTrialStrain(residualClosure - 0.0005);
  assert.ok(material.getStress() < 0);
  assert.equal(material.getState().branch, "compression-reloading");
});

test("compression material keeps trial and committed state independent", () => {
  const material = createMaterial();

  material.setTrialStrain(-0.006);
  assert.notEqual(material.getStress(), 0);
  approx(material.getCommittedState().stress, 0);
  material.revertToLastCommit();
  approx(material.getStress(), 0);

  material.setTrialStrain(-0.006);
  material.commitState();
  const committedStress = material.getCommittedState().stress;
  material.setTrialStrain(0.002);
  material.revertToLastCommit();
  approx(material.getStress(), committedStress);
});

test("compression material clone owns independent cyclic state", () => {
  const material = createMaterial();
  material.setTrialStrain(-0.006);
  material.commitState();
  const cloned = material.clone();

  cloned.setTrialStrain(0.002);
  cloned.commitState();

  assert.notEqual(cloned.getCommittedState().strain, material.getCommittedState().strain);
  approx(material.getCommittedState().strain, -0.006);
});

test("repeated post-crushing cycles accumulate energy without contaminating opening damage", () => {
  const material = createMaterial();
  const history = [-0.007, 0, -0.007, 0, -0.007];

  for (const strain of history) {
    material.setTrialStrain(strain);
    material.commitState();
  }

  assert.ok(material.getCommittedState().reversalCount >= 3);
  assert.ok(material.getCommittedState().dissipatedEnergy > 0);
  assert.ok(material.getCommittedState().damage > 0);
});

test("optional tension softening is regularized by fracture energy and hinge length", () => {
  const material = createMaterial({
    tensileStrength: 0.1,
    tensionElasticModulus: 2000,
    tensionFractureEnergy: 0.01,
  });

  material.setTrialStrain(0.000025);
  assert.ok(material.getStress() > 0);
  material.setTrialStrain(0.0001);
  assert.equal(material.getState().branch, "tension-softening");
  assert.ok(material.getTangent() < 0);
});
