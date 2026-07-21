import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION =
  "lateral-pile-load-scenario/v1";

export const LATERAL_PILE_CAPACITY_METHODS = Object.freeze([
  "broms-short-free-head",
]);

export const LATERAL_PILE_SOIL_BRANCHES = Object.freeze([
  "cohesive-undrained",
  "cohesionless-drained",
]);

export const LATERAL_PILE_HEAD_CONDITIONS = Object.freeze([
  "free-to-rotate",
]);

export const LATERAL_PILE_BEHAVIOR_CLASSIFICATIONS = Object.freeze([
  "short-rigid",
]);

export const LATERAL_PILE_RESISTANCE_CONVERSION_MODELS = Object.freeze([
  "soil-reaction-factor",
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function normalizeProvenance(value, label) {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function normalizeAction(action, resolver) {
  if (!action || typeof action !== "object") {
    throw new Error("LateralPileLoadScenario action is required.");
  }
  if (action.referencePoint !== "groundline-at-pile-axis") {
    throw new Error(
      "action.referencePoint must be groundline-at-pile-axis; transfer any elevated-head action to groundline before analysis.",
    );
  }
  const lateralShear = nonNegative(
    resolver.force(Number(action.lateralShear)),
    "action.lateralShear",
  );
  const overturningMoment = nonNegative(
    resolver.moment(Number(action.overturningMoment ?? 0)),
    "action.overturningMoment",
  );
  if (lateralShear === 0 && overturningMoment === 0) {
    throw new Error(
      "At least one of action.lateralShear or action.overturningMoment must be positive.",
    );
  }
  return {
    lateralShear,
    overturningMoment,
    basis: String(action.basis ?? "assigned"),
    referencePoint: "groundline-at-pile-axis",
    direction: action.direction ?? "local-positive-x",
    metadata: structuredClone(action.metadata ?? {}),
  };
}

function normalizeBehaviorAssertion(assertion) {
  if (!assertion || typeof assertion !== "object") {
    throw new Error(
      "behaviorAssertion is required because the Broms branch is restricted to short rigid piles.",
    );
  }
  const classification = assertion.classification;
  if (!LATERAL_PILE_BEHAVIOR_CLASSIFICATIONS.includes(classification)) {
    throw new Error(
      `Unsupported lateral pile behavior classification: ${classification}.`,
    );
  }
  return {
    classification,
    basis: assertion.basis ?? "project-assessment",
    provenance: normalizeProvenance(
      assertion.provenance,
      "behaviorAssertion.provenance",
    ),
    metadata: structuredClone(assertion.metadata ?? {}),
  };
}

function normalizeResistanceConversion(input) {
  if (input == null) return null;
  const model = input.model ?? "soil-reaction-factor";
  if (!LATERAL_PILE_RESISTANCE_CONVERSION_MODELS.includes(model)) {
    throw new Error(`Unsupported resistanceConversion.model: ${model}.`);
  }
  const factor = positive(
    input.factor,
    "resistanceConversion.factor",
  );
  if (factor > 1) {
    throw new Error("resistanceConversion.factor must not exceed 1.");
  }
  return {
    model,
    factor,
    provenance: normalizeProvenance(
      input.provenance,
      "resistanceConversion.provenance",
    ),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

export class LateralPileLoadScenario {
  constructor({
    id,
    name = null,
    method = "broms-short-free-head",
    soilBranch,
    headCondition = "free-to-rotate",
    action = null,
    behaviorAssertion = null,
    resistanceConversion = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A LateralPileLoadScenario id is required.");
    if (!LATERAL_PILE_CAPACITY_METHODS.includes(method)) {
      throw new Error(`Unsupported lateral pile capacity method: ${method}.`);
    }
    if (!LATERAL_PILE_SOIL_BRANCHES.includes(soilBranch)) {
      throw new Error(`Unsupported lateral pile soil branch: ${soilBranch}.`);
    }
    if (!LATERAL_PILE_HEAD_CONDITIONS.includes(headCondition)) {
      throw new Error(`Unsupported lateral pile head condition: ${headCondition}.`);
    }
    assertExplicitUnitSystem(units, "LateralPileLoadScenario");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);

    this.schemaVersion = LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.method = method;
    this.soilBranch = soilBranch;
    this.headCondition = headCondition;
    this.action = normalizeAction(action, resolver);
    this.behaviorAssertion = normalizeBehaviorAssertion(behaviorAssertion);
    this.resistanceConversion = normalizeResistanceConversion(
      resistanceConversion,
    );
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      signConvention: {
        lateralShear: "non-negative-magnitude-in-action-direction",
        overturningMoment:
          "non-negative-magnitude-acting-in-the-same-rotational-sense-as-shear",
      },
    };
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      method: this.method,
      soilBranch: this.soilBranch,
      headCondition: this.headCondition,
      action: structuredClone(this.action),
      behaviorAssertion: structuredClone(this.behaviorAssertion),
      resistanceConversion: structuredClone(this.resistanceConversion),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
