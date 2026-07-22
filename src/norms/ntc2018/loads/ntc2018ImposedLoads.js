import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../../domain/units/UnitSystem.js";
import { NTC2018_ACTION_COMBINATION_FACTORS } from "../actions/ntc2018ActionParameters.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });
const LOAD_SYMBOLS = Object.freeze(["qk", "Qk", "Hk"]);
const AREA_REDUCTION_CATEGORIES = new Set(["A", "B", "C", "D", "H", "I"]);
const MULTI_STOREY_REDUCTION_CATEGORIES = new Set(["A", "B", "C", "D"]);

export const NTC2018_IMPOSED_LOAD_REFERENCES = Object.freeze({
  characteristicLoads: "D.M. 17/01/2018, NTC 2018, section 3.1.4, Table 3.1.II",
  areaReduction: "D.M. 17/01/2018, NTC 2018, section 3.1.4.1, equation 3.1.1",
  multiStoreyReduction:
    "D.M. 17/01/2018, NTC 2018, section 3.1.4.1, equation 3.1.2",
  concentratedApplication: "D.M. 17/01/2018, NTC 2018, section 3.1.4.2",
  horizontalApplication: "D.M. 17/01/2018, NTC 2018, section 3.1.4.3",
  combinationFactors: "D.M. 17/01/2018, NTC 2018, section 2.5.2, Table 2.5.I",
});

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }

  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixed(value, unit, extra = {}) {
  return { mode: "fixed", value, unit, ...extra };
}

function minimum(minimumValue, unit, extra = {}) {
  return { mode: "minimum", minimum: minimumValue, unit, ...extra };
}

function caseByCase(unit, extra = {}) {
  return { mode: "case-by-case", unit, ...extra };
}

function inherited(unit, extra = {}) {
  return { mode: "served-category", unit, ...extra };
}

const DEFAULT_CONCENTRATED_APPLICATION = Object.freeze({
  verification: "local-distinct",
  simultaneousWithGlobalDistributedLoad: false,
  count: 1,
  footprint: { shape: "square", sideM: 0.05 },
});

const VEHICLE_HORIZONTAL_LIMITATION =
  "Hk applies only to parapets or partitions in pedestrian zones; vehicle actions on barriers require case-by-case evaluation.";

function completeDefinition(definition) {
  const concentrated = definition.application?.Qk ?? {};

  return {
    ...definition,
    application: {
      qk: {
        verification: "global-or-effective-distribution",
        ...definition.application?.qk,
      },
      Qk: {
        ...DEFAULT_CONCENTRATED_APPLICATION,
        ...concentrated,
        footprint: {
          ...DEFAULT_CONCENTRATED_APPLICATION.footprint,
          ...concentrated.footprint,
        },
      },
      Hk: {
        verification: "local-distinct",
        simultaneousWithGlobalLoads: false,
        wallApplicationElevationM: 1.2,
        parapetApplication: "top-edge",
        ...definition.application?.Hk,
      },
    },
    reference: NTC2018_IMPOSED_LOAD_REFERENCES.characteristicLoads,
  };
}

