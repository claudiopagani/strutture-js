import { CalculationResult } from "../../../core/results/CalculationResult.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../../domain/units/UnitSystem.js";
import { createNTC2018ThermalAction } from "./createNTC2018Action.js";

const INTERNAL_LENGTH_UNITS = Object.freeze({ force: "kN", length: "m" });
const TEMPERATURE_UNIT = "degC";
const DEFAULT_INTERNAL_AIR_TEMPERATURE = 20;
const DEFAULT_INITIAL_TEMPERATURE = 15;

export const NTC2018_THERMAL_REFERENCES = Object.freeze({
  externalAir: "D.M. 17/01/2018, NTC 2018, section 3.5.2, equations [3.5.1]-[3.5.8]",
  internalAir: "D.M. 17/01/2018, NTC 2018, section 3.5.3",
  elementDistribution: "D.M. 17/01/2018, NTC 2018, section 3.5.4, Table 3.5.I",
  simplifiedBuildings: "D.M. 17/01/2018, NTC 2018, section 3.5.5, Table 3.5.II",
  expansionCoefficients: "D.M. 17/01/2018, NTC 2018, section 3.5.7, Table 3.5.III",
  combinationFactors: "D.M. 17/01/2018, NTC 2018, section 2.5.2, Table 2.5.I",
});

function freezeDefinitions(definitions) {
  return Object.freeze(Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [
      id,
      Object.freeze({ id, ...definition }),
    ]),
  ));
}

export const NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES = freezeDefinitions({
  I: {
    description: "Zona I",
    minimumIntercept: -15,
    minimumAltitudeGradient: -4,
    maximumIntercept: 42,
    maximumAltitudeGradient: -6,
    minimumEquation: "[3.5.1]",
    maximumEquation: "[3.5.2]",
  },
  II: {
    description: "Zona II",
    minimumIntercept: -8,
    minimumAltitudeGradient: -6,
    maximumIntercept: 42,
    maximumAltitudeGradient: -2,
    minimumEquation: "[3.5.3]",
    maximumEquation: "[3.5.4]",
  },
  III: {
    description: "Zona III",
    minimumIntercept: -8,
    minimumAltitudeGradient: -7,
    maximumIntercept: 42,
    maximumAltitudeGradient: -0.3,
    minimumEquation: "[3.5.5]",
    maximumEquation: "[3.5.6]",
  },
  IV: {
    description: "Zona IV",
    minimumIntercept: -2,
    minimumAltitudeGradient: -9,
    maximumIntercept: 42,
    maximumAltitudeGradient: -2,
    minimumEquation: "[3.5.7]",
    maximumEquation: "[3.5.8]",
  },
});

export const NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES = freezeDefinitions({
  EXPOSED_REINFORCED_CONCRETE: {
    description: "Strutture in c.a. e c.a.p. esposte",
    magnitude: 15,
  },
  PROTECTED_REINFORCED_CONCRETE: {
    description: "Strutture in c.a. e c.a.p. protette",
    magnitude: 10,
  },
  EXPOSED_STEEL: {
    description: "Strutture in acciaio esposte",
    magnitude: 25,
  },
  PROTECTED_STEEL: {
    description: "Strutture in acciaio protette",
    magnitude: 15,
  },
});

export const NTC2018_THERMAL_EXPANSION_COEFFICIENTS = Object.freeze([
  {
    id: "aluminium",
    description: "Alluminio",
    kind: "fixed",
    value: 24e-6,
  },
  {
    id: "structural-steel",
    description: "Acciaio da carpenteria",
    kind: "fixed",
    value: 12e-6,
  },
  {
    id: "structural-concrete",
    description: "Calcestruzzo strutturale",
    kind: "fixed",
    value: 10e-6,
  },
  {
    id: "steel-concrete-composite",
    description: "Strutture miste acciaio-calcestruzzo",
    kind: "fixed",
    value: 12e-6,
  },
  {
    id: "lightweight-concrete",
    description: "Calcestruzzo alleggerito",
    kind: "fixed",
    value: 7e-6,
  },
  {
    id: "masonry",
    description: "Muratura",
    kind: "range",
    min: 6e-6,
    max: 10e-6,
  },
  {
    id: "timber-parallel-to-grain",
    description: "Legno parallelo alle fibre",
    kind: "fixed",
    value: 5e-6,
  },
  {
    id: "timber-perpendicular-to-grain",
    description: "Legno ortogonale alle fibre",
    kind: "range",
    min: 30e-6,
    max: 70e-6,
  },
].map((entry) => Object.freeze({
  ...entry,
  unit: "1/degC",
  reference: NTC2018_THERMAL_REFERENCES.expansionCoefficients,
})));

