import {
  AccidentalAction,
  ImposedAction,
  PermanentAction,
  SeismicAction,
  SnowAction,
  ThermalAction,
  TrafficAction,
  VariableAction,
  WindAction,
} from "../../../domain/actions/index.js";
import {
  NTC2018_ACTION_COMBINATION_FACTORS,
  NTC2018_ACTION_PARTIAL_FACTORS,
  NTC2018_DEFAULT_DURATION_CLASS_BY_ACTION,
  NTC2018_LOAD_DURATION_CLASSES,
  NTC2018_TIMBER_KMOD,
} from "./ntc2018ActionParameters.js";

function cloneFactors(source) {
  return JSON.parse(JSON.stringify(source));
}

export function getNTC2018ActionCombinationFactors(category) {
  const entry = NTC2018_ACTION_COMBINATION_FACTORS[category];

  if (!entry) {
    throw new Error(`Unsupported NTC 2018 action category: ${category}.`);
  }

  return { ...entry };
}

export function getNTC2018ActionPartialFactors({
  nature,
  family,
  permanentClass = null,
}) {
  if (nature === "permanent") {
    const entry = NTC2018_ACTION_PARTIAL_FACTORS.permanent[permanentClass];

    if (!entry) {
      throw new Error(`Unsupported NTC 2018 permanent action class: ${permanentClass}.`);
    }

    return cloneFactors(entry);
  }

  const byNature = NTC2018_ACTION_PARTIAL_FACTORS[nature];
  const entry = byNature?.[family];

  if (!entry) {
    throw new Error(`Unsupported NTC 2018 action family '${family}' for nature '${nature}'.`);
  }

  return cloneFactors(entry);
}

export function getNTC2018LoadDurationClass(actionKey) {
  const durationClass = NTC2018_DEFAULT_DURATION_CLASS_BY_ACTION[actionKey];

  if (!durationClass) {
    throw new Error(`Unsupported NTC 2018 action key for load duration: ${actionKey}.`);
  }

  return durationClass;
}

export function getNTC2018LoadDurationDefinition(durationClass) {
  const definition = NTC2018_LOAD_DURATION_CLASSES[durationClass];

  if (!definition) {
    throw new Error(`Unsupported NTC 2018 load duration class: ${durationClass}.`);
  }

  return {
    key: durationClass,
    ...definition,
  };
}

export function resolveNTC2018GoverningLoadDuration(actions = []) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return getNTC2018LoadDurationDefinition("permanent");
  }

  const governingKey = actions.reduce((current, action) => {
    const candidate = action.loadDurationClass ?? "permanent";
    return NTC2018_LOAD_DURATION_CLASSES[candidate].order < NTC2018_LOAD_DURATION_CLASSES[current].order
      ? candidate
      : current;
  }, "permanent");

  return getNTC2018LoadDurationDefinition(governingKey);
}

export function getNTC2018TimberKmod({
  materialType = "solid_timber",
  serviceClass = 1,
  loadDurationClass,
}) {
  const byMaterial = NTC2018_TIMBER_KMOD[materialType];

  if (!byMaterial) {
    throw new Error(`Unsupported timber material type for kmod: ${materialType}.`);
  }

  const byServiceClass = byMaterial[serviceClass];

  if (!byServiceClass) {
    throw new Error(`Unsupported timber service class for kmod: ${serviceClass}.`);
  }

  const value = byServiceClass[loadDurationClass];

  if (value === undefined) {
    throw new Error(`Unsupported timber load duration class for kmod: ${loadDurationClass}.`);
  }

  return value;
}

export function createNTC2018PermanentAction({
  id,
  name = id,
  permanentClass = "G1",
  loadCase = null,
  metadata = {},
}) {
  return new PermanentAction({
    id,
    name,
    permanentClass,
    loadCase,
    combinationFactors: { psi0: 1, psi1: 1, psi2: 1 },
    partialFactors: getNTC2018ActionPartialFactors({
      nature: "permanent",
      permanentClass,
    }),
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
    },
  });
}

export function createNTC2018VariableAction({
  id,
  name = id,
  category,
  family = "imposed",
  loadCase = null,
  loadDurationClass = null,
  metadata = {},
}) {
  const factors = getNTC2018ActionCombinationFactors(category);
  const durationClass = loadDurationClass ?? getNTC2018LoadDurationClass(category);
  const commonProps = {
    id,
    name,
    category,
    loadCase,
    loadDurationClass: durationClass,
    combinationFactors: factors,
    partialFactors: getNTC2018ActionPartialFactors({
      nature: "variable",
      family,
    }),
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
      categoryDescription: factors.description,
    },
  };

  if (family === "traffic") {
    return new TrafficAction(commonProps);
  }

  if (family === "wind") {
    return new WindAction(commonProps);
  }

  if (family === "snow") {
    return new SnowAction(commonProps);
  }

  if (family === "thermal") {
    return new ThermalAction(commonProps);
  }

  if (family === "imposed") {
    return new ImposedAction(commonProps);
  }

  return new VariableAction({
    ...commonProps,
    family,
  });
}

export function createNTC2018SnowAction({
  id,
  name = id,
  highAltitude = false,
  ...rest
}) {
  return createNTC2018VariableAction({
    id,
    name,
    category: highAltitude ? "SNOW_HIGH" : "SNOW_LOW",
    family: "snow",
    ...rest,
  });
}

export function createNTC2018WindAction({
  id,
  name = id,
  ...rest
}) {
  return createNTC2018VariableAction({
    id,
    name,
    category: "WIND",
    family: "wind",
    ...rest,
  });
}

export function createNTC2018ThermalAction({
  id,
  name = id,
  ...rest
}) {
  return createNTC2018VariableAction({
    id,
    name,
    category: "THERMAL",
    family: "thermal",
    ...rest,
  });
}

export function createNTC2018AccidentalAction({
  id,
  name = id,
  loadCase = null,
  metadata = {},
}) {
  return new AccidentalAction({
    id,
    name,
    loadCase,
    combinationFactors: getNTC2018ActionCombinationFactors("ACCIDENTAL"),
    partialFactors: getNTC2018ActionPartialFactors({
      nature: "accidental",
      family: "accidental",
    }),
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
    },
  });
}

export function createNTC2018SeismicAction({
  id,
  name = id,
  loadCase = null,
  metadata = {},
}) {
  return new SeismicAction({
    id,
    name,
    loadCase,
    combinationFactors: getNTC2018ActionCombinationFactors("SEISMIC"),
    partialFactors: getNTC2018ActionPartialFactors({
      nature: "seismic",
      family: "seismic",
    }),
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
    },
  });
}