export const NTC2018_IMPOSED_LOAD_CATALOG = deepFreeze([
  completeDefinition({
    id: "A-residential",
    legacySlabActionId: 1,
    category: "A",
    subcategory: "A",
    description: "Aree per attivita domestiche e residenziali",
    loads: {
      qk: fixed(2, "kN/m^2"),
      Qk: fixed(2, "kN"),
      Hk: fixed(1, "kN/m"),
    },
  }),
  completeDefinition({
    id: "A-stairs-balconies",
    legacySlabActionId: 2,
    category: "A",
    subcategory: "A",
    description: "Scale comuni, balconi e ballatoi di ambienti residenziali",
    loads: {
      qk: fixed(4, "kN/m^2"),
      Qk: fixed(4, "kN"),
      Hk: fixed(2, "kN/m"),
    },
  }),
  completeDefinition({
    id: "B1-private-offices",
    legacySlabActionId: 3,
    category: "B",
    subcategory: "B1",
    description: "Uffici non aperti al pubblico",
    loads: {
      qk: fixed(2, "kN/m^2"),
      Qk: fixed(2, "kN"),
      Hk: fixed(1, "kN/m"),
    },
  }),
  completeDefinition({
    id: "B2-public-offices",
    legacySlabActionId: 4,
    category: "B",
    subcategory: "B2",
    description: "Uffici aperti al pubblico",
    loads: {
      qk: fixed(3, "kN/m^2"),
      Qk: fixed(2, "kN"),
      Hk: fixed(1, "kN/m"),
    },
  }),
  completeDefinition({
    id: "B-stairs-balconies",
    legacySlabActionId: 5,
    category: "B",
    subcategory: "B",
    description: "Scale comuni, balconi e ballatoi di uffici",
    loads: {
      qk: fixed(4, "kN/m^2"),
      Qk: fixed(4, "kN"),
      Hk: fixed(2, "kN/m"),
    },
  }),
  completeDefinition({
    id: "C1-table-areas",
    legacySlabActionId: 6,
    category: "C",
    subcategory: "C1",
    description: "Aree con tavoli",
    loads: {
      qk: fixed(3, "kN/m^2"),
      Qk: fixed(3, "kN"),
      Hk: fixed(1, "kN/m"),
    },
  }),
  completeDefinition({
    id: "C2-fixed-seats",
    legacySlabActionId: 7,
    category: "C",
    subcategory: "C2",
    description: "Aree con posti a sedere fissi",
    loads: {
      qk: fixed(4, "kN/m^2"),
      Qk: fixed(4, "kN"),
      Hk: fixed(2, "kN/m"),
    },
  }),
  completeDefinition({
    id: "C3-unobstructed-areas",
    legacySlabActionId: 8,
    category: "C",
    subcategory: "C3",
    description: "Ambienti privi di ostacoli al movimento delle persone",
    loads: {
      qk: fixed(5, "kN/m^2"),
      Qk: fixed(5, "kN"),
      Hk: fixed(3, "kN/m"),
    },
  }),
  completeDefinition({
    id: "C4-physical-activities",
    legacySlabActionId: 9,
    category: "C",
    subcategory: "C4",
    description: "Aree con possibile svolgimento di attivita fisiche",
    loads: {
      qk: fixed(5, "kN/m^2"),
      Qk: fixed(5, "kN"),
      Hk: fixed(3, "kN/m"),
    },
  }),
  completeDefinition({
    id: "C5-large-crowds",
    legacySlabActionId: 10,
    category: "C",
    subcategory: "C5",
    description: "Aree suscettibili di grandi affollamenti",
    loads: {
      qk: fixed(5, "kN/m^2"),
      Qk: fixed(5, "kN"),
      Hk: fixed(3, "kN/m"),
    },
  }),
  completeDefinition({
    id: "C-stairs-balconies",
    legacySlabActionId: 11,
    category: "C",
    subcategory: "C",
    description: "Scale comuni, balconi e ballatoi di ambienti di categoria C",
    servedCategoryIds: [
      "C1-table-areas",
      "C2-fixed-seats",
      "C3-unobstructed-areas",
      "C4-physical-activities",
      "C5-large-crowds",
    ],
    loads: {
      qk: inherited("kN/m^2", { minimum: 4 }),
      Qk: inherited("kN", { minimum: 4 }),
      Hk: inherited("kN/m", { minimum: 2 }),
    },
  }),
  completeDefinition({
    id: "D1-shops",
    legacySlabActionId: 12,
    category: "D",
    subcategory: "D1",
    description: "Negozi",
    loads: {
      qk: fixed(4, "kN/m^2"),
      Qk: fixed(4, "kN"),
      Hk: fixed(2, "kN/m"),
    },
  }),
  completeDefinition({
    id: "D2-shopping-centres",
    legacySlabActionId: 13,
    category: "D",
    subcategory: "D2",
    description: "Centri commerciali, mercati e grandi magazzini",
    loads: {
      qk: fixed(5, "kN/m^2"),
      Qk: fixed(5, "kN"),
      Hk: fixed(2, "kN/m"),
    },
  }),
  completeDefinition({
    id: "D-stairs-balconies",
    category: "D",
    subcategory: "D",
    description: "Scale comuni, balconi e ballatoi di ambienti commerciali",
    servedCategoryIds: ["D1-shops", "D2-shopping-centres"],
    loads: {
      qk: inherited("kN/m^2"),
      Qk: inherited("kN"),
      Hk: inherited("kN/m"),
    },
  }),
  completeDefinition({
    id: "E1-storage",
    legacySlabActionId: 14,
    category: "E",
    subcategory: "E1",
    description: "Aree per accumulo di merci e relative aree di accesso",
    loads: {
      qk: minimum(6, "kN/m^2"),
      Qk: fixed(7, "kN"),
      Hk: fixed(1, "kN/m"),
    },
    notes: [
      "Hk does not include horizontal actions exerted by stored materials.",
    ],
  }),
  completeDefinition({
    id: "E2-industrial",
    legacySlabActionId: 15,
    category: "E",
    subcategory: "E2",
    description: "Ambienti ad uso industriale",
    loads: {
      qk: caseByCase("kN/m^2"),
      Qk: caseByCase("kN"),
      Hk: caseByCase("kN/m"),
    },
  }),
  completeDefinition({
    id: "F-light-vehicles",
    legacySlabActionId: 16,
    category: "F",
    subcategory: "F",
    description: "Traffico e parcheggio di veicoli con peso a pieno carico fino a 30 kN",
    loads: {
      qk: fixed(2.5, "kN/m^2"),
      Qk: fixed(10, "kN", { count: 2 }),
      Hk: fixed(1, "kN/m"),
    },
    application: {
      Qk: {
        count: 2,
        footprint: { shape: "square", sideM: 0.1 },
        centreSpacingM: 1.8,
      },
      Hk: { limitation: VEHICLE_HORIZONTAL_LIMITATION },
    },
  }),
  completeDefinition({
    id: "G-medium-vehicles",
    legacySlabActionId: 17,
    category: "G",
    subcategory: "G",
    description: "Traffico e parcheggio di veicoli con peso a pieno carico fra 30 kN e 160 kN",
    loads: {
      qk: minimum(5, "kN/m^2"),
      Qk: minimum(50, "kN", { count: 2 }),
      Hk: minimum(1, "kN/m"),
    },
    application: {
      Qk: {
        count: 2,
        footprint: { shape: "square", sideM: 0.2 },
        centreSpacingM: 1.8,
      },
      Hk: { limitation: VEHICLE_HORIZONTAL_LIMITATION },
    },
  }),
  completeDefinition({
    id: "H-maintenance-roofs",
    legacySlabActionId: 18,
    category: "H",
    subcategory: "H",
    description: "Coperture accessibili per sola manutenzione e riparazione",
    loads: {
      qk: fixed(0.5, "kN/m^2"),
      Qk: fixed(1.2, "kN"),
      Hk: fixed(1, "kN/m"),
    },
  }),
  completeDefinition({
    id: "I-occupied-roofs",
    category: "I",
    subcategory: "I",
    description: "Coperture praticabili di ambienti appartenenti alle categorie A-D",
    servedCategoryIds: [
      "A-residential",
      "A-stairs-balconies",
      "B1-private-offices",
      "B2-public-offices",
      "B-stairs-balconies",
      "C1-table-areas",
      "C2-fixed-seats",
      "C3-unobstructed-areas",
      "C4-physical-activities",
      "C5-large-crowds",
      "D1-shops",
      "D2-shopping-centres",
    ],
    loads: {
      qk: inherited("kN/m^2"),
      Qk: inherited("kN"),
      Hk: inherited("kN/m"),
    },
    combinationFactorsMode: "case-by-case",
  }),
  completeDefinition({
    id: "K-special-roofs",
    category: "K",
    subcategory: "K",
    description: "Coperture per usi speciali, inclusi impianti ed eliporti",
    loads: {
      qk: caseByCase("kN/m^2"),
      Qk: caseByCase("kN"),
      Hk: caseByCase("kN/m"),
    },
    combinationFactorsMode: "case-by-case",
  }),
]);