const SOLAR_INCREMENTS = Object.freeze({
  REFLECTIVE: Object.freeze({
    NORTH_EAST: 0,
    SOUTH_WEST_OR_HORIZONTAL: 18,
  }),
  LIGHT: Object.freeze({
    NORTH_EAST: 2,
    SOUTH_WEST_OR_HORIZONTAL: 30,
  }),
  DARK: Object.freeze({
    NORTH_EAST: 4,
    SOUTH_WEST_OR_HORIZONTAL: 42,
  }),
});

export const NTC2018_SUMMER_SOLAR_TEMPERATURE_INCREMENTS = SOLAR_INCREMENTS;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }

  return value;
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }

  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function assertTemperatureUnit(temperatureUnit) {
  if (temperatureUnit !== TEMPERATURE_UNIT) {
    throw new Error(`temperatureUnit must be '${TEMPERATURE_UNIT}'.`);
  }

  return temperatureUnit;
}

function externalTemperatureZone(zone) {
  const definition = NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES[zone];
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 external-air temperature zone: ${zone}.`);
  }

  return definition;
}

function simplifiedBuildingDefinition(buildingType) {
  const definition = NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES[buildingType];
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 simplified thermal building type: ${buildingType}.`);
  }

  return definition;
}

function expansionCoefficientDefinition(materialId) {
  const definition = NTC2018_THERMAL_EXPANSION_COEFFICIENTS.find(
    ({ id }) => id === materialId,
  );
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 thermal-expansion material: ${materialId}.`);
  }

  return definition;
}

export function getNTC2018ExternalAirTemperatureZoneDefinition(zone) {
  return clone(externalTemperatureZone(zone));
}

export function getNTC2018SimplifiedBuildingTemperatureChange(buildingType) {
  return clone(simplifiedBuildingDefinition(buildingType));
}

export function getNTC2018ThermalExpansionCoefficientDefinition(materialId) {
  return clone(expansionCoefficientDefinition(materialId));
}

export function resolveNTC2018ThermalExpansionCoefficient({
  materialId,
  value = null,
} = {}) {
  const definition = expansionCoefficientDefinition(materialId);
  if (definition.kind === "fixed") {
    if (value != null) {
      throw new Error(
        `${materialId} has the fixed NTC 2018 thermal-expansion coefficient ${definition.value} 1/degC; omit value.`,
      );
    }

    return {
      ...clone(definition),
      selectedValue: definition.value,
      selection: "tabulated-fixed",
    };
  }

  finitePositive(value, "value");
  if (value < definition.min || value > definition.max) {
    throw new Error(
      `value for ${materialId} must be between ${definition.min} and ${definition.max} 1/degC.`,
    );
  }

  return {
    ...clone(definition),
    selectedValue: value,
    selection: "explicit-within-tabulated-range",
  };
}

export function calculateNTC2018ExternalAirTemperatures({
  zone,
  siteAltitude,
  temperatureUnit = null,
  units = null,
} = {}) {
  assertTemperatureUnit(temperatureUnit);
  const sourceUnits = assertExplicitUnitSystem(
    units,
    "calculateNTC2018ExternalAirTemperatures",
  );
  const resolver = createUnitResolver(sourceUnits, INTERNAL_LENGTH_UNITS);
  const altitude = finiteNonNegative(resolver.length(siteAltitude), "siteAltitude");
  const definition = externalTemperatureZone(zone);
  const altitudeInKilometres = altitude / 1000;
  const minimum = definition.minimumIntercept
    + definition.minimumAltitudeGradient * altitudeInKilometres;
  const maximum = definition.maximumIntercept
    + definition.maximumAltitudeGradient * altitudeInKilometres;

  return {
    zone,
    zoneDescription: definition.description,
    siteAltitude: altitude,
    minimum,
    maximum,
    temperatureUnit: TEMPERATURE_UNIT,
    returnPeriodYears: 50,
    formulas: {
      minimum: "Tmin = minimumIntercept + minimumAltitudeGradient * siteAltitude / 1000",
      maximum: "Tmax = maximumIntercept + maximumAltitudeGradient * siteAltitude / 1000",
    },
    operands: {
      minimumIntercept: definition.minimumIntercept,
      minimumAltitudeGradient: definition.minimumAltitudeGradient,
      maximumIntercept: definition.maximumIntercept,
      maximumAltitudeGradient: definition.maximumAltitudeGradient,
    },
    equations: {
      minimum: definition.minimumEquation,
      maximum: definition.maximumEquation,
    },
    reference: NTC2018_THERMAL_REFERENCES.externalAir,
    metadata: {
      source: "ntc2018-zonal-values",
      sourceUnitSystem: sourceUnits,
      lengthUnitSystem: { ...INTERNAL_LENGTH_UNITS },
    },
  };
}

export function resolveNTC2018InternalAirTemperature({
  value = null,
  source = null,
  temperatureUnit = null,
} = {}) {
  assertTemperatureUnit(temperatureUnit);
  if (value == null) {
    if (source != null) {
      throw new Error("source must be omitted when the NTC 2018 default internal-air temperature is used.");
    }

    return {
      value: DEFAULT_INTERNAL_AIR_TEMPERATURE,
      temperatureUnit: TEMPERATURE_UNIT,
      source: "ntc2018-default",
      sourceReference: null,
      reference: NTC2018_THERMAL_REFERENCES.internalAir,
    };
  }

  return {
    value: finiteNumber(value, "value"),
    temperatureUnit: TEMPERATURE_UNIT,
    source: "documented-explicit-value",
    sourceReference: nonEmptyString(source, "source"),
    reference: NTC2018_THERMAL_REFERENCES.internalAir,
  };
}

export function resolveNTC2018InitialTemperature({
  value = null,
  source = null,
  temperatureUnit = null,
} = {}) {
  assertTemperatureUnit(temperatureUnit);
  if (value == null) {
    if (source != null) {
      throw new Error("source must be omitted when the NTC 2018 default initial temperature is used.");
    }

    return {
      value: DEFAULT_INITIAL_TEMPERATURE,
      temperatureUnit: TEMPERATURE_UNIT,
      source: "ntc2018-default",
      sourceReference: null,
      reference: NTC2018_THERMAL_REFERENCES.elementDistribution,
    };
  }

  return {
    value: finiteNumber(value, "value"),
    temperatureUnit: TEMPERATURE_UNIT,
    source: "documented-explicit-value",
    sourceReference: nonEmptyString(source, "source"),
    reference: NTC2018_THERMAL_REFERENCES.elementDistribution,
  };
}

export function getNTC2018SolarTemperatureIncrement({
  season,
  surfaceNature,
  orientation,
} = {}) {
  if (!["SUMMER", "WINTER"].includes(season)) {
    throw new Error("season must be SUMMER or WINTER.");
  }
  const byOrientation = SOLAR_INCREMENTS[surfaceNature];
  if (!byOrientation) {
    throw new Error(`Unsupported surfaceNature: ${surfaceNature}.`);
  }
  if (!Object.hasOwn(byOrientation, orientation)) {
    throw new Error(`Unsupported orientation: ${orientation}.`);
  }

  return {
    season,
    surfaceNature,
    orientation,
    value: season === "WINTER" ? 0 : byOrientation[orientation],
    temperatureUnit: TEMPERATURE_UNIT,
    reference: NTC2018_THERMAL_REFERENCES.elementDistribution,
  };
}

export function calculateNTC2018MeanElementTemperature({
  externalSurfaceTemperature,
  internalSurfaceTemperature,
  temperatureUnit = null,
} = {}) {
  assertTemperatureUnit(temperatureUnit);
  const external = finiteNumber(
    externalSurfaceTemperature,
    "externalSurfaceTemperature",
  );
  const internal = finiteNumber(
    internalSurfaceTemperature,
    "internalSurfaceTemperature",
  );

  return {
    value: (external + internal) / 2,
    temperatureUnit: TEMPERATURE_UNIT,
    formula: "meanTemperature = (externalSurfaceTemperature + internalSurfaceTemperature) / 2",
    operands: {
      externalSurfaceTemperature: external,
      internalSurfaceTemperature: internal,
    },
    reference: NTC2018_THERMAL_REFERENCES.elementDistribution,
  };
}

export function calculateNTC2018UniformTemperatureChange({
  meanTemperature,
  initialTemperature = DEFAULT_INITIAL_TEMPERATURE,
  temperatureUnit = null,
} = {}) {
  assertTemperatureUnit(temperatureUnit);
  const mean = finiteNumber(meanTemperature, "meanTemperature");
  const initial = finiteNumber(initialTemperature, "initialTemperature");

  return {
    value: mean - initial,
    temperatureUnit: TEMPERATURE_UNIT,
    formula: "uniformTemperatureChange = meanTemperature - initialTemperature",
    operands: {
      meanTemperature: mean,
      initialTemperature: initial,
    },
    reference: NTC2018_THERMAL_REFERENCES.elementDistribution,
  };
}

export function calculateNTC2018FreeThermalStrain({
  thermalExpansionCoefficient,
  temperatureChange,
  temperatureUnit = null,
} = {}) {
  assertTemperatureUnit(temperatureUnit);
  const coefficient = finitePositive(
    thermalExpansionCoefficient,
    "thermalExpansionCoefficient",
  );
  const deltaTemperature = finiteNumber(temperatureChange, "temperatureChange");

  return {
    value: coefficient * deltaTemperature,
    quantity: "strain",
    formula: "freeThermalStrain = thermalExpansionCoefficient * temperatureChange",
    operands: {
      thermalExpansionCoefficient: coefficient,
      temperatureChange: deltaTemperature,
    },
    units: {
      thermalExpansionCoefficient: "1/degC",
      temperature: TEMPERATURE_UNIT,
      strain: "dimensionless",
    },
    reference: NTC2018_THERMAL_REFERENCES.expansionCoefficients,
  };
}

function resolveThermalCases({
  simplifiedBuildingType,
  summerMeanTemperature,
  winterMeanTemperature,
  temperatureStateSource,
  initialTemperature,
  initialTemperatureSource,
}) {
  const hasSimplifiedType = simplifiedBuildingType != null;
  const hasExplicitTemperature = summerMeanTemperature != null
    || winterMeanTemperature != null;
  if (hasSimplifiedType === hasExplicitTemperature) {
    throw new Error(
      "Provide exactly one of simplifiedBuildingType or explicit summerMeanTemperature and winterMeanTemperature.",
    );
  }

  if (hasSimplifiedType) {
    if (
      temperatureStateSource != null
      || initialTemperature != null
      || initialTemperatureSource != null
    ) {
      throw new Error(
        "temperatureStateSource, initialTemperature and initialTemperatureSource must be omitted with simplifiedBuildingType because Table 3.5.II provides temperature changes directly.",
      );
    }
    const definition = simplifiedBuildingDefinition(simplifiedBuildingType);

    return {
      method: "ntc2018-simplified-building-values",
      definition: clone(definition),
      initialTemperature: null,
      cases: [
        {
          id: "summer",
          temperatureChange: definition.magnitude,
        },
        {
          id: "winter",
          temperatureChange: -definition.magnitude,
        },
      ],
      sourceReference: null,
      reference: NTC2018_THERMAL_REFERENCES.simplifiedBuildings,
    };
  }

  if (summerMeanTemperature == null || winterMeanTemperature == null) {
    throw new Error(
      "summerMeanTemperature and winterMeanTemperature must both be provided in explicit-temperature mode.",
    );
  }

  const summer = finiteNumber(summerMeanTemperature, "summerMeanTemperature");
  const winter = finiteNumber(winterMeanTemperature, "winterMeanTemperature");
  if (summer < winter) {
    throw new Error("summerMeanTemperature must not be lower than winterMeanTemperature.");
  }
  const sourceReference = nonEmptyString(
    temperatureStateSource,
    "temperatureStateSource",
  );
  const initial = resolveNTC2018InitialTemperature({
    value: initialTemperature,
    source: initialTemperatureSource,
    temperatureUnit: TEMPERATURE_UNIT,
  });

  return {
    method: "documented-mean-element-temperatures",
    definition: null,
    initialTemperature: initial,
    cases: [
      {
        id: "summer",
        meanTemperature: summer,
        temperatureChange: summer - initial.value,
      },
      {
        id: "winter",
        meanTemperature: winter,
        temperatureChange: winter - initial.value,
      },
    ],
    sourceReference,
    reference: NTC2018_THERMAL_REFERENCES.elementDistribution,
  };
}

export function calculateNTC2018BuildingThermalActions({
  summerActionId = "NTC2018-THERMAL-SUMMER",
  winterActionId = "NTC2018-THERMAL-WINTER",
  simplifiedBuildingType = null,
  summerMeanTemperature = null,
  winterMeanTemperature = null,
  temperatureStateSource = null,
  initialTemperature = null,
  initialTemperatureSource = null,
  temperatureUnit = null,
} = {}) {
  const summerId = nonEmptyString(summerActionId, "summerActionId");
  const winterId = nonEmptyString(winterActionId, "winterActionId");
  if (summerId === winterId) {
    throw new Error("summerActionId and winterActionId must be different.");
  }
  assertTemperatureUnit(temperatureUnit);
  const state = resolveThermalCases({
    simplifiedBuildingType,
    summerMeanTemperature,
    winterMeanTemperature,
    temperatureStateSource,
    initialTemperature,
    initialTemperatureSource,
  });
  const actionIds = {
    summer: summerId,
    winter: winterId,
  };
  const actions = state.cases.map((thermalCase) => createNTC2018ThermalAction({
    id: actionIds[thermalCase.id],
    name: `NTC 2018 thermal action - ${thermalCase.id}`,
    metadata: {
      thermalCase: thermalCase.id,
      temperatureChange: thermalCase.temperatureChange,
      temperatureUnit: TEMPERATURE_UNIT,
      sourceMethod: state.method,
      sourceReference: state.sourceReference,
      reference: state.reference,
    },
  }));

  return new CalculationResult({
    applicationId: "ntc2018-building-thermal-actions",
    status: "ok",
    summary: "Created the NTC 2018 uniform building thermal-action cases.",
    outputs: {
      schemaVersion: "ntc2018-building-thermal-actions/v1",
      temperatureUnit: TEMPERATURE_UNIT,
      method: state.method,
      simplifiedBuildingDefinition: state.definition,
      initialTemperature: state.initialTemperature,
      cases: state.cases,
      actions: actions.map((action) => action.toJSON()),
    },
    warnings: [
      "Only the uniform temperature component is represented; linear and nonlinear temperature gradients are not generated.",
      "Temperature changes are not converted into forces or stresses because restraint and structural stiffness are outside this action contract.",
    ],
    assumptions: state.method === "ntc2018-simplified-building-values"
      ? [
        "The simplified Table 3.5.II values apply because temperature is not fundamental to structural safety or functional efficiency.",
      ]
      : [
        "Summer and winter mean element temperatures are documented caller inputs.",
        ...(state.initialTemperature.source === "ntc2018-default"
          ? ["The initial temperature T0 is 15 degC because no more precise value was supplied."]
          : []),
      ],
    metadata: {
      method: "ntc2018-building-thermal-actions",
      normativePreset: "NTC2018",
      references: { ...NTC2018_THERMAL_REFERENCES },
      temperatureUnit: TEMPERATURE_UNIT,
    },
  });
}
