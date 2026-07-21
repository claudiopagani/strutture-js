import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const GROUND_ANCHOR_MODEL_SCHEMA_VERSION = "ground-anchor-model/v1";

export const GROUND_ANCHOR_TENDON_TYPES = Object.freeze(["bar", "strand"]);
export const GROUND_ANCHOR_HORIZONTAL_DIRECTIONS = Object.freeze([
  "positive-x",
  "negative-x",
]);
export const GROUND_ANCHOR_CORROSION_CLASSES = Object.freeze([
  "none",
  "II",
  "I",
]);

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

function provenance(value, label) {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function radians(value, angleUnits) {
  if (angleUnits === "rad") return value;
  if (angleUnits === "deg") return value * Math.PI / 180;
  throw new Error(`Unsupported ground-anchor angle unit: ${angleUnits}.`);
}

function normalizeAssignedCapacity(value, resolver, label) {
  if (value == null) return null;
  return {
    value: positive(resolver.force(finite(value.value, `${label}.value`)), label),
    provenance: provenance(value.provenance, `${label}.provenance`),
    metadata: structuredClone(value.metadata ?? {}),
  };
}

export class GroundAnchorModel {
  constructor({
    id,
    name = null,
    head,
    horizontalDirection = "positive-x",
    inclination,
    angleUnits = "deg",
    freeLength,
    bondLength,
    horizontalSpacing,
    groutBodyDiameter,
    tendon,
    corrosionProtection,
    anchorage = null,
    installation = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A GroundAnchorModel id is required.");
    assertExplicitUnitSystem(units, "GroundAnchorModel");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    if (!GROUND_ANCHOR_HORIZONTAL_DIRECTIONS.includes(horizontalDirection)) {
      throw new Error(`Unsupported horizontalDirection: ${horizontalDirection}.`);
    }
    const inclinationRadians = radians(
      finite(inclination, "inclination"),
      angleUnits,
    );
    if (inclinationRadians < 0 || inclinationRadians >= Math.PI / 2) {
      throw new Error(
        "Ground-anchor inclination must be at least zero and less than 90 degrees below horizontal.",
      );
    }
    const tendonType = tendon?.type;
    if (!GROUND_ANCHOR_TENDON_TYPES.includes(tendonType)) {
      throw new Error("Ground-anchor tendon.type must be bar or strand.");
    }
    const corrosionClass = corrosionProtection?.class;
    if (!GROUND_ANCHOR_CORROSION_CLASSES.includes(corrosionClass)) {
      throw new Error(
        "corrosionProtection.class must be none, II or I.",
      );
    }
    const specialGrouting = Boolean(installation?.specialGrouting);
    if (specialGrouting && installation?.provenance == null) {
      throw new Error(
        "installation.provenance is required when specialGrouting is enabled.",
      );
    }

    this.schemaVersion = GROUND_ANCHOR_MODEL_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.head = {
      x: resolver.length(finite(head?.x, "head.x")),
      z: resolver.length(finite(head?.z, "head.z")),
    };
    this.horizontalDirection = horizontalDirection;
    this.inclination = inclinationRadians;
    this.freeLength = positive(
      resolver.length(finite(freeLength, "freeLength")),
      "freeLength",
    );
    this.bondLength = positive(
      resolver.length(finite(bondLength, "bondLength")),
      "bondLength",
    );
    this.horizontalSpacing = positive(
      resolver.length(finite(horizontalSpacing, "horizontalSpacing")),
      "horizontalSpacing",
    );
    this.groutBodyDiameter = positive(
      resolver.length(finite(groutBodyDiameter, "groutBodyDiameter")),
      "groutBodyDiameter",
    );
    this.tendon = {
      type: tendonType,
      steelArea: positive(
        resolver.area(finite(tendon.steelArea, "tendon.steelArea")),
        "tendon.steelArea",
      ),
      elasticModulus: positive(
        resolver.stress(finite(
          tendon.elasticModulus,
          "tendon.elasticModulus",
        )),
        "tendon.elasticModulus",
      ),
      specifiedMinimumTensileStrength: positive(
        resolver.stress(finite(
          tendon.specifiedMinimumTensileStrength,
          "tendon.specifiedMinimumTensileStrength",
        )),
        "tendon.specifiedMinimumTensileStrength",
      ),
      provenance: provenance(tendon.provenance, "tendon.provenance"),
      metadata: structuredClone(tendon.metadata ?? {}),
    };
    this.corrosionProtection = {
      class: corrosionClass,
      restressable: Boolean(corrosionProtection.restressable),
      details: structuredClone(corrosionProtection.details ?? {}),
      provenance: provenance(
        corrosionProtection.provenance,
        "corrosionProtection.provenance",
      ),
    };
    this.anchorage = {
      tensileCapacity: normalizeAssignedCapacity(
        anchorage?.tensileCapacity,
        resolver,
        "anchorage.tensileCapacity",
      ),
      tendonGroutBondCapacity: normalizeAssignedCapacity(
        anchorage?.tendonGroutBondCapacity,
        resolver,
        "anchorage.tendonGroutBondCapacity",
      ),
      metadata: structuredClone(anchorage?.metadata ?? {}),
    };
    this.installation = {
      method: String(installation?.method ?? "not-specified"),
      specialGrouting,
      specializedLoadTransfer: Boolean(
        installation?.specializedLoadTransfer,
      ),
      provenance: installation?.provenance == null
        ? null
        : provenance(installation.provenance, "installation.provenance"),
      metadata: structuredClone(installation?.metadata ?? {}),
    };
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      axisConvention: {
        horizontal: "GroundSection2D x; selected direction away from anchor head",
        vertical: "z positive upward",
        inclination: "positive below horizontal",
      },
    };
  }

  get totalLength() {
    return this.freeLength + this.bondLength;
  }

  pointAtDistance(distance) {
    const selected = finite(distance, "distance");
    if (selected < 0 || selected > this.totalLength) {
      throw new Error("Ground-anchor distance lies outside its total length.");
    }
    const direction = this.horizontalDirection === "positive-x" ? 1 : -1;
    return {
      x: this.head.x + direction * selected * Math.cos(this.inclination),
      z: this.head.z - selected * Math.sin(this.inclination),
    };
  }

  get bondStart() {
    return this.pointAtDistance(this.freeLength);
  }

  get bondEnd() {
    return this.pointAtDistance(this.totalLength);
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      head: { ...this.head },
      horizontalDirection: this.horizontalDirection,
      inclination: this.inclination * 180 / Math.PI,
      angleUnits: "deg",
      freeLength: this.freeLength,
      bondLength: this.bondLength,
      horizontalSpacing: this.horizontalSpacing,
      groutBodyDiameter: this.groutBodyDiameter,
      tendon: structuredClone(this.tendon),
      corrosionProtection: structuredClone(this.corrosionProtection),
      anchorage: structuredClone(this.anchorage),
      installation: structuredClone(this.installation),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
