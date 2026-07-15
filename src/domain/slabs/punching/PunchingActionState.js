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
      source: structuredClone(this.source),
      metadata: { ...this.metadata },
    };
  }
}