function definitionById(definitionId) {
  const definition = NTC2018_IMPOSED_LOAD_CATALOG.find(({ id }) => id === definitionId);

  if (!definition) {
    throw new Error(`Unsupported NTC 2018 imposed-load definition: ${definitionId}.`);
  }

  return definition;
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }

  return value;
}

function requireDocumentation(documentation) {
  if (
    documentation == null ||
    typeof documentation !== "object" ||
    typeof documentation.reference !== "string" ||
    documentation.reference.trim() === ""
  ) {
    throw new Error(
      "documented or case-by-case imposed loads require documentation.reference.",
    );
  }
}

function convertDocumentedValue(symbol, value, resolver) {
  switch (symbol) {
    case "qk":
      return resolver.areaLoad(value);
    case "Qk":
      return resolver.force(value);
    case "Hk":
      return resolver.lineLoad(value);
    default:
      throw new Error(`Unsupported imposed-load symbol: ${symbol}.`);
  }
}

function resolveDirectLoad({ symbol, specification, documentedValue, resolver }) {
  const hasDocumentedValue = documentedValue != null;
  const converted = hasDocumentedValue
    ? finiteNonNegative(
      convertDocumentedValue(symbol, documentedValue, resolver),
      `documentedValues.${symbol}`,
    )
    : null;

  if (specification.mode === "fixed") {
    if (converted != null && converted < specification.value) {
      throw new Error(
        `documentedValues.${symbol} must not be lower than the tabulated value ${specification.value} ${specification.unit}.`,
      );
    }

    return {
      value: converted ?? specification.value,
      selection: converted == null ? "tabulated" : "documented-not-lower-than-tabulated",
    };
  }

  if (specification.mode === "minimum") {
    if (converted == null) {
      throw new Error(
        `${symbol} for this definition must be documented and not lower than ${specification.minimum} ${specification.unit}.`,
      );
    }
    if (converted < specification.minimum) {
      throw new Error(
        `documentedValues.${symbol} must not be lower than ${specification.minimum} ${specification.unit}.`,
      );
    }

    return { value: converted, selection: "documented-not-lower-than-minimum" };
  }

  if (specification.mode === "case-by-case") {
    if (converted == null) {
      throw new Error(`${symbol} for this definition must be documented case by case.`);
    }

    return { value: converted, selection: "documented-case-by-case" };
  }

  throw new Error(`Unsupported direct imposed-load mode: ${specification.mode}.`);
}

