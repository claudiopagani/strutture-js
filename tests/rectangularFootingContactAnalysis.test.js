import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularFootingContactAnalysis,
  integrateFootingPressureStrip,
} from "../src/index.js";

const analysis = new RectangularFootingContactAnalysis();

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("rectangular footing contact resolves a full biaxial linear pressure field", () => {
  const result = analysis.analyze({
    widthX: 2000,
    widthY: 2000,
    nEd: 4_000_000,
    mxEd: 0,
    myEd: 400_000_000,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.contactType, "full");
  approx(result.eccentricityX, 100);
  approx(result.minimumPressure, 0.7);
  approx(result.maximumPressure, 1.3);
});

test("rectangular footing contact resolves uniaxial loss of contact without tension", () => {
  const result = analysis.analyze({
    widthX: 2000,
    widthY: 2000,
    nEd: 4_000_000,
    mxEd: 0,
    myEd: 1_600_000_000,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.contactType, "partial-uniaxial");
  approx(result.partialContact.contactLength, 1800);
  approx(result.contactArea, 3_600_000);
  approx(result.maximumPressure, 20 / 9);
  assert.equal(result.minimumPressure, 0);
});

test("rectangular footing contact solves biaxial compression-only contact by equilibrium", () => {
  const result = analysis.analyze({
    widthX: 2000,
    widthY: 2000,
    nEd: 4_000_000,
    mxEd: 1_200_000_000,
    myEd: 1_200_000_000,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.contactType, "partial-biaxial");
  assert.ok(result.elasticMinimumPressure < 0);
  assert.equal(result.minimumPressure, 0);
  assert.ok(result.contactArea < result.area);
  assert.ok(result.partialContact.equilibriumResidualNorm < 1e-10);
  approx(result.partialContact.equilibriumResidual.n, 0, 1e-6);
  approx(result.partialContact.equilibriumResidual.mx, 0, 1e-3);
  approx(result.partialContact.equilibriumResidual.my, 0, 1e-3);
});

test("footing strip integration subtracts an explicit uniform downward pressure", () => {
  const contact = analysis.analyze({
    widthX: 2000,
    widthY: 2000,
    nEd: 4_000_000,
  });
  const result = integrateFootingPressureStrip({
    contact,
    axis: "x",
    from: 250,
    to: 1000,
    fixedCoordinate: 0,
    momentOrigin: 250,
    uniformDownwardPressure: 0.1,
  });

  approx(result.soilForce, 750);
  approx(result.downwardForce, 75);
  approx(result.netForce, 675);
  approx(result.netMoment, 253_125);
});
