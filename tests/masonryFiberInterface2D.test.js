import test from "node:test";
import assert from "node:assert/strict";

import { CyclicMasonryCompressionMaterial } from "../src/domain/materials/masonry/CyclicMasonryCompressionMaterial.js";
import { MasonryFiberInterface2D } from "../src/domain/sections/masonry/MasonryFiberInterface2D.js";

const units = { force: "N", length: "mm" };

function createInterface({ fiberCount = 40, material = {} } = {}) {
  const compressionMaterial = new CyclicMasonryCompressionMaterial({
    units,
    elasticModulus: 2000,
    compressiveStrength: 4,
    peakStrain: 0.002,
    prePeakCurve: "linear",
    damageOnsetStrain: 0.004,
    ultimateStrain: 0.012,
    residualStrengthRatio: 0.2,
    unloadingStiffnessDegradation: 0.4,
    strengthDegradation: 0.3,
    hingeLength: 100,
    ...material,
  });

  return new MasonryFiberInterface2D({
    units,
    width: 1000,
    thickness: 250,
    hingeLength: 100,
    fiberCount,
    compressionMaterial,
  });
}

function approx(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("fiber interface reproduces centered elastic compression", () => {
  const interfaceModel = createInterface({ fiberCount: 40 });
  const [axialForce, moment] = interfaceModel.setTrialDeformation(-0.0001, 0);
  const response = interfaceModel.getResponse();

  approx(axialForce, -500, 1e-6);
  approx(moment, 0, 1e-10);
  approx(response.compressedLength, 1);
  approx(response.rockingIndex, 0);
  assert.equal(response.fibers.every((fiber) => fiber.contactActive), true);
});

test("fiber interface matches elastic N-M resultants before opening", () => {
  const interfaceModel = createInterface({ fiberCount: 200 });
  const delta0 = -0.0001;
  const rotation = 0.0001;
  const [axialForce, moment] = interfaceModel.setTrialDeformation(delta0, rotation);
  const elasticModulus = 2e6;
  const area = 1 * 0.25;
  const inertia = (0.25 * 1 ** 3) / 12;
  const hingeLength = 0.1;

  approx(axialForce, elasticModulus * area * delta0 / hingeLength, 1e-6);
  approx(moment, elasticModulus * inertia * rotation / hingeLength, 0.02);
  approx(interfaceModel.getResponse().compressedLength, 1);
});

test("fiber interface develops partial contact and rocking without crushing damage", () => {
  const interfaceModel = createInterface({ fiberCount: 40 });
  interfaceModel.setTrialDeformation(-0.0001, 0.0005);
  const response = interfaceModel.getResponse();

  assert.ok(response.compressedLength > 0);
  assert.ok(response.compressedLength < interfaceModel.width);
  assert.ok(response.rockingIndex > 0);
  approx(response.maxCompressionDamage, 0);
  assert.ok(response.mechanismsActivated.includes("rocking"));
});

test("fiber interface opens one edge and reverses moment symmetrically", () => {
  const positive = createInterface({ fiberCount: 64 });
  const negative = createInterface({ fiberCount: 64 });
  const responsePositive = positive.setTrialDeformation(-0.00005, 0.001);
  const responseNegative = negative.setTrialDeformation(-0.00005, -0.001);

  approx(responsePositive[0], responseNegative[0], 1e-8);
  approx(responsePositive[1], -responseNegative[1], 1e-8);
  assert.ok(positive.getResponse().fibers.some((fiber) => !fiber.contactActive));
  assert.ok(positive.getResponse().fibers.some((fiber) => fiber.contactActive));
});

test("fiber interface supports a completely open contact state", () => {
  const interfaceModel = createInterface();
  interfaceModel.setTrialDeformation(0.0005, 0);
  const response = interfaceModel.getResponse();

  approx(response.axialForce, 0);
  approx(response.moment, 0);
  approx(response.compressedLength, 0);
  approx(response.rockingIndex, 1);
});

test("fiber interface analytical tangent matches centered finite differences", () => {
  const interfaceModel = createInterface({ fiberCount: 32 });
  const deformation = [-0.0002, 0.0001];
  const step = [1e-8, 1e-8];

  interfaceModel.setTrialDeformation(...deformation);
  const analytical = interfaceModel.getTangent();
  const numerical = [[0, 0], [0, 0]];

  for (let column = 0; column < 2; column += 1) {
    const plus = [...deformation];
    const minus = [...deformation];
    plus[column] += step[column];
    minus[column] -= step[column];
    const forcePlus = interfaceModel.setTrialDeformation(...plus);
    const forceMinus = interfaceModel.setTrialDeformation(...minus);

    for (let row = 0; row < 2; row += 1) {
      numerical[row][column] =
        (forcePlus[row] - forceMinus[row]) / (2 * step[column]);
      approx(
        analytical[row][column],
        numerical[row][column],
        Math.max(1e-3, Math.abs(analytical[row][column]) * 2e-6),
      );
    }
  }
});

test("fiber interface commit, revert and clone preserve independent fiber histories", () => {
  const interfaceModel = createInterface({ fiberCount: 16 });
  interfaceModel.setTrialDeformation(-0.0008, 0.001);
  interfaceModel.commitState();
  const committedMoment = interfaceModel.getCommittedResponse().moment;
  const cloned = interfaceModel.clone();

  interfaceModel.setTrialDeformation(0.0005, 0);
  interfaceModel.revertToLastCommit();
  approx(interfaceModel.getResponse().moment, committedMoment);

  cloned.setTrialDeformation(-0.0008, -0.001);
  cloned.commitState();
  assert.notEqual(
    cloned.getCommittedResponse().moment,
    interfaceModel.getCommittedResponse().moment,
  );
});