function validateCombinationFactors(combinationFactors) {
  if (combinationFactors == null || typeof combinationFactors !== "object") {
    throw new Error("Category K requires documentedCombinationFactors.");
  }

  const normalized = {};
  for (const key of ["psi0", "psi1", "psi2"]) {
    const value = combinationFactors[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`documentedCombinationFactors.${key} must be between 0 and 1.`);
    }
    normalized[key] = value;
  }

  return normalized;
}

function resolveCombinationFactors({ definition, inheritedDefinition, documentedCombinationFactors }) {
  if (definition.combinationFactorsMode === "case-by-case") {
    return validateCombinationFactors(documentedCombinationFactors);
  }

  const combinationCategory = inheritedDefinition?.category ?? definition.category;
  const factors = NTC2018_ACTION_COMBINATION_FACTORS[combinationCategory];

  if (!factors) {
    throw new Error(
      `No automatic NTC 2018 combination factors are available for category ${combinationCategory}.`,
    );
  }

  return {
    psi0: factors.psi0,
    psi1: factors.psi1,
    psi2: factors.psi2,
  };
}

function resolveInheritedLoads({ definition, servedDefinitionId, documentedValues, resolver }) {
  if (!definition.servedCategoryIds?.includes(servedDefinitionId)) {
    throw new Error(
      `${definition.id} requires servedDefinitionId among: ${definition.servedCategoryIds.join(", ")}.`,
    );
  }

  const servedDefinition = definitionById(servedDefinitionId);
  const resolvedLoads = {};
  const resolution = {};

  for (const symbol of LOAD_SYMBOLS) {
    const inheritedSpecification = definition.loads[symbol];
    const servedSpecification = servedDefinition.loads[symbol];
    if (servedSpecification.mode !== "fixed") {
      throw new Error(`${servedDefinitionId}.${symbol} is not a directly inheritable tabulated value.`);
    }

    const inheritedMinimum = inheritedSpecification.minimum ?? 0;
    const baseValue = Math.max(servedSpecification.value, inheritedMinimum);
    const documentedValue = documentedValues[symbol];
    const converted = documentedValue == null
      ? null
      : finiteNonNegative(
        convertDocumentedValue(symbol, documentedValue, resolver),
        `documentedValues.${symbol}`,
      );
    if (converted != null && converted < baseValue) {
      throw new Error(
        `documentedValues.${symbol} must not be lower than the inherited value ${baseValue} ${inheritedSpecification.unit}.`,
      );
    }

    resolvedLoads[symbol] = converted ?? baseValue;
    resolution[symbol] = {
      selection: converted == null ? "served-category" : "documented-not-lower-than-served-category",
      sourceDefinitionId: servedDefinitionId,
      inheritedValue: servedSpecification.value,
      appliedMinimum: inheritedSpecification.minimum ?? null,
    };
  }

  return { servedDefinition, resolvedLoads, resolution };
}

