import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const SOURCE_METHODS = new Set([
  "manual",
  "joint-equilibrium",
  "integrated-contour",
]);

function finite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }

  return value;
}

function normalizeCombinationType(value) {
  if (value == null || value === "") {
    return null;
  }

  return String(value).trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function normalizeSource(source) {
  if (source != null && (typeof source !== "object" || Array.isArray(source))) {
    throw new Error("Punching action source must be an object.");
  }

  const normalized = structuredClone(source ?? { method: "manual" });
  normalized.method ??= "manual";

  if (!SOURCE_METHODS.has(normalized.method)) {
    throw new Error(`Unsupported punching action source method: ${normalized.method}.`);
  }

  return normalized;
}

function optionalNonNegativeForce(value, resolver, label) {
  if (value == null) {
    return null;
  }

  const normalized = resolver.force(finite(Number(value), label));

  if (normalized < 0) {
    throw new Error(`${label} must be non-negative.`);
  }

  return normalized;
}

function normalizePerimeterForceMap(input, resolver, label) {
  if (input == null) {
    return {};
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object.`);
  }

  return Object.fromEntries(Object.entries(input).map(([role, value]) => [
    role,
    optionalNonNegativeForce(value, resolver, `${label}.${role}`),
  ]));
}

function normalizePunchingDemand(input, resolver) {
  if (input == null) {
    return null;
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("punchingDemand must be an object or null.");
  }

  return {
    supportReaction: optionalNonNegativeForce(
      input.supportReaction,
      resolver,
      "punchingDemand.supportReaction",
    ),
    punchingForce: optionalNonNegativeForce(
      input.punchingForce,
      resolver,
      "punchingDemand.punchingForce",
    ),
    punchingForceByPerimeter: normalizePerimeterForceMap(
      input.punchingForceByPerimeter,
      resolver,
      "punchingDemand.punchingForceByPerimeter",
    ),
    enclosedLoadByPerimeter: normalizePerimeterForceMap(
      input.enclosedLoadByPerimeter,
      resolver,
      "punchingDemand.enclosedLoadByPerimeter",
    ),
    lineOfAction: input.lineOfAction == null
      ? null
      : {
          x: resolver.length(finite(
            Number(input.lineOfAction.x),
            "punchingDemand.lineOfAction.x",
          )),
          y: resolver.length(finite(
            Number(input.lineOfAction.y),
            "punchingDemand.lineOfAction.y",
          )),
        },
    source: structuredClone(input.source ?? { method: "explicit" }),
  };
}

export const PUNCHING_ACTION_SCHEMA_VERSION = "rc-punching-action-state/v0";

export class PunchingActionState {
  constructor({
    id,
    connectionId,
    localFrameId = null,
    combinationType = null,
    units = null,
    referencePoint = {},
    components = {},
    punchingDemand = null,
    source = { method: "manual" },
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("A punching action state id is required.");
    }

    if (!connectionId) {
      throw new Error("PunchingActionState requires a connectionId.");
    }

    assertExplicitUnitSystem(units, "PunchingActionState");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.connectionId = connectionId;
    this.localFrameId = localFrameId;
    this.schemaVersion = PUNCHING_ACTION_SCHEMA_VERSION;
    this.combinationType = normalizeCombinationType(combinationType);
    this.units = INTERNAL_UNITS;
    this.referencePoint = {
      x: resolver.length(finite(Number(referencePoint.x ?? 0), "referencePoint.x")),
      y: resolver.length(finite(Number(referencePoint.y ?? 0), "referencePoint.y")),
      z: resolver.length(finite(Number(referencePoint.z ?? 0), "referencePoint.z")),
    };
    this.components = {
      fz: resolver.force(finite(Number(components.fz ?? 0), "components.fz")),
      mx: resolver.moment(finite(Number(components.mx ?? 0), "components.mx")),
      my: resolver.moment(finite(Number(components.my ?? 0), "components.my")),
    };
    this.punchingDemand = normalizePunchingDemand(punchingDemand, resolver);
    this.source = normalizeSource(source);
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      componentConvention: "right-handed-actions-exerted-on-slab-in-connection-local-frame",
    };
  }

  toJSON() {
    return {
      id: this.id,
      connectionId: this.connectionId,
      localFrameId: this.localFrameId,
      schemaVersion: this.schemaVersion,
      combinationType: this.combinationType,
      units: { ...this.units },
      referencePoint: { ...this.referencePoint },
      components: { ...this.components },
      punchingDemand: structuredClone(this.punchingDemand),
      source: structuredClone(this.source),
      metadata: { ...this.metadata },
    };
  }
}
