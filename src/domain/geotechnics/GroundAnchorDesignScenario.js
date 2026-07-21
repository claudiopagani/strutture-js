import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const GROUND_ANCHOR_DESIGN_SCENARIO_SCHEMA_VERSION =
  "ground-anchor-design-scenario/v1";

export const GROUND_ANCHOR_DEMAND_SOURCES = Object.freeze([
  "assigned-tendon-load",
  "assigned-horizontal-line-load",
  "embedded-retaining-wall-result",
]);

export const GROUND_ANCHOR_FAILURE_SURFACE_MODELS = Object.freeze([
  "assigned-distance",
  "assigned-polyline",
  "rankine-active-wedge",
]);

export const GROUND_ANCHOR_BOND_RESISTANCE_MODELS = Object.freeze([
  "fhwa-presumptive",
  "ultimate-transfer-load",
  "ultimate-bond-stress",
]);

export const GROUND_ANCHOR_GROUND_CLASSES = Object.freeze([
  "soil",
  "weak-rock",
  "competent-rock",
]);

export const GROUND_ANCHOR_TEST_TYPES = Object.freeze([
  "proof",
  "performance",
  "extended-creep",
]);

const SERVICE_LIFE_CLASSES = Object.freeze([
  "temporary-support-of-excavation",
  "permanent",
]);
const AGGRESSIVITY_CLASSES = Object.freeze([
  "unknown",
  "non-aggressive",
  "aggressive",
]);
const CONSEQUENCE_CLASSES = Object.freeze(["not-serious", "serious"]);
const COST_CLASSES = Object.freeze(["small", "significant"]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function provenance(value, label) {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function normalizeDemand(input, resolver) {
  const source = input?.source;
  if (!GROUND_ANCHOR_DEMAND_SOURCES.includes(source)) {
    throw new Error(`Unsupported ground-anchor demand source: ${source}.`);
  }
  const normalized = {
    source,
    selection: input.selection ?? "maximum-absolute",
    supportId: input.supportId == null ? null : String(input.supportId),
    stageId: input.stageId == null ? null : String(input.stageId),
    designLoad: null,
    horizontalLineLoad: null,
    provenance: input.provenance == null
      ? null
      : provenance(input.provenance, "demand.provenance"),
    metadata: structuredClone(input.metadata ?? {}),
  };
  if (source === "assigned-tendon-load") {
    normalized.designLoad = positive(
      resolver.force(finite(input.designLoad, "demand.designLoad")),
      "demand.designLoad",
    );
  }
  if (source === "assigned-horizontal-line-load") {
    normalized.horizontalLineLoad = positive(
      resolver.lineLoad(finite(
        input.horizontalLineLoad,
        "demand.horizontalLineLoad",
      )),
      "demand.horizontalLineLoad",
    );
  }
  if (source !== "embedded-retaining-wall-result" &&
    normalized.provenance == null) {
    throw new Error("Assigned ground-anchor demand requires provenance.");
  }
  if (source === "embedded-retaining-wall-result" && !normalized.supportId) {
    throw new Error("Embedded-wall demand requires demand.supportId.");
  }
  if (![
    "maximum-absolute",
    "selected-stage",
  ].includes(normalized.selection)) {
    throw new Error(`Unsupported demand.selection: ${normalized.selection}.`);
  }
  if (normalized.selection === "selected-stage" && !normalized.stageId) {
    throw new Error("selected-stage demand requires demand.stageId.");
  }
  return normalized;
}

function normalizeFailureSurface(input, resolver, angleUnits) {
  const model = input?.model;
  if (!GROUND_ANCHOR_FAILURE_SURFACE_MODELS.includes(model)) {
    throw new Error(`Unsupported critical-failure-surface model: ${model}.`);
  }
  const normalized = {
    model,
    wallHeight: positive(
      resolver.length(finite(
        input.wallHeight,
        "criticalFailureSurface.wallHeight",
      )),
      "criticalFailureSurface.wallHeight",
    ),
    provenance: provenance(
      input.provenance,
      "criticalFailureSurface.provenance",
    ),
    metadata: structuredClone(input.metadata ?? {}),
  };
  if (model === "assigned-distance") {
    normalized.distanceAlongAnchor = positive(
      resolver.length(finite(
        input.distanceAlongAnchor,
        "criticalFailureSurface.distanceAlongAnchor",
      )),
      "criticalFailureSurface.distanceAlongAnchor",
    );
  }
  if (model === "assigned-polyline") {
    if (!Array.isArray(input.points) || input.points.length < 2) {
      throw new Error("An assigned critical-failure polyline requires points.");
    }
    normalized.points = input.points.map((point, index) => ({
      x: resolver.length(finite(
        point.x,
        `criticalFailureSurface.points[${index}].x`,
      )),
      z: resolver.length(finite(
        point.z,
        `criticalFailureSurface.points[${index}].z`,
      )),
    }));
  }
  if (model === "rankine-active-wedge") {
    const phiInput = finite(
      input.frictionAngle,
      "criticalFailureSurface.frictionAngle",
    );
    const phi = angleUnits === "rad" ? phiInput : phiInput * Math.PI / 180;
    if (phi <= 0 || phi >= Math.PI / 2) {
      throw new Error("Rankine frictionAngle must be between 0 and 90 degrees.");
    }
    normalized.frictionAngle = phi;
    normalized.excavationBaseElevation = resolver.length(finite(
      input.excavationBaseElevation,
      "criticalFailureSurface.excavationBaseElevation",
    ));
  }
  return normalized;
}

function normalizeBondResistance(input, resolver, label) {
  const model = input?.model;
  if (!GROUND_ANCHOR_BOND_RESISTANCE_MODELS.includes(model)) {
    throw new Error(`${label}.model is unsupported.`);
  }
  if (model === "fhwa-presumptive") {
    if (!input.catalogId) throw new Error(`${label}.catalogId is required.`);
    return {
      model,
      catalogId: String(input.catalogId),
      groundClass: input.groundClass == null
        ? null
        : String(input.groundClass),
      capacityDivisor: input.capacityDivisor == null
        ? null
        : positive(input.capacityDivisor, `${label}.capacityDivisor`),
      provenance: input.provenance == null
        ? null
        : provenance(input.provenance, `${label}.provenance`),
      metadata: structuredClone(input.metadata ?? {}),
    };
  }
  const groundClass = input.groundClass;
  if (!GROUND_ANCHOR_GROUND_CLASSES.includes(groundClass)) {
    throw new Error(`${label}.groundClass is unsupported.`);
  }
  const capacityDivisor = positive(
    input.capacityDivisor,
    `${label}.capacityDivisor`,
  );
  const normalized = {
    model,
    groundClass,
    capacityDivisor,
    provenance: provenance(input.provenance, `${label}.provenance`),
    metadata: structuredClone(input.metadata ?? {}),
  };
  if (model === "ultimate-transfer-load") {
    normalized.ultimateTransferLoad = positive(
      resolver.lineLoad(finite(
        input.ultimateTransferLoad,
        `${label}.ultimateTransferLoad`,
      )),
      `${label}.ultimateTransferLoad`,
    );
  } else {
    normalized.ultimateBondStress = positive(
      resolver.stress(finite(
        input.ultimateBondStress,
        `${label}.ultimateBondStress`,
      )),
      `${label}.ultimateBondStress`,
    );
  }
  return normalized;
}

function normalizeResistanceMap(input, resolver, label) {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object map.`);
  }
  return Object.fromEntries(Object.entries(input).map(([id, value]) => [
    id,
    normalizeBondResistance(value, resolver, `${label}.${id}`),
  ]));
}

function normalizeCorrosionEnvironment(input) {
  const serviceLife = input?.serviceLife;
  const aggressivity = input?.aggressivity ?? "unknown";
  const consequencesOfFailure = input?.consequencesOfFailure ?? "serious";
  const higherProtectionCost = input?.higherProtectionCost ?? "significant";
  if (!SERVICE_LIFE_CLASSES.includes(serviceLife)) {
    throw new Error("corrosionEnvironment.serviceLife is unsupported.");
  }
  if (!AGGRESSIVITY_CLASSES.includes(aggressivity)) {
    throw new Error("corrosionEnvironment.aggressivity is unsupported.");
  }
  if (!CONSEQUENCE_CLASSES.includes(consequencesOfFailure)) {
    throw new Error(
      "corrosionEnvironment.consequencesOfFailure is unsupported.",
    );
  }
  if (!COST_CLASSES.includes(higherProtectionCost)) {
    throw new Error("corrosionEnvironment.higherProtectionCost is unsupported.");
  }
  const measurements = input.measurements == null
    ? null
    : {
        pH: input.measurements.pH == null
          ? null
          : finite(input.measurements.pH, "corrosionEnvironment.measurements.pH"),
        resistivityOhmCm: input.measurements.resistivityOhmCm == null
          ? null
          : positive(
              input.measurements.resistivityOhmCm,
              "corrosionEnvironment.measurements.resistivityOhmCm",
            ),
        sulfidesPresent: Boolean(input.measurements.sulfidesPresent),
        strayCurrentsPresent: Boolean(
          input.measurements.strayCurrentsPresent,
        ),
        adjacentConcreteChemicalAttack: Boolean(
          input.measurements.adjacentConcreteChemicalAttack,
        ),
      };
  return {
    serviceLife,
    aggressivity,
    consequencesOfFailure,
    higherProtectionCost,
    measurements,
    provenance: provenance(
      input.provenance,
      "corrosionEnvironment.provenance",
    ),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizeTestRecord(input, resolver, index) {
  const type = input.type;
  if (!GROUND_ANCHOR_TEST_TYPES.includes(type)) {
    throw new Error(`testing.records[${index}].type is unsupported.`);
  }
  const holds = (input.holds ?? []).map((hold, holdIndex) => {
    if (!Array.isArray(hold.observations) || hold.observations.length < 2) {
      throw new Error(
        `testing.records[${index}].holds[${holdIndex}] requires observations.`,
      );
    }
    const observations = hold.observations.map((observation, obsIndex) => ({
      timeMinutes: positive(
        observation.timeMinutes,
        `testing.records[${index}].holds[${holdIndex}].observations[${obsIndex}].timeMinutes`,
      ),
      movement: nonNegative(
        resolver.length(finite(
          observation.movement,
          `testing.records[${index}].holds[${holdIndex}].observations[${obsIndex}].movement`,
        )),
        `testing.records[${index}].holds[${holdIndex}].observations[${obsIndex}].movement`,
      ),
    })).sort((left, right) => left.timeMinutes - right.timeMinutes);
    for (let obsIndex = 1; obsIndex < observations.length; obsIndex += 1) {
      if (observations[obsIndex].timeMinutes <=
        observations[obsIndex - 1].timeMinutes) {
        throw new Error("Ground-anchor test observation times must be unique.");
      }
    }
    return {
      load: positive(
        resolver.force(finite(
          hold.load,
          `testing.records[${index}].holds[${holdIndex}].load`,
        )),
        `testing.records[${index}].holds[${holdIndex}].load`,
      ),
      observations,
    };
  });
  return {
    id: String(input.id ?? `anchor-test-${index + 1}`),
    type,
    alignmentLoad: nonNegative(
      resolver.force(finite(
        input.alignmentLoad ?? 0,
        `testing.records[${index}].alignmentLoad`,
      )),
      `testing.records[${index}].alignmentLoad`,
    ),
    testLoad: positive(
      resolver.force(finite(
        input.testLoad,
        `testing.records[${index}].testLoad`,
      )),
      `testing.records[${index}].testLoad`,
    ),
    elasticMovementAtTestLoad: input.elasticMovementAtTestLoad == null
      ? null
      : nonNegative(resolver.length(finite(
          input.elasticMovementAtTestLoad,
          `testing.records[${index}].elasticMovementAtTestLoad`,
        )), `testing.records[${index}].elasticMovementAtTestLoad`),
    totalMovementAtTestLoad: input.totalMovementAtTestLoad == null
      ? null
      : nonNegative(resolver.length(finite(
          input.totalMovementAtTestLoad,
          `testing.records[${index}].totalMovementAtTestLoad`,
        )), `testing.records[${index}].totalMovementAtTestLoad`),
    initialLiftOffLoad: input.initialLiftOffLoad == null
      ? null
      : nonNegative(resolver.force(finite(
          input.initialLiftOffLoad,
          `testing.records[${index}].initialLiftOffLoad`,
        )), `testing.records[${index}].initialLiftOffLoad`),
    holds,
    provenance: provenance(
      input.provenance,
      `testing.records[${index}].provenance`,
    ),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

export class GroundAnchorDesignScenario {
  constructor({
    id,
    name = null,
    designMethod = "fhwa-gec4-allowable-load",
    demand,
    lockOffLoadFactor = 1,
    testLoadFactor = 1.33,
    criticalFailureSurface,
    bondResistanceByZone = {},
    bondResistanceByMaterial = {},
    defaultBondResistance = null,
    corrosionEnvironment,
    testing = null,
    angleUnits = "deg",
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A GroundAnchorDesignScenario id is required.");
    if (designMethod !== "fhwa-gec4-allowable-load") {
      throw new Error(`Unsupported ground-anchor designMethod: ${designMethod}.`);
    }
    assertExplicitUnitSystem(units, "GroundAnchorDesignScenario");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    this.schemaVersion = GROUND_ANCHOR_DESIGN_SCENARIO_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.designMethod = designMethod;
    this.demand = normalizeDemand(demand, resolver);
    this.lockOffLoadFactor = positive(
      lockOffLoadFactor,
      "lockOffLoadFactor",
    );
    this.testLoadFactor = positive(testLoadFactor, "testLoadFactor");
    this.criticalFailureSurface = normalizeFailureSurface(
      criticalFailureSurface,
      resolver,
      angleUnits,
    );
    this.bondResistanceByZone = normalizeResistanceMap(
      bondResistanceByZone,
      resolver,
      "bondResistanceByZone",
    );
    this.bondResistanceByMaterial = normalizeResistanceMap(
      bondResistanceByMaterial,
      resolver,
      "bondResistanceByMaterial",
    );
    this.defaultBondResistance = defaultBondResistance == null
      ? null
      : normalizeBondResistance(
          defaultBondResistance,
          resolver,
          "defaultBondResistance",
        );
    if (Object.keys(this.bondResistanceByZone).length === 0 &&
      Object.keys(this.bondResistanceByMaterial).length === 0 &&
      this.defaultBondResistance == null) {
      throw new Error("At least one ground-anchor bond resistance is required.");
    }
    this.corrosionEnvironment = normalizeCorrosionEnvironment(
      corrosionEnvironment,
    );
    this.testing = {
      jackLength: nonNegative(
        resolver.length(finite(testing?.jackLength ?? 0, "testing.jackLength")),
        "testing.jackLength",
      ),
      records: (testing?.records ?? []).map((record, index) =>
        normalizeTestRecord(record, resolver, index)),
      metadata: structuredClone(testing?.metadata ?? {}),
    };
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      designMethod: this.designMethod,
      demand: structuredClone(this.demand),
      lockOffLoadFactor: this.lockOffLoadFactor,
      testLoadFactor: this.testLoadFactor,
      criticalFailureSurface: {
        ...structuredClone(this.criticalFailureSurface),
        ...(this.criticalFailureSurface.frictionAngle == null ? {} : {
          frictionAngle:
            this.criticalFailureSurface.frictionAngle * 180 / Math.PI,
          angleUnits: "deg",
        }),
      },
      bondResistanceByZone: structuredClone(this.bondResistanceByZone),
      bondResistanceByMaterial: structuredClone(
        this.bondResistanceByMaterial,
      ),
      defaultBondResistance: structuredClone(this.defaultBondResistance),
      corrosionEnvironment: structuredClone(this.corrosionEnvironment),
      testing: structuredClone(this.testing),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