export function listNTC2018ImposedLoadDefinitions({ category = null } = {}) {
  const definitions = category == null
    ? NTC2018_IMPOSED_LOAD_CATALOG
    : NTC2018_IMPOSED_LOAD_CATALOG.filter((entry) => entry.category === category);

  return definitions.map(clone);
}

export function getNTC2018ImposedLoadDefinition(definitionId) {
  return clone(definitionById(definitionId));
}

export function resolveNTC2018ImposedLoadDefinition({
  definitionId,
  servedDefinitionId = null,
  documentedValues = {},
  documentedCombinationFactors = null,
  documentation = null,
  units = null,
} = {}) {
  const sourceUnits = assertExplicitUnitSystem(units, "resolveNTC2018ImposedLoadDefinition");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const definition = definitionById(definitionId);
  const hasDocumentedValues = LOAD_SYMBOLS.some((symbol) => documentedValues[symbol] != null);
  const requiresDocumentation = Object.values(definition.loads)
    .some(({ mode }) => mode === "minimum" || mode === "case-by-case");

  if (requiresDocumentation || hasDocumentedValues || documentedCombinationFactors != null) {
    requireDocumentation(documentation);
  }

  let inheritedDefinition = null;
  let values;
  let resolution;
  if (Object.values(definition.loads).some(({ mode }) => mode === "served-category")) {
    const inherited = resolveInheritedLoads({
      definition,
      servedDefinitionId,
      documentedValues,
      resolver,
    });
    inheritedDefinition = inherited.servedDefinition;
    values = inherited.resolvedLoads;
    resolution = inherited.resolution;
  } else {
    values = {};
    resolution = {};
    for (const symbol of LOAD_SYMBOLS) {
      const item = resolveDirectLoad({
        symbol,
        specification: definition.loads[symbol],
        documentedValue: documentedValues[symbol],
        resolver,
      });
      values[symbol] = item.value;
      resolution[symbol] = { selection: item.selection };
    }
  }

  return {
    schemaVersion: "ntc2018-imposed-load-definition/v1",
    status: "ok",
    definitionId: definition.id,
    category: definition.category,
    subcategory: definition.subcategory,
    description: definition.description,
    qk: values.qk,
    Qk: values.Qk,
    Hk: values.Hk,
    units: { ...INTERNAL_UNITS },
    loads: clone(definition.loads),
    application: clone(definition.application),
    combinationFactors: resolveCombinationFactors({
      definition,
      inheritedDefinition,
      documentedCombinationFactors,
    }),
    resolution,
    documentation: documentation == null ? null : clone(documentation),
    notes: [...(definition.notes ?? [])],
    metadata: {
      normativePreset: "NTC2018",
      references: { ...NTC2018_IMPOSED_LOAD_REFERENCES },
      unitSystem: { ...INTERNAL_UNITS },
      sourceUnitSystem: sourceUnits,
      servedDefinitionId: inheritedDefinition?.id ?? null,
    },
  };
}

