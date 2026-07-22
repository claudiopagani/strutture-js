import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { AreaLoad } from "../../../domain/loads/AreaLoad.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../../domain/units/UnitSystem.js";
import { createNTC2018PermanentAction } from "../actions/createNTC2018Action.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });
const PERMANENT_CLASSES = new Set(["G1", "G2"]);
const EFFECTS = new Set(["favourable", "unfavourable"]);

export const NTC2018_PERMANENT_LOAD_REFERENCES = Object.freeze({
  unitWeights: "D.M. 17/01/2018, NTC 2018, section 3.1.2, Table 3.1.I",
  equivalentPartitions: "D.M. 17/01/2018, NTC 2018, section 3.1.3",
  partialFactors: "D.M. 17/01/2018, NTC 2018, section 2.6.1, Table 2.6.I",
});

function freezeCatalog(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

export const NTC2018_UNIT_WEIGHT_CATALOG = freezeCatalog([
  {
    id: "plain-concrete",
    category: "concrete",
    description: "Calcestruzzo ordinario non armato",
    kind: "fixed",
    value: 24,
  },
  {
    id: "reinforced-or-prestressed-concrete",
    category: "concrete",
    description: "Calcestruzzo armato e precompresso",
    kind: "fixed",
    value: 25,
  },
  {
    id: "lightweight-concrete",
    category: "concrete",
    description: "Calcestruzzo leggero",
    kind: "range",
    min: 14,
    max: 20,
  },
  {
    id: "heavyweight-concrete",
    category: "concrete",
    description: "Calcestruzzo pesante",
    kind: "range",
    min: 28,
    max: 50,
  },
  {
    id: "lime-mortar",
    category: "mortars-and-bulk-materials",
    description: "Malta di calce",
    kind: "fixed",
    value: 18,
  },
  {
    id: "cement-mortar",
    category: "mortars-and-bulk-materials",
    description: "Malta di cemento",
    kind: "fixed",
    value: 21,
  },
  {
    id: "powdered-lime",
    category: "mortars-and-bulk-materials",
    description: "Calce in polvere",
    kind: "fixed",
    value: 10,
  },
  {
    id: "powdered-cement",
    category: "mortars-and-bulk-materials",
    description: "Cemento in polvere",
    kind: "fixed",
    value: 14,
  },
  {
    id: "sand",
    category: "mortars-and-bulk-materials",
    description: "Sabbia",
    kind: "fixed",
    value: 17,
  },
  {
    id: "steel",
    category: "metals",
    description: "Acciaio",
    kind: "fixed",
    value: 78.5,
  },
  {
    id: "cast-iron",
    category: "metals",
    description: "Ghisa",
    kind: "fixed",
    value: 72.5,
  },
  {
    id: "aluminium",
    category: "metals",
    description: "Alluminio",
    kind: "fixed",
    value: 27,
  },
  {
    id: "volcanic-tuff",
    category: "natural-stone",
    description: "Tufo vulcanico",
    kind: "fixed",
    value: 17,
  },
  {
    id: "compact-limestone",
    category: "natural-stone",
    description: "Calcare compatto",
    kind: "fixed",
    value: 26,
  },
  {
    id: "soft-limestone",
    category: "natural-stone",
    description: "Calcare tenero",
    kind: "fixed",
    value: 22,
  },
  {
    id: "gypsum",
    category: "natural-stone",
    description: "Gesso",
    kind: "fixed",
    value: 13,
  },
  {
    id: "granite",
    category: "natural-stone",
    description: "Granito",
    kind: "fixed",
    value: 27,
  },
  {
    id: "solid-brick",
    category: "masonry",
    description: "Mattoni pieni",
    kind: "fixed",
    value: 18,
  },
  {
    id: "softwood-or-poplar",
    category: "timber",
    description: "Legname di conifera e pioppo",
    kind: "range",
    min: 4,
    max: 6,
  },
  {
    id: "hardwood-excluding-poplar",
    category: "timber",
    description: "Legname di latifoglia, escluso il pioppo",
    kind: "range",
    min: 6,
    max: 8,
  },
  {
    id: "fresh-water",
    category: "liquids-and-other",
    description: "Acqua dolce",
    kind: "fixed",
    value: 9.81,
  },
  {
    id: "sea-water",
    category: "liquids-and-other",
    description: "Acqua di mare",
    kind: "fixed",
    value: 10.1,
  },
  {
    id: "paper",
    category: "liquids-and-other",
    description: "Carta",
    kind: "fixed",
    value: 10,
  },
  {
    id: "glass",
    category: "liquids-and-other",
    description: "Vetro",
    kind: "fixed",
    value: 25,
  },
].map((entry) => ({
  ...entry,
  unit: "kN/m^3",
  reference: NTC2018_PERMANENT_LOAD_REFERENCES.unitWeights,
})));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function unitWeightDefinition(materialId) {
  const definition = NTC2018_UNIT_WEIGHT_CATALOG.find(({ id }) => id === materialId);

  if (!definition) {
    throw new Error(`Unsupported NTC 2018 unit-weight material: ${materialId}.`);
  }

  return definition;
}

export function listNTC2018UnitWeightDefinitions({ category = null } = {}) {
  const definitions = category == null
    ? NTC2018_UNIT_WEIGHT_CATALOG
    : NTC2018_UNIT_WEIGHT_CATALOG.filter((entry) => entry.category === category);

  return definitions.map(clone);
}

export function getNTC2018UnitWeightDefinition(materialId) {
  return clone(unitWeightDefinition(materialId));
}

export function resolveNTC2018UnitWeight({ materialId, value = null } = {}) {
  const definition = unitWeightDefinition(materialId);

  if (definition.kind === "fixed") {
    if (value != null) {
      throw new Error(
        `${materialId} has the fixed NTC 2018 unit weight ${definition.value} kN/m^3; omit value.`,
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
      `value for ${materialId} must be between ${definition.min} and ${definition.max} kN/m^3.`,
    );
  }

  return {
    ...clone(definition),
    selectedValue: value,
    selection: "explicit-within-tabulated-range",
  };
}

function normalizedCalculation({ units, model, operands, formula, value, reference }) {
  return {
    model,
    operands,
    formula,
    value,
    quantity: model === "solid-volume" ? "force" : "area-load",
    units: { ...INTERNAL_UNITS },
    reference,
    metadata: {
      sourceUnitSystem: { ...units },
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

export function calculateNTC2018AreaSelfWeight({
  unitWeight,
  thickness,
  units = null,
} = {}) {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018AreaSelfWeight");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedUnitWeight = finiteNonNegative(
    resolver.volumeLoad(unitWeight),
    "unitWeight",
  );
  const normalizedThickness = finiteNonNegative(
    resolver.length(thickness),
    "thickness",
  );

  return normalizedCalculation({
    units: sourceUnits,
    model: "layer",
    operands: {
      unitWeight: normalizedUnitWeight,
      thickness: normalizedThickness,
    },
    formula: "areaLoad = unitWeight * thickness",
    value: normalizedUnitWeight * normalizedThickness,
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.unitWeights,
  });
}

export function calculateNTC2018LineSelfWeight({
  unitWeight,
  crossSectionArea,
  units = null,
} = {}) {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018LineSelfWeight");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedUnitWeight = finiteNonNegative(
    resolver.volumeLoad(unitWeight),
    "unitWeight",
  );
  const normalizedArea = finiteNonNegative(
    resolver.area(crossSectionArea),
    "crossSectionArea",
  );

  return {
    model: "prismatic-line",
    operands: {
      unitWeight: normalizedUnitWeight,
      crossSectionArea: normalizedArea,
    },
    formula: "lineLoad = unitWeight * crossSectionArea",
    value: normalizedUnitWeight * normalizedArea,
    quantity: "line-load",
    units: { ...INTERNAL_UNITS },
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.unitWeights,
    metadata: {
      sourceUnitSystem: sourceUnits,
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

export function calculateNTC2018SelfWeight({
  unitWeight,
  volume,
  units = null,
} = {}) {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018SelfWeight");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedUnitWeight = finiteNonNegative(
    resolver.volumeLoad(unitWeight),
    "unitWeight",
  );
  const normalizedVolume = finiteNonNegative(resolver.volume(volume), "volume");

  return normalizedCalculation({
    units: sourceUnits,
    model: "solid-volume",
    operands: {
      unitWeight: normalizedUnitWeight,
      volume: normalizedVolume,
    },
    formula: "selfWeight = unitWeight * volume",
    value: normalizedUnitWeight * normalizedVolume,
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.unitWeights,
  });
}

export function calculateNTC2018EquivalentPartitionAreaLoad({
  partitionLineLoad,
  units = null,
} = {}) {
  const sourceUnits = assertExplicitUnitSystem(
    units,
    "calculateNTC2018EquivalentPartitionAreaLoad",
  );
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedLineLoad = finitePositive(
    resolver.lineLoad(partitionLineLoad),
    "partitionLineLoad",
  );
  const steps = [
    { maximumLineLoad: 1, areaLoad: 0.4 },
    { maximumLineLoad: 2, areaLoad: 0.8 },
    { maximumLineLoad: 3, areaLoad: 1.2 },
    { maximumLineLoad: 4, areaLoad: 1.6 },
    { maximumLineLoad: 5, areaLoad: 2.0 },
  ];
  const selected = steps.find(({ maximumLineLoad }) => normalizedLineLoad <= maximumLineLoad);

  return {
    partitionLineLoad: normalizedLineLoad,
    equivalentUniformLoadApplicable: selected != null,
    areaLoad: selected?.areaLoad ?? null,
    requiresActualPositioning: selected == null,
    units: { ...INTERNAL_UNITS },
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.equivalentPartitions,
    metadata: {
      sourceUnitSystem: sourceUnits,
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

function normalizePermanentAreaItem(item, resolver) {
  if (item == null || typeof item !== "object") {
    throw new Error("Each permanent-load item must be an object.");
  }

  if (typeof item.id !== "string" || item.id.trim() === "") {
    throw new Error("Each permanent-load item requires a stable non-empty string id.");
  }

  if (!PERMANENT_CLASSES.has(item.permanentClass)) {
    throw new Error(`${item.id}.permanentClass must be G1 or G2.`);
  }

  const effect = item.effect ?? "unfavourable";
  if (!EFFECTS.has(effect)) {
    throw new Error(`${item.id}.effect must be favourable or unfavourable.`);
  }

  let operands;
  let value;
  let formula;

  switch (item.model) {
    case "layer": {
      operands = {
        unitWeight: finiteNonNegative(resolver.volumeLoad(item.unitWeight), `${item.id}.unitWeight`),
        thickness: finiteNonNegative(resolver.length(item.thickness), `${item.id}.thickness`),
      };
      formula = "areaLoad = unitWeight * thickness";
      value = operands.unitWeight * operands.thickness;
      break;
    }
    case "surface": {
      operands = {
        areaLoad: finiteNonNegative(resolver.areaLoad(item.areaLoad), `${item.id}.areaLoad`),
      };
      formula = "areaLoad = assignedAreaLoad";
      value = operands.areaLoad;
      break;
    }
    case "repeated-line": {
      operands = {
        lineLoad: finiteNonNegative(resolver.lineLoad(item.lineLoad), `${item.id}.lineLoad`),
        spacing: finitePositive(resolver.length(item.spacing), `${item.id}.spacing`),
      };
      formula = "areaLoad = lineLoad / spacing";
      value = operands.lineLoad / operands.spacing;
      break;
    }
    case "repeated-section": {
      operands = {
        unitWeight: finiteNonNegative(resolver.volumeLoad(item.unitWeight), `${item.id}.unitWeight`),
        crossSectionArea: finiteNonNegative(
          resolver.area(item.crossSectionArea),
          `${item.id}.crossSectionArea`,
        ),
        spacing: finitePositive(resolver.length(item.spacing), `${item.id}.spacing`),
      };
      formula = "areaLoad = unitWeight * crossSectionArea / spacing";
      value = operands.unitWeight * operands.crossSectionArea / operands.spacing;
      break;
    }
    case "distributed-wall": {
      operands = {
        unitWeight: finiteNonNegative(resolver.volumeLoad(item.unitWeight), `${item.id}.unitWeight`),
        height: finiteNonNegative(resolver.length(item.height), `${item.id}.height`),
        thickness: finiteNonNegative(resolver.length(item.thickness), `${item.id}.thickness`),
        spacing: finitePositive(resolver.length(item.spacing), `${item.id}.spacing`),
      };
      formula = "areaLoad = unitWeight * height * thickness / spacing";
      value = operands.unitWeight * operands.height * operands.thickness / operands.spacing;
      break;
    }
    default:
      throw new Error(`Unsupported permanent-load model for ${item.id}: ${item.model}.`);
  }

  return {
    id: item.id,
    description: item.description ?? item.id,
    model: item.model,
    permanentClass: item.permanentClass,
    effect,
    operands,
    formula,
    value,
    quantity: "area-load",
    units: { ...INTERNAL_UNITS },
  };
}

function createTotals(items) {
  const byClassAndEffect = {
    G1: { favourable: 0, unfavourable: 0 },
    G2: { favourable: 0, unfavourable: 0 },
  };

  for (const item of items) {
    byClassAndEffect[item.permanentClass][item.effect] += item.value;
  }

  const G1 = byClassAndEffect.G1.favourable + byClassAndEffect.G1.unfavourable;
  const G2 = byClassAndEffect.G2.favourable + byClassAndEffect.G2.unfavourable;

  return {
    G1,
    G2,
    total: G1 + G2,
    byClassAndEffect,
  };
}

export function calculateNTC2018PermanentAreaLoads({
  units = null,
  items = [],
} = {}) {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018PermanentAreaLoads");
  if (!Array.isArray(items)) {
    throw new Error("items must be an array.");
  }

  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedItems = items.map((item) => normalizePermanentAreaItem(item, resolver));
  const ids = normalizedItems.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Permanent-load item ids must be unique.");
  }

  const classActions = Object.fromEntries(
    [...PERMANENT_CLASSES]
      .filter((permanentClass) => normalizedItems.some((item) => item.permanentClass === permanentClass))
      .map((permanentClass) => [
        permanentClass,
        createNTC2018PermanentAction({
          id: `NTC2018-${permanentClass}`,
          name: `NTC 2018 ${permanentClass}`,
          permanentClass,
          metadata: {
            reference: NTC2018_PERMANENT_LOAD_REFERENCES.partialFactors,
          },
        }),
      ]),
  );

  const loads = normalizedItems.map((item) => new AreaLoad({
    id: item.id,
    name: item.description,
    type: "permanent-area",
    intensity: item.value,
    action: classActions[item.permanentClass],
    units: INTERNAL_UNITS,
    metadata: {
      permanentClass: item.permanentClass,
      effect: item.effect,
      model: item.model,
      operands: item.operands,
      formula: item.formula,
      sourceUnitSystem: sourceUnits,
    },
  }));

  return new CalculationResult({
    applicationId: "ntc2018-permanent-area-loads",
    status: "ok",
    summary: `Calculated ${normalizedItems.length} NTC 2018 permanent area-load item(s).`,
    outputs: {
      schemaVersion: "ntc2018-permanent-area-loads/v1",
      units: { ...INTERNAL_UNITS },
      items: normalizedItems,
      actions: Object.values(classActions).map((action) => action.toJSON()),
      loads: loads.map((load) => load.toJSON()),
      totals: createTotals(normalizedItems),
    },
    assumptions: [
      "Input values are non-negative characteristic magnitudes.",
      "Load direction and geometric application remain the consumer's responsibility.",
      "The permanent class G1 or G2 and the favourable or unfavourable effect are explicit caller decisions.",
    ],
    metadata: {
      method: "ntc2018-permanent-area-loads",
      normativePreset: "NTC2018",
      references: { ...NTC2018_PERMANENT_LOAD_REFERENCES },
      unitSystem: { ...INTERNAL_UNITS },
      sourceUnitSystem: sourceUnits,
    },
  });
}
