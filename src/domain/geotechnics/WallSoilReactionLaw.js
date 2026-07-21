import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const WALL_SOIL_REACTION_LAW_SCHEMA_VERSION =
  "wall-soil-reaction-law/v1";

export const WALL_SOIL_REACTION_MODELS = Object.freeze([
  "monotone-piecewise-linear",
]);

export const WALL_SOIL_REACTION_EXTRAPOLATION_MODELS = Object.freeze([
  "constant",
  "linear",
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function normalizeProvenance(value) {
  const provenance = structuredClone(value ?? {});
  if (typeof provenance.source !== "string" || !provenance.source.trim()) {
    throw new Error("WallSoilReactionLaw provenance.source is required.");
  }
  provenance.source = provenance.source.trim();
  return provenance;
}

function interpolate(left, right, displacement) {
  const length = right.closureDisplacement - left.closureDisplacement;
  const tangentModulus = (right.effectivePressure - left.effectivePressure) /
    length;
  return {
    effectivePressure: left.effectivePressure + tangentModulus *
      (displacement - left.closureDisplacement),
    tangentModulus,
  };
}

/**
 * Assigned effective-soil pressure versus wall-to-soil closure.
 * Positive closure means that the wall moves into the soil on the selected
 * side. Pressure is compressive and therefore non-negative.
 */
export class WallSoilReactionLaw {
  constructor({
    id,
    name = null,
    model = "monotone-piecewise-linear",
    points = [],
    extrapolation = "constant",
    provenance = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A WallSoilReactionLaw id is required.");
    if (!WALL_SOIL_REACTION_MODELS.includes(model)) {
      throw new Error(`Unsupported wall-soil reaction model: ${model}.`);
    }
    if (!WALL_SOIL_REACTION_EXTRAPOLATION_MODELS.includes(extrapolation)) {
      throw new Error(
        `Unsupported wall-soil reaction extrapolation: ${extrapolation}.`,
      );
    }
    assertExplicitUnitSystem(units, "WallSoilReactionLaw");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    if (!Array.isArray(points) || points.length < 2) {
      throw new Error("WallSoilReactionLaw requires at least two points.");
    }

    const normalizedPoints = points.map((point, index) => ({
      closureDisplacement: resolver.length(finite(
        point.closureDisplacement,
        `points[${index}].closureDisplacement`,
      )),
      effectivePressure: resolver.stress(finite(
        point.effectivePressure,
        `points[${index}].effectivePressure`,
      )),
    })).sort((left, right) =>
      left.closureDisplacement - right.closureDisplacement);

    for (let index = 0; index < normalizedPoints.length; index += 1) {
      const point = normalizedPoints[index];
      if (point.effectivePressure < 0) {
        throw new Error("Wall-soil effective pressure must be non-negative.");
      }
      if (
        index > 0 &&
        point.closureDisplacement <=
          normalizedPoints[index - 1].closureDisplacement
      ) {
        throw new Error(
          "Wall-soil closure displacements must be strictly increasing.",
        );
      }
      if (
        index > 0 &&
        point.effectivePressure <
          normalizedPoints[index - 1].effectivePressure
      ) {
        throw new Error(
          "Wall-soil effective pressure must not decrease with closure.",
        );
      }
    }
    if (
      normalizedPoints[0].closureDisplacement > 0 ||
      normalizedPoints.at(-1).closureDisplacement < 0
    ) {
      throw new Error(
        "WallSoilReactionLaw points must bracket zero closure displacement.",
      );
    }

    this.schemaVersion = WALL_SOIL_REACTION_LAW_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.model = model;
    this.points = normalizedPoints;
    this.extrapolation = extrapolation;
    this.provenance = normalizeProvenance(provenance);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      pressureBasis: "effective-soil-pressure",
      displacementConvention:
        "positive closure means wall movement into soil",
    };
  }

  evaluate(closureDisplacement) {
    const displacement = finite(
      closureDisplacement,
      "closureDisplacement",
    );
    const first = this.points[0];
    const last = this.points.at(-1);
    let evaluated;
    let segmentIndex;
    let extrapolated = false;

    if (displacement < first.closureDisplacement) {
      extrapolated = true;
      segmentIndex = 0;
      evaluated = this.extrapolation === "linear"
        ? interpolate(first, this.points[1], displacement)
        : { effectivePressure: first.effectivePressure, tangentModulus: 0 };
    } else if (displacement > last.closureDisplacement) {
      extrapolated = true;
      segmentIndex = this.points.length - 2;
      evaluated = this.extrapolation === "linear"
        ? interpolate(this.points.at(-2), last, displacement)
        : { effectivePressure: last.effectivePressure, tangentModulus: 0 };
    } else {
      segmentIndex = Math.max(
        0,
        this.points.findIndex((point) =>
          displacement <= point.closureDisplacement) - 1,
      );
      if (segmentIndex >= this.points.length - 1) {
        segmentIndex = this.points.length - 2;
      }
      evaluated = interpolate(
        this.points[segmentIndex],
        this.points[segmentIndex + 1],
        displacement,
      );
    }

    if (evaluated.effectivePressure < 0) {
      evaluated = { effectivePressure: 0, tangentModulus: 0 };
    }
    return {
      closureDisplacement: displacement,
      effectivePressure: evaluated.effectivePressure,
      tangentModulus: evaluated.tangentModulus,
      secantModulus: Math.abs(displacement) > 0
        ? (evaluated.effectivePressure - this.pressureAtZero) / displacement
        : evaluated.tangentModulus,
      pressureAtZero: this.pressureAtZero,
      segmentIndex,
      extrapolated,
    };
  }

  get pressureAtZero() {
    for (let index = 1; index < this.points.length; index += 1) {
      if (this.points[index].closureDisplacement >= 0) {
        return interpolate(this.points[index - 1], this.points[index], 0)
          .effectivePressure;
      }
    }
    return this.points.at(-1).effectivePressure;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      model: this.model,
      points: structuredClone(this.points),
      extrapolation: this.extrapolation,
      provenance: structuredClone(this.provenance),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
