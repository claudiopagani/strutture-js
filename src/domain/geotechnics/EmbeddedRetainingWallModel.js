import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const EMBEDDED_RETAINING_WALL_MODEL_SCHEMA_VERSION =
  "embedded-retaining-wall-model/v1";

export const EMBEDDED_RETAINING_WALL_TYPES = Object.freeze([
  "continuous-wall-strip",
  "equivalent-beam-strip",
]);

export const EMBEDDED_RETAINING_WALL_END_RESTRAINTS = Object.freeze([
  "free",
  "fixed",
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

function restraint(value, label) {
  const translation = value?.translation ?? "free";
  const rotation = value?.rotation ?? "free";
  if (!EMBEDDED_RETAINING_WALL_END_RESTRAINTS.includes(translation)) {
    throw new Error(`${label}.translation must be free or fixed.`);
  }
  if (!EMBEDDED_RETAINING_WALL_END_RESTRAINTS.includes(rotation)) {
    throw new Error(`${label}.rotation must be free or fixed.`);
  }
  return { translation, rotation };
}

export class EmbeddedRetainingWallModel {
  constructor({
    id,
    name = null,
    type = "continuous-wall-strip",
    topElevation,
    toeElevation,
    analysisWidth = 1,
    flexuralRigiditySegments = [],
    headCondition = null,
    toeCondition = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("An EmbeddedRetainingWallModel id is required.");
    if (!EMBEDDED_RETAINING_WALL_TYPES.includes(type)) {
      throw new Error(`Unsupported embedded retaining-wall type: ${type}.`);
    }
    assertExplicitUnitSystem(units, "EmbeddedRetainingWallModel");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const top = resolver.length(finite(topElevation, "topElevation"));
    const toe = resolver.length(finite(toeElevation, "toeElevation"));
    if (top <= toe) {
      throw new Error("Embedded wall topElevation must exceed toeElevation.");
    }
    if (!Array.isArray(flexuralRigiditySegments) ||
      flexuralRigiditySegments.length === 0) {
      throw new Error(
        "EmbeddedRetainingWallModel requires flexuralRigiditySegments.",
      );
    }
    const segments = flexuralRigiditySegments.map((segment, index) => ({
      id: String(segment.id ?? `wall-section-${index + 1}`),
      topElevation: resolver.length(finite(
        segment.topElevation,
        `flexuralRigiditySegments[${index}].topElevation`,
      )),
      bottomElevation: resolver.length(finite(
        segment.bottomElevation,
        `flexuralRigiditySegments[${index}].bottomElevation`,
      )),
      flexuralRigidity: positive(
        resolver.convert(finite(
          segment.flexuralRigidity,
          `flexuralRigiditySegments[${index}].flexuralRigidity`,
        ), { forceExponent: 1, lengthExponent: 2 }),
        `flexuralRigiditySegments[${index}].flexuralRigidity`,
      ),
      provenance: provenance(
        segment.provenance,
        `flexuralRigiditySegments[${index}].provenance`,
      ),
      metadata: structuredClone(segment.metadata ?? {}),
    })).sort((left, right) => right.topElevation - left.topElevation);
    const tolerance = 1e-10 * Math.max(1, Math.abs(top), Math.abs(toe));
    if (Math.abs(segments[0].topElevation - top) > tolerance ||
      Math.abs(segments.at(-1).bottomElevation - toe) > tolerance) {
      throw new Error(
        "Flexural-rigidity segments must cover the wall from top to toe.",
      );
    }
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment.topElevation <= segment.bottomElevation) {
        throw new Error("Wall section top must be above its bottom.");
      }
      if (index > 0 && Math.abs(
        segments[index - 1].bottomElevation - segment.topElevation,
      ) > tolerance) {
        throw new Error(
          "Flexural-rigidity segments must be contiguous and non-overlapping.",
        );
      }
    }

    this.schemaVersion = EMBEDDED_RETAINING_WALL_MODEL_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.type = type;
    this.topElevation = top;
    this.toeElevation = toe;
    this.analysisWidth = positive(
      resolver.length(analysisWidth),
      "analysisWidth",
    );
    this.flexuralRigiditySegments = segments;
    this.headCondition = restraint(headCondition, "headCondition");
    this.toeCondition = restraint(toeCondition, "toeCondition");
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      axisConvention: {
        verticalCoordinate: "elevation z positive upward",
        localDepth: "positive downward from wall top",
        wallDisplacement:
          "positive from retained side toward excavation side",
      },
    };
  }

  flexuralRigidityAtElevation(elevation) {
    const z = finite(elevation, "elevation");
    const tolerance = 1e-10 * Math.max(1, Math.abs(z));
    const segment = this.flexuralRigiditySegments.find((candidate) =>
      z <= candidate.topElevation + tolerance &&
      z >= candidate.bottomElevation - tolerance);
    if (!segment) {
      throw new Error(`Elevation ${z} lies outside embedded wall ${this.id}.`);
    }
    return segment;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      type: this.type,
      topElevation: this.topElevation,
      toeElevation: this.toeElevation,
      analysisWidth: this.analysisWidth,
      flexuralRigiditySegments: structuredClone(
        this.flexuralRigiditySegments,
      ),
      headCondition: { ...this.headCondition },
      toeCondition: { ...this.toeCondition },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
