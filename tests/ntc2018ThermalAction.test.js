import test from "node:test";
import assert from "node:assert/strict";

import {
  CalculationResult,
  NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES,
  NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES,
  NTC2018_SUMMER_SOLAR_TEMPERATURE_INCREMENTS,
  NTC2018_THERMAL_EXPANSION_COEFFICIENTS,
  calculateNTC2018BuildingThermalActions,
  calculateNTC2018ExternalAirTemperatures,
  calculateNTC2018FreeThermalStrain,
  calculateNTC2018MeanElementTemperature,
  calculateNTC2018UniformTemperatureChange,
  getNTC2018ExternalAirTemperatureZoneDefinition,
  getNTC2018SimplifiedBuildingTemperatureChange,
  getNTC2018SolarTemperatureIncrement,
  getNTC2018ThermalExpansionCoefficientDefinition,
  resolveNTC2018InitialTemperature,
  resolveNTC2018InternalAirTemperature,
  resolveNTC2018ThermalExpansionCoefficient,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const temperatureUnit = "degC";

function approx(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

test("NTC 2018 thermal catalogs expose immutable normative values", () => {
  assert.equal(Object.isFrozen(NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES), true);
  assert.equal(Object.isFrozen(NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES.I), true);
  assert.equal(
    Object.isFrozen(NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES),
    true,
  );
  assert.equal(
    NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES.EXPOSED_STEEL.magnitude,
    25,
  );
  assert.equal(
    NTC2018_SUMMER_SOLAR_TEMPERATURE_INCREMENTS.DARK
      .SOUTH_WEST_OR_HORIZONTAL,
    42,
  );
  assert.equal(Object.isFrozen(NTC2018_THERMAL_EXPANSION_COEFFICIENTS), true);
  assert.equal(Object.isFrozen(NTC2018_THERMAL_EXPANSION_COEFFICIENTS[0]), true);

  const zone = getNTC2018ExternalAirTemperatureZoneDefinition("II");
  zone.minimumIntercept = 99;
  assert.equal(
    getNTC2018ExternalAirTemperatureZoneDefinition("II").minimumIntercept,
    -8,
  );
  assert.equal(
    getNTC2018SimplifiedBuildingTemperatureChange(
      "PROTECTED_REINFORCED_CONCRETE",
    ).magnitude,
    10,
  );
  assert.equal(
    getNTC2018ThermalExpansionCoefficientDefinition("structural-steel").value,
    12e-6,
  );
});

test("external-air temperatures reproduce the NTC 2018 zonal equations", () => {
  const zoneOne = calculateNTC2018ExternalAirTemperatures({
    zone: "I",
    siteAltitude: 500,
    temperatureUnit,
    units,
  });
  const zoneThree = calculateNTC2018ExternalAirTemperatures({
    zone: "III",
    siteAltitude: 1000,
    temperatureUnit,
    units,
  });
  const millimetreInput = calculateNTC2018ExternalAirTemperatures({
    zone: "IV",
    siteAltitude: 500000,
    temperatureUnit,
    units: { force: "N", length: "mm" },
  });

  assert.equal(zoneOne.minimum, -17);
  assert.equal(zoneOne.maximum, 39);
  assert.equal(zoneThree.minimum, -15);
  approx(zoneThree.maximum, 41.7);
  assert.equal(millimetreInput.siteAltitude, 500);
  assert.equal(millimetreInput.minimum, -6.5);
  assert.equal(millimetreInput.maximum, 41);
  assert.equal(zoneOne.returnPeriodYears, 50);
  assert.throws(
    () => calculateNTC2018ExternalAirTemperatures({
      zone: "V",
      siteAltitude: 100,
      temperatureUnit,
      units,
    }),
    /Unsupported NTC 2018 external-air temperature zone/,
  );
  assert.throws(
    () => calculateNTC2018ExternalAirTemperatures({
      zone: "I",
      siteAltitude: 100,
      temperatureUnit: "K",
      units,
    }),
    /temperatureUnit must be 'degC'/,
  );
});

test("default and documented air and initial temperatures preserve provenance", () => {
  const internalDefault = resolveNTC2018InternalAirTemperature({
    temperatureUnit,
  });
  const internalDocumented = resolveNTC2018InternalAirTemperature({
    value: 18,
    source: "Building use specification T-01",
    temperatureUnit,
  });
  const initialDefault = resolveNTC2018InitialTemperature({ temperatureUnit });
  const initialDocumented = resolveNTC2018InitialTemperature({
    value: 12,
    source: "Construction record T0-01",
    temperatureUnit,
  });

  assert.deepEqual(
    { value: internalDefault.value, source: internalDefault.source },
    { value: 20, source: "ntc2018-default" },
  );
  assert.equal(internalDocumented.sourceReference, "Building use specification T-01");
  assert.deepEqual(
    { value: initialDefault.value, source: initialDefault.source },
    { value: 15, source: "ntc2018-default" },
  );
  assert.equal(initialDocumented.sourceReference, "Construction record T0-01");
  assert.throws(
    () => resolveNTC2018InternalAirTemperature({
      value: 18,
      temperatureUnit,
    }),
    /source must be a non-empty string/,
  );
  assert.throws(
    () => resolveNTC2018InitialTemperature({
      source: "Unused source",
      temperatureUnit,
    }),
    /source must be omitted/,
  );
});

test("solar increments and uniform temperature state follow section 3.5.4", () => {
  const summerIncrement = getNTC2018SolarTemperatureIncrement({
    season: "SUMMER",
    surfaceNature: "LIGHT",
    orientation: "SOUTH_WEST_OR_HORIZONTAL",
  });
  const winterIncrement = getNTC2018SolarTemperatureIncrement({
    season: "WINTER",
    surfaceNature: "DARK",
    orientation: "NORTH_EAST",
  });
  const mean = calculateNTC2018MeanElementTemperature({
    externalSurfaceTemperature: 40,
    internalSurfaceTemperature: 20,
    temperatureUnit,
  });
  const delta = calculateNTC2018UniformTemperatureChange({
    meanTemperature: mean.value,
    initialTemperature: 15,
    temperatureUnit,
  });

  assert.equal(summerIncrement.value, 30);
  assert.equal(winterIncrement.value, 0);
  assert.equal(mean.value, 30);
  assert.equal(delta.value, 15);
  assert.throws(
    () => getNTC2018SolarTemperatureIncrement({
      season: "SPRING",
      surfaceNature: "LIGHT",
      orientation: "NORTH_EAST",
    }),
    /season must be SUMMER or WINTER/,
  );
});

test("thermal-expansion coefficients enforce fixed values and tabulated ranges", () => {
  const steel = resolveNTC2018ThermalExpansionCoefficient({
    materialId: "structural-steel",
  });
  const masonry = resolveNTC2018ThermalExpansionCoefficient({
    materialId: "masonry",
    value: 8e-6,
  });
  const strain = calculateNTC2018FreeThermalStrain({
    thermalExpansionCoefficient: masonry.selectedValue,
    temperatureChange: -20,
    temperatureUnit,
  });

  assert.equal(steel.selectedValue, 12e-6);
  assert.equal(steel.selection, "tabulated-fixed");
  assert.equal(masonry.selection, "explicit-within-tabulated-range");
  approx(strain.value, -160e-6);
  assert.equal(strain.quantity, "strain");
  assert.throws(
    () => resolveNTC2018ThermalExpansionCoefficient({
      materialId: "structural-steel",
      value: 11e-6,
    }),
    /fixed NTC 2018 thermal-expansion coefficient/,
  );
  assert.throws(
    () => resolveNTC2018ThermalExpansionCoefficient({
      materialId: "masonry",
      value: 11e-6,
    }),
    /must be between/,
  );
});

test("simplified building workflow creates symmetric serializable thermal actions", () => {
  const result = calculateNTC2018BuildingThermalActions({
    summerActionId: "thermal-plus",
    winterActionId: "thermal-minus",
    simplifiedBuildingType: "EXPOSED_STEEL",
    temperatureUnit,
  });

  assert.equal(result instanceof CalculationResult, true);
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.schemaVersion, "ntc2018-building-thermal-actions/v1");
  assert.equal(result.outputs.method, "ntc2018-simplified-building-values");
  assert.equal(result.outputs.cases[0].temperatureChange, 25);
  assert.equal(result.outputs.cases[1].temperatureChange, -25);
  assert.equal(result.outputs.actions[0].id, "thermal-plus");
  assert.equal(result.outputs.actions[1].id, "thermal-minus");
  assert.equal(result.outputs.actions[0].family, "thermal");
  assert.equal(result.outputs.actions[0].category, "THERMAL");
  assert.equal(result.outputs.actions[0].combinationFactors.psi0, 0.6);
  assert.equal(result.outputs.actions[0].combinationFactors.psi1, 0.5);
  assert.equal(result.outputs.actions[0].combinationFactors.psi2, 0);
  assert.equal(result.warnings.some((item) => item.includes("forces or stresses")), true);
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});

test("documented mean temperatures remain explicit inputs to the thermal workflow", () => {
  const result = calculateNTC2018BuildingThermalActions({
    summerMeanTemperature: 37,
    winterMeanTemperature: -5,
    temperatureStateSource: "Envelope heat-transfer study HT-01",
    initialTemperature: 12,
    initialTemperatureSource: "Construction record T0-01",
    temperatureUnit,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.method, "documented-mean-element-temperatures");
  assert.equal(result.outputs.initialTemperature.value, 12);
  assert.equal(result.outputs.cases[0].temperatureChange, 25);
  assert.equal(result.outputs.cases[1].temperatureChange, -17);
  assert.equal(
    result.outputs.actions[0].metadata.sourceReference,
    "Envelope heat-transfer study HT-01",
  );

  const defaultInitial = calculateNTC2018BuildingThermalActions({
    summerMeanTemperature: 37,
    winterMeanTemperature: -5,
    temperatureStateSource: "Envelope heat-transfer study HT-02",
    temperatureUnit,
  });
  assert.equal(defaultInitial.outputs.initialTemperature.value, 15);
  assert.equal(defaultInitial.outputs.cases[0].temperatureChange, 22);
  assert.equal(defaultInitial.outputs.cases[1].temperatureChange, -20);
});

test("thermal workflow rejects incomplete, undocumented or contradictory modes", () => {
  assert.throws(
    () => calculateNTC2018BuildingThermalActions({
      summerMeanTemperature: 30,
      temperatureStateSource: "Study HT-01",
      temperatureUnit,
    }),
    /must both be provided/,
  );
  assert.throws(
    () => calculateNTC2018BuildingThermalActions({
      summerMeanTemperature: 30,
      winterMeanTemperature: 0,
      temperatureUnit,
    }),
    /temperatureStateSource must be a non-empty string/,
  );
  assert.throws(
    () => calculateNTC2018BuildingThermalActions({
      simplifiedBuildingType: "EXPOSED_STEEL",
      temperatureStateSource: "Not applicable",
      temperatureUnit,
    }),
    /temperatureStateSource, initialTemperature and initialTemperatureSource must be omitted/,
  );
  assert.throws(
    () => calculateNTC2018BuildingThermalActions({
      simplifiedBuildingType: "EXPOSED_STEEL",
      summerMeanTemperature: 30,
      winterMeanTemperature: 0,
      temperatureStateSource: "Study HT-02",
      temperatureUnit,
    }),
    /Provide exactly one/,
  );
  assert.throws(
    () => calculateNTC2018BuildingThermalActions({
      summerMeanTemperature: 0,
      winterMeanTemperature: 10,
      temperatureStateSource: "Study HT-03",
      temperatureUnit,
    }),
    /summerMeanTemperature must not be lower/,
  );
});