function combinationFactorForReduction({ category, psi0, documentation }) {
  if (category === "I") {
    if (!Number.isFinite(psi0) || psi0 < 0 || psi0 > 1) {
      throw new Error("Category I area reduction requires a documented psi0 between 0 and 1.");
    }
    requireDocumentation(documentation);
    return psi0;
  }

  if (psi0 != null) {
    throw new Error("psi0 is derived from NTC 2018 Table 2.5.I; omit the explicit value.");
  }

  return NTC2018_ACTION_COMBINATION_FACTORS[category].psi0;
}

export function calculateNTC2018ImposedLoadAreaReduction({
  category,
  influenceArea,
  psi0 = null,
  documentation = null,
  units = null,
} = {}) {
  if (!AREA_REDUCTION_CATEGORIES.has(category)) {
    throw new Error("Area reduction is only applicable to NTC 2018 categories A, B, C, D, H and I.");
  }

  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018ImposedLoadAreaReduction");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const area = resolver.area(influenceArea);
  if (!Number.isFinite(area) || area <= 0) {
    throw new Error("influenceArea must be a finite positive area.");
  }

  const resolvedPsi0 = combinationFactorForReduction({ category, psi0, documentation });
  const rawFactor = (5 / 7) * resolvedPsi0 + 10 / area;
  const categoryMinimum = ["C", "D"].includes(category) ? 0.6 : null;
  const alphaA = Math.max(categoryMinimum ?? 0, Math.min(1, rawFactor));

  return {
    status: "ok",
    alphaA,
    category,
    influenceArea: area,
    psi0: resolvedPsi0,
    formula: "alphaA = min(1, 5/7 * psi0 + 10/A), with alphaA >= 0.6 for C and D",
    categoryMinimum,
    units: { ...INTERNAL_UNITS },
    cannotCombineWith: "alphaN",
    reference: NTC2018_IMPOSED_LOAD_REFERENCES.areaReduction,
    documentation: documentation == null ? null : clone(documentation),
    metadata: {
      sourceUnitSystem: sourceUnits,
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

export function calculateNTC2018ImposedLoadMultiStoreyReduction({
  category,
  loadedStoreys,
} = {}) {
  if (!MULTI_STOREY_REDUCTION_CATEGORIES.has(category)) {
    throw new Error("Multi-storey reduction is only applicable to NTC 2018 categories A, B, C and D.");
  }
  if (!Number.isInteger(loadedStoreys) || loadedStoreys <= 2) {
    throw new Error("loadedStoreys must be an integer greater than 2.");
  }

  const psi0 = NTC2018_ACTION_COMBINATION_FACTORS[category].psi0;
  const alphaN = (2 + (loadedStoreys - 2) * psi0) / loadedStoreys;

  return {
    status: "ok",
    alphaN,
    category,
    loadedStoreys,
    psi0,
    formula: "alphaN = (2 + (n - 2) * psi0) / n",
    cannotCombineWith: "alphaA",
    reference: NTC2018_IMPOSED_LOAD_REFERENCES.multiStoreyReduction,
  };
}
