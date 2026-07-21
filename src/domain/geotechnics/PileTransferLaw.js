import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const PILE_TRANSFER_LAW_SCHEMA_VERSION = "pile-transfer-law/v1";

export const PILE_TRANSFER_LAW_KINDS = Object.freeze(["p-y"]);

export const PILE_TRANSFER_CURVE_MODELS = Object.freeze([
  "symmetric-piecewise-linear",
]);

export const PILE_TRANSFER_EXTRAPOLATION_MODELS = Object.freeze([
  "constant",
  "linear",
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function normalizeProvenance(value) {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error("PileTransferLaw provenance.source is required.");
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function normalizePoints(points, resolver) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error("PileTransferLaw requires at least two curve points.");
  }
  const normalized = points.map((point, index) => ({
    displacement: resolver.length(finite(
      point.displacement,
      `points[${index}].displacement`,
    )),
    resistancePerLength: resolver.lineLoad(finite(
      point.resistancePerLength,
      `points[${index}].resistancePerLength`,
    )),
  }));
  const scale = Math.max(
    1,
    ...normalized.flatMap((point) => [
      Math.abs(point.displacement),
      Math.abs(point.resistancePerLength),
    ]),
  );
  const tolerance = 1e-12 * scale;
  if (
    Math.abs(normalized[0].displacement) > tolerance ||
    Math.abs(normalized[0].resistancePerLength) > tolerance
  ) {
    throw new Error("PileTransferLaw curve must start at the origin.");
  }
  normalized[0] = { displacement: 0, resistancePerLength: 0 };

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (current.displacement <= previous.displacement + tolerance) {
      throw new Error(
        "PileTransferLaw displacements must be positive and strictly increasing.",
      );
    }
    if (current.resistancePerLength < previous.resistancePerLength - tolerance) {
      throw new Error(
        "PileTransferLaw static-monotonic resistance must be non-decreasing.",
      );
    }
    if (current.resistancePerLength < -tolerance) {
      throw new Error("PileTransferLaw resistance must be non-negative.");
    }
  }
  return normalized;
}

function segmentResponse(points, magnitude, extrapolation) {
  let left = points[0];
  let right = points[1];

  if (magnitude >= points.at(-1).displacement) {
    left = points.at(-2);
    right = points.at(-1);
    if (extrapolation === "constant") {
      return {
        resistancePerLength: right.resistancePerLength,
        tangentModulus: 0,
        segmentIndex: points.length - 2,
        extrapolated: magnitude > right.displacement,
      };
    }
  } else {
    for (let index = 1; index < points.length; index += 1) {
      if (magnitude <= points[index].displacement) {
        left = points[index - 1];
        right = points[index];
        break;
      }
    }
  }

  const tangentModulus =
    (right.resistancePerLength - left.resistancePerLength) /
    (right.displacement - left.displacement);
  return {
    resistancePerLength:
      left.resistancePerLength +
      tangentModulus * (magnitude - left.displacement),
    tangentModulus,
    segmentIndex: points.indexOf(left),
    extrapolated: magnitude > points.at(-1).displacement,
  };
}

export class PileTransferLaw {
  constructor({
    id,
    name = null,
    kind = "p-y",
    curveModel = "symmetric-piecewise-linear",
    points = [],
    extrapolation = "constant",
    loading = "static-monotonic",
    provenance = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A PileTransferLaw id is required.");
    if (!PILE_TRANSFER_LAW_KINDS.includes(kind)) {
      throw new Error(`Unsupported pile transfer-law kind: ${kind}.`);
    }
    if (!PILE_TRANSFER_CURVE_MODELS.includes(curveModel)) {
      throw new Error(`Unsupported pile transfer curve model: ${curveModel}.`);
    }
    if (!PILE_TRANSFER_EXTRAPOLATION_MODELS.includes(extrapolation)) {
      throw new Error(
        `Unsupported pile transfer extrapolation model: ${extrapolation}.`,
      );
    }
    if (loading !== "static-monotonic") {
      throw new Error(
        "PileTransferLaw currently supports only static-monotonic loading.",
      );
    }
    assertExplicitUnitSystem(units, "PileTransferLaw");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);

    this.schemaVersion = PILE_TRANSFER_LAW_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.kind = kind;
    this.curveModel = curveModel;
    this.points = normalizePoints(points, resolver);
    this.extrapolation = extrapolation;
    this.loading = loading;
    this.provenance = normalizeProvenance(provenance);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      signConvention: {
        displacement: "signed pile displacement relative to soil",
        mobilizedResistance:
          "same sign as displacement; soil reaction on pile has opposite sign",
      },
    };
  }

  evaluate(displacement) {
    const signedDisplacement = finite(displacement, "displacement");
    const magnitude = Math.abs(signedDisplacement);
    const response = segmentResponse(
      this.points,
      magnitude,
      this.extrapolation,
    );
    const sign = Math.sign(signedDisplacement);
    const mobilizedResistancePerLength = sign === 0
      ? 0
      : sign * response.resistancePerLength;
    return {
      displacement: signedDisplacement,
      mobilizedResistancePerLength,
      soilReactionOnPilePerLength: -mobilizedResistancePerLength,
      tangentModulus: response.tangentModulus,
      secantModulus: magnitude > 0
        ? response.resistancePerLength / magnitude
        : response.tangentModulus,
      segmentIndex: response.segmentIndex,
      extrapolated: response.extrapolated,
    };
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      kind: this.kind,
      curveModel: this.curveModel,
      points: structuredClone(this.points),
      extrapolation: this.extrapolation,
      loading: this.loading,
      provenance: structuredClone(this.provenance),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
