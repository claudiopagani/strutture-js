import test from "node:test";
import assert from "node:assert/strict";

import {
  cyclicMasonryBenchmarkPointsToCsv,
  cyclicMasonryPierBenchmarkDefinitions,
  runCyclicMasonryPierBenchmark,
  runCyclicMasonryPierValidationCampaign,
} from "../validation/cyclicMasonryPierValidationCampaign.js";

function maximum(points, key) {
  return Math.max(...points.map((point) => point[key]));
}

function monotonicProtocol(amplitude, increments = 60) {
  return Array.from(
    { length: increments + 1 },
    (_, index) => (amplitude * index) / increments,
  );
}

const campaign = runCyclicMasonryPierValidationCampaign();

test("four cyclic masonry benchmarks converge and activate competing mechanisms", () => {
  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 4);
  const [rocking, mixed, crushing, sliding] = campaign.results;

  assert.ok(rocking.mechanismsActivated.includes("rocking"));
  assert.ok(maximum(rocking.points, "rockingIndex") > 0.85);
  assert.equal(rocking.peakCompressionDamage, 0);

  assert.ok(mixed.mechanismsActivated.includes("rocking"));
  assert.ok(mixed.mechanismsActivated.includes("diagonal-tension"));
  assert.ok(maximum(mixed.points, "diagonalCrackingIndex") >= 0.99);
  assert.ok(mixed.finalEnergyDissipated > 0);

  assert.ok(crushing.mechanismsActivated.includes("crushing"));
  assert.ok(maximum(crushing.points, "crushingIndex") > 1);
  assert.ok(crushing.peakCompressionDamage > 0.01);

  assert.ok(sliding.mechanismsActivated.includes("sliding"));
  assert.ok(maximum(sliding.points, "slidingIndex") >= 0.99);
  assert.ok(Math.abs(sliding.finalResidualShearDeformation) > 1e-4);
  assert.ok(sliding.finalEnergyDissipated > mixed.finalEnergyDissipated);
});

test("benchmark rows are serializable and export all required CSV channels", () => {
  const serialized = JSON.parse(JSON.stringify(campaign));
  assert.equal(serialized.results.length, 4);
  const csv = cyclicMasonryBenchmarkPointsToCsv(campaign.results[0]);

  assert.match(csv, /lateralDisplacement,lateralForce,drift/);
  assert.match(csv, /compressedLength,compressionDamage,shearDamage/);
  assert.match(csv, /energyDissipated,predominantMechanism/);
  assert.equal(csv.trim().split("\n").length, campaign.results[0].points.length + 1);
});

test("virgin positive and negative responses are symmetric", () => {
  const base = cyclicMasonryPierBenchmarkDefinitions()[0];
  const positive = {
    ...base,
    id: `${base.id}-positive-symmetry`,
    protocol: monotonicProtocol(0.003, 30),
  };
  const negative = {
    ...base,
    id: `${base.id}-negative-symmetry`,
    protocol: monotonicProtocol(-0.003, 30),
  };
  const positiveResult = runCyclicMasonryPierBenchmark(positive);
  const negativeResult = runCyclicMasonryPierBenchmark(negative);

  assert.equal(positiveResult.status, "ok");
  assert.equal(negativeResult.status, "ok");
  const positiveForce = positiveResult.points.at(-1).lateralForce;
  const negativeForce = negativeResult.points.at(-1).lateralForce;
  assert.ok(
    Math.abs(positiveForce + negativeForce) <=
      1e-6 * Math.max(Math.abs(positiveForce), 1),
  );
});

