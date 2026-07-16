import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcedConcreteTorsionVerification,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function createFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "rc-torsion-section",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    concreteMaterial,
    reinforcementMaterial,
    units,
  });
  const torsion = {
    edgeToLongitudinalBarCenter: 40,
    cotTheta: 1.5,
    transverseReinforcement: {
      closed: true,
      diameter: 8,
      spacing: 150,
      material: reinforcementMaterial,
    },
    longitudinalReinforcement: {
      area: 4 * Math.PI * 20 ** 2 / 4,
      material: reinforcementMaterial,
    },
  };
  const shear = {
    mode: "with-transverse-reinforcement",
    effectiveDepth: 450,
    longitudinalReinforcementArea: 4 * Math.PI * 20 ** 2 / 4,
    transverseReinforcement: {
      diameter: 8,
      legs: 2,
      spacing: 150,
      material: reinforcementMaterial,
    },
  };

  return { section, concreteMaterial, reinforcementMaterial, torsion, shear };
}

test("RC torsion verification evaluates the three NTC 2018 truss resistances", () => {
  const fixture = createFixture();
  const result = new ReinforcedConcreteTorsionVerification().verify({
    ...fixture,
    actions: { tEd: 20e6, vEd: 50e3 },
    units,
  });
  const concreteArea = 300 * 500;
  const perimeter = 2 * (300 + 500);
  const t = concreteArea / perimeter;
  const medianArea = (300 - t) * (500 - t);
  const medianPerimeter = 2 * ((300 - t) + (500 - t));
  const cotTheta = 1.5;
  const fcdPrime = 0.5 * fixture.concreteMaterial.fcd;
  const stirrupArea = Math.PI * 8 ** 2 / 4;
  const longitudinalArea = 4 * Math.PI * 20 ** 2 / 4;
  const fyd = fixture.reinforcementMaterial.fyd;
  const trcd =
    2 * medianArea * t * fcdPrime * cotTheta / (1 + cotTheta ** 2);
  const trsd =
    2 * medianArea * (stirrupArea / 150) * fyd * cotTheta;
  const trld =
    2 * medianArea * longitudinalArea * fyd / (medianPerimeter * cotTheta);

  assert.equal(result.status, "ok");
  approx(result.outputs.trcd, trcd, 1);
  approx(result.outputs.trsd, trsd, 1);
  approx(result.outputs.trld, trld, 1);
  approx(result.outputs.trd, Math.min(trcd, trsd, trld), 1);
  assert.ok(
    result.checks.some(
      (check) => check.id === "rc-shear-torsion-concrete-interaction",
    ),
  );
  assert.equal(result.outputs.cotTheta, cotTheta);
  assert.equal(result.metadata.method, "ntc2018-4.1.2.3.6");
});

test("RC torsion verification requires shear data for combined V plus T", () => {
  const {
    section,
    concreteMaterial,
    reinforcementMaterial,
    torsion,
  } = createFixture();
  const result = new ReinforcedConcreteTorsionVerification().verify({
    section,
    concreteMaterial,
    reinforcementMaterial,
    torsion,
    actions: { tEd: 10e6, vEd: 50e3 },
    units,
  });

  assert.equal(result.status, "not-verified");
  assert.ok(
    result.metadata.missingParameters.includes("combinedShearTorsionParameters"),
  );
});

test("RC compatibility torsion can be explicitly left unanalyzed", () => {
  const fixture = createFixture();
  const result = new ReinforcedConcreteTorsionVerification().verify({
    ...fixture,
    torsion: { equilibriumRequired: false },
    actions: { tEd: 10e6 },
    units,
  });

  assert.equal(result.status, "not-analyzed");
  assert.equal(result.checks.length, 0);
});
