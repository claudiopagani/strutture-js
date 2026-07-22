import test from "node:test";
import assert from "node:assert/strict";

import {
  CalculationResult,
  NTC2018_WIND_EXPOSURE_CATEGORIES,
  NTC2018_WIND_ZONES,
  calculateNTC2018BaseWindSpeed,
  calculateNTC2018ReferenceWindPressure,
  calculateNTC2018ReferenceWindSpeed,
  calculateNTC2018WindAreaLoad,
  calculateNTC2018WindExposureCoefficient,
  calculateNTC2018WindPressure,
  calculateNTC2018WindReturnCoefficient,
  getNTC2018WindExposureCategoryDefinition,
  getNTC2018WindZoneDefinition,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

function approx(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

test("NTC 2018 wind catalogs expose immutable zone and exposure parameters", () => {
  assert.equal(Object.isFrozen(NTC2018_WIND_ZONES), true);
  assert.equal(Object.isFrozen(NTC2018_WIND_ZONES.ZONE_3), true);
  assert.deepEqual(
    {
      baseSeaLevelSpeed: NTC2018_WIND_ZONES.ZONE_8.baseSeaLevelSpeed,
      referenceAltitude: NTC2018_WIND_ZONES.ZONE_8.referenceAltitude,
      altitudeCoefficient: NTC2018_WIND_ZONES.ZONE_8.altitudeCoefficient,
    },
    { baseSeaLevelSpeed: 30, referenceAltitude: 1500, altitudeCoefficient: 0.5 },
  );
  assert.deepEqual(
    {
      roughnessFactor: NTC2018_WIND_EXPOSURE_CATEGORIES.IV.roughnessFactor,
      roughnessLength: NTC2018_WIND_EXPOSURE_CATEGORIES.IV.roughnessLength,
      minimumHeight: NTC2018_WIND_EXPOSURE_CATEGORIES.IV.minimumHeight,
    },
    { roughnessFactor: 0.22, roughnessLength: 0.3, minimumHeight: 8 },
  );

  const zone = getNTC2018WindZoneDefinition("ZONE_1");
  zone.baseSeaLevelSpeed = 99;
  assert.equal(getNTC2018WindZoneDefinition("ZONE_1").baseSeaLevelSpeed, 25);
  assert.equal(
    getNTC2018WindExposureCategoryDefinition("V").minimumHeight,
    12,
  );
});

test("NTC 2018 base wind speed follows zone and altitude equations", () => {
  const belowA0 = calculateNTC2018BaseWindSpeed({
    zone: "ZONE_3",
    siteAltitude: 500,
    units,
  });
  const aboveA0 = calculateNTC2018BaseWindSpeed({
    zone: "ZONE_3",
    siteAltitude: 1000,
    units,
  });
  const millimetreInput = calculateNTC2018BaseWindSpeed({
    zone: "ZONE_2",
    siteAltitude: 750000,
    units: { force: "N", length: "mm" },
  });

  assert.equal(belowA0.value, 27);
  approx(aboveA0.value, 27 * (1 + 0.37 * (1000 / 500 - 1)));
  assert.equal(aboveA0.velocityUnit, "m/s");
  assert.equal(millimetreInput.siteAltitude, 750);
  assert.equal(millimetreInput.value, 25);
  assert.throws(
    () => calculateNTC2018BaseWindSpeed({
      zone: "ZONE_3",
      siteAltitude: 1501,
      units,
    }),
    /not applicable above 1500 m/,
  );
});

test("documented base wind speed is checked against the zonal minimum", () => {
  const documented = calculateNTC2018BaseWindSpeed({
    zone: "ZONE_3",
    siteAltitude: 1600,
    baseWindSpeed: 55,
    baseWindSpeedUnit: "m/s",
    baseWindSpeedSource: "Local wind study W-01",
    units,
  });
  const minimumAt1500 = 27 * (1 + 0.37 * (1500 / 500 - 1));

  assert.equal(documented.value, 55);
  approx(documented.operands.ntc2018Minimum, minimumAt1500);
  assert.equal(documented.metadata.sourceReference, "Local wind study W-01");
  assert.throws(
    () => calculateNTC2018BaseWindSpeed({
      zone: "ZONE_3",
      siteAltitude: 1600,
      baseWindSpeed: 40,
      baseWindSpeedUnit: "m/s",
      baseWindSpeedSource: "Local wind study W-02",
      units,
    }),
    /must not be lower than the NTC 2018 minimum/,
  );
  assert.throws(
    () => calculateNTC2018BaseWindSpeed({
      zone: "ZONE_3",
      siteAltitude: 1600,
      baseWindSpeed: 55,
      baseWindSpeedUnit: "km/h",
      baseWindSpeedSource: "Local wind study W-03",
      units,
    }),
    /must be 'm\/s'/,
  );
});

test("return coefficient, reference speed and kinetic pressure reproduce NTC equations", () => {
  assert.equal(
    calculateNTC2018WindReturnCoefficient({ returnPeriodYears: 50 }).value,
    1,
  );
  approx(
    calculateNTC2018WindReturnCoefficient({ returnPeriodYears: 5 }).value,
    0.75 * Math.sqrt(1 - 0.2 * Math.log(-Math.log(1 - 1 / 5))),
  );
  assert.throws(
    () => calculateNTC2018WindReturnCoefficient({ returnPeriodYears: 4.99 }),
    /at least 5 years/,
  );

  const speed = calculateNTC2018ReferenceWindSpeed({
    baseWindSpeed: 25,
    returnPeriodYears: 50,
    velocityUnit: "m/s",
  });
  const pressure = calculateNTC2018ReferenceWindPressure({
    referenceWindSpeed: speed.value,
    velocityUnit: "m/s",
  });
  assert.equal(speed.value, 25);
  assert.equal(pressure.value, 0.390625);
  assert.equal(pressure.operands.airDensity, 1.25);
  assert.deepEqual(pressure.units, units);
});

test("exposure coefficient applies zmin and the documented logarithmic equation", () => {
  const categoryTwo = calculateNTC2018WindExposureCoefficient({
    exposureCategory: "II",
    heightAboveGround: 10,
    units,
  });
  const categoryFourBelowMinimum = calculateNTC2018WindExposureCoefficient({
    exposureCategory: "IV",
    heightAboveGround: 5,
    units,
  });
  const logarithmicTermTwo = Math.log(10 / 0.05);
  const logarithmicTermFour = Math.log(8 / 0.3);

  approx(
    categoryTwo.value,
    0.19 ** 2 * logarithmicTermTwo * (7 + logarithmicTermTwo),
  );
  assert.equal(categoryFourBelowMinimum.effectiveHeight, 8);
  assert.equal(categoryFourBelowMinimum.minimumHeightApplied, true);
  approx(
    categoryFourBelowMinimum.value,
    0.22 ** 2 * logarithmicTermFour * (7 + logarithmicTermFour),
  );
  assert.throws(
    () => calculateNTC2018WindExposureCoefficient({
      exposureCategory: "II",
      heightAboveGround: 201,
      units,
    }),
    /limited to heights not exceeding 200 m/,
  );
});

test("wind pressure preserves the sign of pressure and suction", () => {
  const ce = 0.19 ** 2 * Math.log(10 / 0.05) * (7 + Math.log(10 / 0.05));
  const pressure = calculateNTC2018WindPressure({
    referenceWindPressure: 0.000390625,
    exposureCoefficient: ce,
    pressureCoefficient: -0.8,
    dynamicCoefficient: 1,
    units: { force: "N", length: "mm" },
  });

  approx(pressure.value, -0.390625 * ce * 0.8);
  assert.equal(pressure.signConvention, "positive-pressure-negative-suction");
  assert.deepEqual(pressure.units, units);
});

test("NTC 2018 wind workflow produces a serializable static-equivalent area load", () => {
  const result = calculateNTC2018WindAreaLoad({
    id: "facade-wind",
    actionId: "wind-action",
    zone: "ZONE_1",
    siteAltitude: 100,
    returnPeriodYears: 50,
    exposureCategory: "II",
    heightAboveGround: 10,
    pressureCoefficient: -0.8,
    pressureCoefficientSource: "Documented facade coefficient CP-01",
    constructionHeight: 20,
    regularConstruction: true,
    units,
  });
  const ce = 0.19 ** 2 * Math.log(10 / 0.05) * (7 + Math.log(10 / 0.05));

  assert.equal(result instanceof CalculationResult, true);
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.schemaVersion, "ntc2018-wind-area-load/v1");
  assert.equal(result.outputs.baseWindSpeed.value, 25);
  assert.equal(result.outputs.referenceWindPressure.value, 0.390625);
  approx(result.outputs.exposureCoefficient.value, ce);
  approx(result.outputs.windPressure.value, -0.390625 * ce * 0.8);
  assert.equal(result.outputs.action.family, "wind");
  assert.equal(result.outputs.action.category, "WIND");
  assert.equal(result.outputs.action.combinationFactors.psi0, 0.6);
  assert.equal(result.outputs.load.id, "facade-wind");
  assert.equal(result.outputs.load.direction, "surface-normal");
  approx(result.outputs.load.intensity, result.outputs.windPressure.value);
  assert.equal(result.outputs.dynamicCoefficient.value, 1);
  assert.equal(result.assumptions.some((item) => item.includes("cd is 1")), true);
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});

test("wind workflow returns not-supported where nominal altitude, height or dynamics end", () => {
  const highSite = calculateNTC2018WindAreaLoad({
    zone: "ZONE_2",
    siteAltitude: 1600,
    heightAboveGround: 10,
    constructionHeight: 20,
    units,
  });
  assert.equal(highSite.status, "not-supported");
  assert.equal(highSite.outputs.minimumBaseWindSpeedAt1500m.siteAltitude, 1500);

  const highEvaluation = calculateNTC2018WindAreaLoad({
    zone: "ZONE_2",
    siteAltitude: 100,
    exposureCategory: "II",
    heightAboveGround: 210,
    constructionHeight: 220,
    units,
  });
  assert.equal(highEvaluation.status, "not-supported");
  assert.equal(highEvaluation.outputs.heightAboveGround, 210);

  const dynamicStudyRequired = calculateNTC2018WindAreaLoad({
    zone: "ZONE_2",
    siteAltitude: 100,
    exposureCategory: "II",
    heightAboveGround: 60,
    pressureCoefficient: 0.8,
    pressureCoefficientSource: "CP-regular",
    constructionHeight: 100,
    regularConstruction: true,
    units,
  });
  assert.equal(dynamicStudyRequired.status, "not-supported");
  assert.equal(
    dynamicStudyRequired.outputs.dynamicCoefficientReason,
    "construction-height-above-80m",
  );
});

test("documented exposure and dynamic coefficients extend the workflow without hiding sources", () => {
  const result = calculateNTC2018WindAreaLoad({
    zone: "ZONE_8",
    siteAltitude: 100,
    exposureCoefficient: 4.2,
    exposureCoefficientSource: "Site exposure study CE-01",
    heightAboveGround: 210,
    pressureCoefficient: 1.1,
    pressureCoefficientSource: "Wind tunnel coefficient CP-01",
    constructionHeight: 220,
    regularConstruction: false,
    dynamicCoefficient: 1.25,
    dynamicCoefficientSource: "Dynamic study CD-01",
    units,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.exposureCoefficient.sourceReference, "Site exposure study CE-01");
  assert.equal(result.outputs.pressureCoefficient.sourceReference, "Wind tunnel coefficient CP-01");
  assert.equal(result.outputs.dynamicCoefficient.sourceReference, "Dynamic study CD-01");
});

test("wind workflow rejects undocumented or contradictory coefficient inputs", () => {
  assert.throws(
    () => calculateNTC2018WindAreaLoad({
      zone: "ZONE_1",
      siteAltitude: 100,
      exposureCategory: "II",
      heightAboveGround: 10,
      pressureCoefficient: 0.8,
      constructionHeight: 20,
      regularConstruction: true,
      units,
    }),
    /pressureCoefficientSource must be a non-empty string/,
  );
  assert.throws(
    () => calculateNTC2018WindAreaLoad({
      zone: "ZONE_1",
      siteAltitude: 100,
      exposureCategory: "II",
      exposureCoefficient: 2,
      heightAboveGround: 10,
      constructionHeight: 20,
      units,
    }),
    /exactly one of exposureCategory or exposureCoefficient/,
  );
  assert.throws(
    () => calculateNTC2018WindAreaLoad({
      zone: "ZONE_1",
      siteAltitude: 100,
      exposureCategory: "II",
      heightAboveGround: 10,
      topographyCoefficient: 1.2,
      pressureCoefficient: 0.8,
      pressureCoefficientSource: "CP-01",
      constructionHeight: 20,
      regularConstruction: true,
      units,
    }),
    /topographyCoefficientSource must be a non-empty string/,
  );
  assert.throws(
    () => calculateNTC2018WindAreaLoad({
      zone: "ZONE_1",
      siteAltitude: 100,
      exposureCategory: "II",
      heightAboveGround: 30,
      constructionHeight: 20,
      units,
    }),
    /heightAboveGround must not exceed constructionHeight/,
  );
});