test("global rocking response is reasonably mesh-independent from 8 to 64 fibers", () => {
  const definition = cyclicMasonryPierBenchmarkDefinitions()[0];
  definition.protocol = monotonicProtocol(0.006);
  const results = [8, 16, 32, 64].map((fiberCount) =>
    runCyclicMasonryPierBenchmark(definition, { fiberCount }),
  );

  assert.ok(results.every((result) => result.status === "ok"));
  const reference = results.at(-1).peakAbsoluteLateralForce;
  const relativeDifferences = results.map((result) =>
    Math.abs(result.peakAbsoluteLateralForce - reference) / reference,
  );

  assert.ok(relativeDifferences[0] < 0.08);
  assert.ok(Math.max(...relativeDifferences.slice(1)) < 0.01);
});

test("hinge-length sensitivity is explicit, finite and bounded for the validation case", () => {
  const results = [0.05, 0.1, 0.2].map((hingeLength) => {
    const definition = cyclicMasonryPierBenchmarkDefinitions()[0];
    definition.id = `${definition.id}-Lh-${hingeLength}`;
    definition.geometry.hingeLength = hingeLength;
    definition.protocol = monotonicProtocol(0.006);
    return runCyclicMasonryPierBenchmark(definition, { fiberCount: 16 });
  });
  const forces = results.map((result) => result.peakAbsoluteLateralForce);
  const spread = (Math.max(...forces) - Math.min(...forces)) / Math.max(...forces);

  assert.ok(results.every((result) => result.status === "ok"));
  assert.ok(forces.every(Number.isFinite));
  assert.ok(spread > 0);
  assert.ok(spread < 0.05);
});

test("elastic rocking without crushing or shear yielding creates no spurious dissipation", () => {
  const definition = cyclicMasonryPierBenchmarkDefinitions()[0];
  definition.id = `${definition.id}-elastic-energy`;
  definition.shear.diagonalTensileStrength = 5000;
  definition.shear.cohesion = 5000;
  definition.shear.pinching = { enabled: false, factor: 1, recoveryRatio: 1 };
  definition.shear.stiffnessDegradation = { enabled: false };
  definition.shear.strengthDegradation = { enabled: false };
  definition.protocol = [
    ...monotonicProtocol(0.003, 30),
    ...monotonicProtocol(-0.006, 60).slice(1).map((value) => 0.003 + value),
    ...monotonicProtocol(0.003, 30).slice(1).map((value) => -0.003 + value),
  ];
  const result = runCyclicMasonryPierBenchmark(definition);

  assert.equal(result.status, "ok");
  assert.ok(maximum(result.points, "rockingIndex") > 0.5);
  assert.equal(result.peakCompressionDamage, 0);
  assert.equal(result.peakShearDamage, 0);
  assert.ok(result.finalEnergyDissipated < 1e-9);
});

test("fully compressed elastic response conserves incremental work", () => {
  const definition = cyclicMasonryPierBenchmarkDefinitions()[2];
  definition.id = `${definition.id}-elastic-work`;
  definition.compression.damageOnsetStrain = 0.004;
  definition.compression.ultimateStrain = 0.012;
  definition.shear.diagonalTensileStrength = 5000;
  definition.shear.cohesion = 5000;
  definition.shear.pinching = { enabled: false, factor: 1, recoveryRatio: 1 };
  definition.shear.stiffnessDegradation = { enabled: false };
  definition.shear.strengthDegradation = { enabled: false };
  definition.protocol = monotonicProtocol(0.0003, 12);
  const result = runCyclicMasonryPierBenchmark(definition);
  let work = 0;

  for (let index = 1; index < result.points.length; index += 1) {
    const previous = result.points[index - 1];
    const current = result.points[index];
    work +=
      0.5 *
      (previous.lateralForce + current.lateralForce) *
      (current.lateralDisplacement - previous.lateralDisplacement);
  }

  const final = result.points.at(-1);
  const elasticEnergy =
    0.5 * final.lateralForce * final.lateralDisplacement;

  assert.equal(result.status, "ok");
  assert.ok(maximum(result.points, "rockingIndex") < 1e-10);
  assert.ok(Math.abs(work - elasticEnergy) < 1e-10);
  assert.ok(result.finalEnergyDissipated < 1e-10);
});
