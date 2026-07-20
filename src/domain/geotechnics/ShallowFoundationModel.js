import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION =
  "shallow-foundation-model/v1";
export const SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION =
  "shallow-foundation-action-state/v1";

export const SHALLOW_FOUNDATION_SHAPES = Object.freeze([
  "rectangular",
  "strip",
  "circular",
]);

export const SHALLOW_FOUNDATION_ACTION_BASES = Object.freeze([
  "total",
  "per-unit-length",
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

function normalizeGeometry(shape, geometry, resolver) {
  if (shape === "circular") {
    const diameter = positive(
      resolver.length(Number(geometry?.diameter)),
      "geometry.diameter",
    );
    return {
      diameter,
      area: Math.PI * diameter ** 2 / 4,
    };
  }

  const width = positive(
    resolver.length(Number(geometry?.width)),
    "geometry.width",
  );
  if (shape === "strip") {
    return {
      width,
      referenceLength: 1,
      areaPerUnitLength: width,
    };
  }

  const length = positive(
    resolver.length(Number(geometry?.length)),
    "geometry.length",
  );
  if (width > length) {
    throw new Error(
      "Rectangular shallow-foundation geometry requires width <= length; rotate the local axes if necessary.",
    );
  }
  return {
    width,
    length,
    area: width * length,
  };
}

function normalizePlacement(placement, resolver) {
  return {
    x: resolver.length(finite(placement?.x ?? 0, "placement.x")),
    y: resolver.length(finite(placement?.y ?? 0, "placement.y")),
    baseElevation: resolver.length(finite(
      placement?.baseElevation,
      "placement.baseElevation",
    )),
    referencePoint: "foundation-base-center",
  };
}

export class ShallowFoundationModel {
  constructor({
    id,
    name = null,
    shape,
    geometry = {},
    placement = {},
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A ShallowFoundationModel id is required.");
    if (!SHALLOW_FOUNDATION_SHAPES.includes(shape)) {
      throw new Error(`Unsupported shallow-foundation shape: ${shape}.`);
    }
    assertExplicitUnitSystem(units, "ShallowFoundationModel");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);

    this.schemaVersion = SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.shape = shape;
    this.geometry = normalizeGeometry(shape, geometry, resolver);
    this.placement = normalizePlacement(placement, resolver);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      localAxes: {
        x: shape === "strip" ? "transverse-width" : "width",
        y: shape === "strip" ? "continuous-axis" : "length",
        z: "up",
      },
    };
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      shape: this.shape,
      geometry: structuredClone(this.geometry),
      placement: { ...this.placement },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}

function normalizeTotalActions(actions, resolver) {
  return {
    verticalForce: positive(
      resolver.force(Number(actions.verticalForce)),
      "actions.verticalForce",
    ),
    horizontalX: resolver.force(finite(
      actions.horizontalX ?? 0,
      "actions.horizontalX",
    )),
    horizontalY: resolver.force(finite(
      actions.horizontalY ?? 0,
      "actions.horizontalY",
    )),
    momentX: resolver.moment(finite(actions.momentX ?? 0, "actions.momentX")),
    momentY: resolver.moment(finite(actions.momentY ?? 0, "actions.momentY")),
  };
}

function normalizePerUnitLengthActions(actions, resolver) {
  return {
    verticalForcePerUnitLength: positive(
      resolver.lineLoad(Number(actions.verticalForcePerUnitLength)),
      "actions.verticalForcePerUnitLength",
    ),
    horizontalForcePerUnitLength: resolver.lineLoad(finite(
      actions.horizontalForcePerUnitLength ?? 0,
      "actions.horizontalForcePerUnitLength",
    )),
    momentPerUnitLength: resolver.force(finite(
      actions.momentPerUnitLength ?? 0,
      "actions.momentPerUnitLength",
    )),
  };
}

export class ShallowFoundationActionState {
  constructor({
    id,
    name = null,
    basis,
    resultantScope,
    actions = {},
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A ShallowFoundationActionState id is required.");
    if (!SHALLOW_FOUNDATION_ACTION_BASES.includes(basis)) {
      throw new Error(`Unsupported shallow-foundation action basis: ${basis}.`);
    }
    if (resultantScope !== "total-at-foundation-base") {
      throw new Error(
        "resultantScope must explicitly be total-at-foundation-base, including foundation weight and any other applicable permanent vertical load.",
      );
    }
    assertExplicitUnitSystem(units, "ShallowFoundationActionState");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);

    this.schemaVersion = SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.basis = basis;
    this.resultantScope = resultantScope;
    this.actions = basis === "total"
      ? normalizeTotalActions(actions, resolver)
      : normalizePerUnitLengthActions(actions, resolver);
    this.referencePoint = "foundation-base-center";
    this.signConvention = {
      vertical: "positive-downward",
      horizontal: "signed-along-local-axis",
      moment: "right-hand-rule-about-local-axis",
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
      basis: this.basis,
      resultantScope: this.resultantScope,
      actions: { ...this.actions },
      referencePoint: this.referencePoint,
      signConvention: { ...this.signConvention },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
