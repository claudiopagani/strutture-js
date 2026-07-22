import test from "node:test";
import assert from "node:assert/strict";

import {
  CalculationResult,
  NTC2018_SNOW_EXPOSURE_CLASSES,
  NTC2018_SNOW_GROUND_ZONES,
  calculateNTC2018GroundSnowLoad,
  calculateNTC2018PitchedRoofShapeCoefficient,
  calculateNTC2018RoofSnowLoad,
  calculateNTC2018SnowAreaLoad,
  getNTC2018SnowExposureClassDefinition,
  getNTC2018SnowGroundZoneDefinition,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

function approx(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

test("NTC 2018 snow catalogs expose immutable ground zones and exposure classes", () => {
  assert.equal(Object.isFrozen(NTC2018_SNOW_GROUND_ZONES), true);
  assert.equal(Object.isFrozen(NTC2018_SNOW_GROUND_ZONES.I_ALPINE), true);
  assert.equal(NTC2018_SNOW_GROUND_ZONES.I_ALPINE.lowAltitudeLoad, 1.5);
  assert.equal(NTC2018_SNOW_GROUND_ZONES.III.highAltitudeCoefficient, 0.51);
  assert.equal(NTC2018_SNOW_EXPOSURE_CLASSES.WIND_SWEPT.value, 0.9);
  assert.equal(NTC2018_SNOW_EXPOSURE_CLASSES.NORMAL.value, 1);
  assert.equal(NTC2018_SNOW_EXPOSURE_CLASSES.SHELTERED.value, 1.1);

  const zone = getNTC2018SnowGroundZoneDefinition("II");
  zone.lowAltitudeLoad = 99;
  assert.equal(getNTC2018SnowGroundZoneDefinition("II").lowAltitudeLoad, 1);
  assert.equal(
    getNTC2018SnowExposureClassDefinition("SHELTERED").description,
    "Area riparata",
  );
});

test("NTC 2018 ground snow load follows zonal altitude equations", () => {
  const lowAlpine = calculateNTC2018GroundSnowLoad({
    zone: "I_ALPINE",
    siteAltitude: 200,
    units,
  });
  const highAlpine = calculateNTC2018GroundSnowLoad({
    zone: "I_ALPINE",
    siteAltitude: 300,
    units,
  });
  const zoneTwo = calculateNTC2018GroundSnowLoad({
    zone: "II",
    siteAltitude: 500,
    units,
  });
  const millimetreInput = calculateNTC2018GroundSnowLoad({
    zone: "III",
    siteAltitude: 200000,
    units: { force: "N", length: "mm" },
  });

  assert.equal(lowAlpine.value, 1.5);
  assert.equal(lowAlpine.formula, "qsk = lowAltitudeLoad");
  approx(highAlpine.value, 1.39 * (1 + (300 / 728) ** 2));
  approx(zoneTwo.value, 0.85 * (1 + (500 / 481) ** 2));
  assert.equal(millimetreInput.siteAltitude, 200);
  assert.equal(millimetreInput.value, 0.6);
  assert.throws(
    () => calculateNTC2018GroundSnowLoad({
      zone: "II",
      siteAltitude: 1500.01,
      units,
    }),
    /not applicable above 1500 m/,
  );
});

test("NTC 2018 pitched-roof coefficient applies angle branches and sliding obstruction", () => {
  assert.equal(
    calculateNTC2018PitchedRoofShapeCoefficient({ roofAngleDegrees: 15 }).value,
    0.8,
  );
  assert.equal(
    calculateNTC2018PitchedRoofShapeCoefficient({ roofAngleDegrees: 30 }).value,
    0.8,
  );
  approx(
    calculateNTC2018PitchedRoofShapeCoefficient({ roofAngleDegrees: 45 }).value,
    0.4,
  );
  assert.equal(
    calculateNTC2018PitchedRoofShapeCoefficient({ roofAngleDegrees: 60 }).value,
    0,
  );

  const obstructed = calculateNTC2018PitchedRoofShapeCoefficient({
    roofAngleDegrees: 75,
    slidingPrevented: true,
  });
  assert.equal(obstructed.nominalValue, 0);
  assert.equal(obstructed.minimumApplied, true);
  assert.equal(obstructed.value, 0.8);
  assert.throws(
    () => calculateNTC2018PitchedRoofShapeCoefficient({ roofAngleDegrees: 91 }),
    /must not exceed 90/,
  );
});

test("NTC 2018 roof snow load normalizes qsk and preserves the normative convention", () => {
  const result = calculateNTC2018RoofSnowLoad({
    groundSnowLoad: 0.0015,
    shapeCoefficient: 0.8,
    exposureCoefficient: 1,
    thermalCoefficient: 1,
    units: { force: "N", length: "mm" },
  });

  approx(result.value, 1.2);
  assert.equal(result.operands.groundSnowLoad, 1.5);
  assert.equal(result.applicationDirection, "vertical");
  assert.equal(result.referenceSurface, "horizontal-projection");
  assert.deepEqual(result.units, units);
});

test("NTC 2018 snow workflow produces a serializable low-altitude action and area load", () => {
  const result = calculateNTC2018SnowAreaLoad({
    id: "roof-snow",
    actionId: "snow-action",
    zone: "I_MEDITERRANEAN",
    siteAltitude: 150,
    roofAngleDegrees: 20,
    exposureClass: "NORMAL",
    units,
  });

  assert.equal(result instanceof CalculationResult, true);
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.schemaVersion, "ntc2018-snow-area-load/v1");
  assert.equal(result.outputs.groundSnowLoad.value, 1.5);
  assert.equal(result.outputs.shapeCoefficient.value, 0.8);
  approx(result.outputs.roofSnowLoad.value, 1.2);
  assert.equal(result.outputs.action.id, "snow-action");
  assert.equal(result.outputs.action.family, "snow");
  assert.equal(result.outputs.action.category, "SNOW_LOW");
  assert.equal(result.outputs.action.combinationFactors.psi0, 0.5);
  assert.equal(result.outputs.action.combinationFactors.psi1, 0.2);
  assert.equal(result.outputs.action.combinationFactors.psi2, 0);
  assert.equal(result.outputs.load.id, "roof-snow");
  assert.equal(result.outputs.load.actionId, "snow-action");
  approx(result.outputs.load.intensity, 1.2);
  assert.equal(result.outputs.load.direction, "vertical");
  assert.equal(result.assumptions.some((item) => item.includes("Ct is 1")), true);
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});

test("NTC 2018 snow workflow selects high-altitude combination factors", () => {
  const result = calculateNTC2018SnowAreaLoad({
    zone: "III",
    siteAltitude: 1200,
    roofAngleDegrees: 45,
    exposureClass: "WIND_SWEPT",
    thermalCoefficient: 1,
    units,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.action.category, "SNOW_HIGH");
  assert.equal(result.outputs.action.combinationFactors.psi0, 0.7);
  assert.equal(result.outputs.action.combinationFactors.psi1, 0.5);
  assert.equal(result.outputs.action.combinationFactors.psi2, 0.2);
  approx(result.outputs.groundSnowLoad.value, 0.51 * (1 + (1200 / 481) ** 2));
  approx(
    result.outputs.roofSnowLoad.value,
    0.51 * (1 + (1200 / 481) ** 2) * 0.4 * 0.9,
  );
});

test("snow workflow requires documented local qsk above 1500 m and enforces its floor", () => {
  const unsupported = calculateNTC2018SnowAreaLoad({
    zone: "II",
    siteAltitude: 1600,
    units,
  });
  assert.equal(unsupported.status, "not-supported");
  approx(
    unsupported.outputs.minimumGroundSnowLoadAt1500m.value,
    0.85 * (1 + (1500 / 481) ** 2),
  );

  const documented = calculateNTC2018SnowAreaLoad({
    zone: "II",
    siteAltitude: 1600,
    groundSnowLoad: 10,
    groundSnowLoadSource: "Local snow study LS-01",
    roofAngleDegrees: 10,
    exposureClass: "NORMAL",
    units,
  });
  assert.equal(documented.status, "ok");
  assert.equal(documented.outputs.groundSnowLoad.value, 10);
  assert.equal(
    documented.outputs.groundSnowLoad.metadata.sourceReference,
    "Local snow study LS-01",
  );
  assert.equal(documented.outputs.action.category, "SNOW_HIGH");

  assert.throws(
    () => calculateNTC2018SnowAreaLoad({
      zone: "II",
      siteAltitude: 1600,
      groundSnowLoad: 9,
      groundSnowLoadSource: "Local snow study LS-02",
      roofAngleDegrees: 10,
      exposureClass: "NORMAL",
      units,
    }),
    /must not be lower than the NTC 2018 minimum/,
  );
});

test("snow workflow preserves documented coefficients and rejects ambiguous inputs", () => {
  const result = calculateNTC2018SnowAreaLoad({
    zone: "I_ALPINE",
    siteAltitude: 300,
    shapeCoefficient: 1.4,
    shapeCoefficientSource: "Documented drift load case D1",
    exposureCoefficient: 1.05,
    exposureCoefficientSource: "Site exposure study E1",
    thermalCoefficient: 0.9,
    thermalCoefficientSource: "Roof thermal study T1",
    units,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.shapeCoefficient.sourceReference, "Documented drift load case D1");
  assert.equal(result.outputs.exposureCoefficient.sourceReference, "Site exposure study E1");
  assert.equal(result.outputs.thermalCoefficient.sourceReference, "Roof thermal study T1");

  assert.throws(
    () => calculateNTC2018SnowAreaLoad({
      zone: "I_ALPINE",
      siteAltitude: 300,
      roofAngleDegrees: 20,
      shapeCoefficient: 0.8,
      exposureClass: "NORMAL",
      units,
    }),
    /exactly one of roofAngleDegrees or shapeCoefficient/,
  );
  assert.throws(
    () => calculateNTC2018SnowAreaLoad({
      zone: "I_ALPINE",
      siteAltitude: 300,
      roofAngleDegrees: 20,
      exposureClass: "NORMAL",
      thermalCoefficient: 0.9,
      units,
    }),
    /thermalCoefficientSource must be a non-empty string/,
  );
  assert.throws(
    () => calculateNTC2018SnowAreaLoad({
      zone: "I_ALPINE",
      siteAltitude: 300,
      roofAngleDegrees: 20,
      units,
    }),
    /exactly one of exposureClass or exposureCoefficient/,
  );
});
