import test from "node:test";
import assert from "node:assert/strict";

import {
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES,
  createItalianHistoricalReinforcementSteelMaterial,
  createNTC2018ConcreteMaterial,
  listItalianHistoricalReinforcementSteelGrades,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("historical reinforcement steel catalog exposes grade strengths and standards", () => {
  assert.equal(ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES.FeB44k.fyk, 430);
  assert.equal(ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES.FeB44k.ftk, 540);

  const grades = listItalianHistoricalReinforcementSteelGrades();
  assert.equal(grades.length, 12);
  assert.ok(grades.some((entry) => entry.grade === "Aq50"));
});

test("historical reinforcement steel factory keeps normative reference for UI display", () => {
  const material = createItalianHistoricalReinforcementSteelMaterial({
    grade: "A41",
    units,
  });

  assert.equal(material.grade, "A41");
  assert.equal(material.fyk, 400);
  assert.equal(material.ftk, 490);
  assert.equal(material.metadata.standardReference, "D.M. 30/05/1972");
  assert.equal(material.metadata.steelUse, "reinforcement");
  assert.equal(material.isExistingMaterial(), false);
});

test("existing reinforcement steel derives characteristic strengths from means and FC", () => {
  const material = createItalianHistoricalReinforcementSteelMaterial({
    grade: "A38",
    existing: true,
    knowledgeLevel: 2,
    units,
  });

  assert.equal(material.isExistingMaterial(), true);
  assert.equal(material.knowledgeLevel, "LC2");
  approx(material.confidenceFactor, 1.2);
  approx(material.fyMean, 375);
  approx(material.ftMean, 450);
  approx(material.fyk, 312.5);
  approx(material.ftk, 375);
  approx(material.fyd, 271.74, 1e-2);
  assert.equal(
    material.metadata.characteristicStrengthSource,
    "mean-divided-by-confidence-factor",
  );
});

test("existing concrete material derives fck from mean compressive strength and FC", () => {
  const material = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    existing: true,
    knowledgeLevel: "LC1",
    meanCompressiveStrength: 30,
    units,
  });

  assert.equal(material.isExistingMaterial(), true);
  assert.equal(material.knowledgeLevel, "LC1");
  approx(material.confidenceFactor, 1.35);
  approx(material.fcm, 30);
  approx(material.fck, 22.22, 1e-2);
  approx(material.fcd, 12.59, 1e-2);
});
