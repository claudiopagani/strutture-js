import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import {
  GEOTECHNICAL_INTERNAL_UNITS,
  SoilMaterial,
} from "./SoilMaterial.js";

export const GROUND_PROFILE_SCHEMA_VERSION = "ground-profile/v1";

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return value;
}

function normalizeGroundwater(groundwater, resolver) {
  if (groundwater == null || groundwater.model === "none") {
    return { model: "none" };
  }

  const model = groundwater.model ?? "hydrostatic";
  if (model !== "hydrostatic") {
    throw new Error(`Unsupported groundwater model: ${model}.`);
  }

  return {
    model,
    waterTableElevation: resolver.length(finite(
      Number(groundwater.waterTableElevation),
      "groundwater.waterTableElevation",
    )),
    waterUnitWeight: positive(
      resolver.volumeLoad(Number(groundwater.waterUnitWeight ?? 9.81)),
      "groundwater.waterUnitWeight",
    ),
    metadata: structuredClone(groundwater.metadata ?? {}),
  };
}

export class GroundProfile {
  constructor({
    id,
    name = null,
    groundSurfaceElevation,
    materials = [],
    layers = [],
    groundwater = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A GroundProfile id is required.");
    assertExplicitUnitSystem(units, "GroundProfile");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const normalizedMaterials = materials.map((material) =>
      material instanceof SoilMaterial ? material : new SoilMaterial(material));
    const materialIds = normalizedMaterials.map((material) => material.id);

    if (new Set(materialIds).size !== materialIds.length) {
      throw new Error("GroundProfile material ids must be unique.");
    }
    if (!Array.isArray(layers) || layers.length === 0) {
      throw new Error("GroundProfile requires at least one layer.");
    }

    const surface = resolver.length(finite(
      Number(groundSurfaceElevation),
      "groundSurfaceElevation",
    ));
    const normalizedLayers = layers.map((layer, index) => ({
      id: layer.id ?? `layer-${index + 1}`,
      topElevation: resolver.length(finite(
        Number(layer.topElevation),
        `layers[${index}].topElevation`,
      )),
      bottomElevation: resolver.length(finite(
        Number(layer.bottomElevation),
        `layers[${index}].bottomElevation`,
      )),
      materialId: layer.materialId,
      metadata: structuredClone(layer.metadata ?? {}),
    })).sort((left, right) => right.topElevation - left.topElevation);
    const layerIds = normalizedLayers.map((layer) => layer.id);

    if (new Set(layerIds).size !== layerIds.length) {
      throw new Error("GroundProfile layer ids must be unique.");
    }

    const tolerance = 1e-10 * Math.max(
      1,
      Math.abs(surface),
      ...normalizedLayers.flatMap((layer) => [
        Math.abs(layer.topElevation),
        Math.abs(layer.bottomElevation),
      ]),
    );

    if (Math.abs(normalizedLayers[0].topElevation - surface) > tolerance) {
      throw new Error("The first GroundProfile layer must start at groundSurfaceElevation.");
    }

    for (let index = 0; index < normalizedLayers.length; index += 1) {
      const layer = normalizedLayers[index];
      if (!layer.materialId || !materialIds.includes(layer.materialId)) {
        throw new Error(
          `GroundProfile layer ${layer.id} references an unknown material.`,
        );
      }
      if (layer.bottomElevation >= layer.topElevation - tolerance) {
        throw new Error(
          `GroundProfile layer ${layer.id} must have topElevation above bottomElevation.`,
        );
      }
      if (
        index > 0 &&
        Math.abs(normalizedLayers[index - 1].bottomElevation - layer.topElevation) >
          tolerance
      ) {
        throw new Error("GroundProfile layers must be contiguous and non-overlapping.");
      }
    }

    this.schemaVersion = GROUND_PROFILE_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.coordinateSystem = {
      verticalAxis: "z",
      positiveDirection: "up",
      datum: metadata.datum ?? null,
    };
    this.groundSurfaceElevation = surface;
    this.materials = normalizedMaterials;
    this.layers = normalizedLayers;
    this.groundwater = normalizeGroundwater(groundwater, resolver);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  static fromThicknesses({
    groundSurfaceElevation,
    layers,
    ...profile
  } = {}) {
    let topElevation = Number(groundSurfaceElevation);
    const elevatedLayers = (layers ?? []).map((layer, index) => {
      const thickness = positive(Number(layer.thickness), `layers[${index}].thickness`);
      const normalized = {
        ...layer,
        topElevation,
        bottomElevation: topElevation - thickness,
      };
      delete normalized.thickness;
      topElevation = normalized.bottomElevation;
      return normalized;
    });

    return new GroundProfile({
      ...profile,
      groundSurfaceElevation,
      layers: elevatedLayers,
    });
  }

  get bottomElevation() {
    return this.layers.at(-1).bottomElevation;
  }

  getMaterial(materialId) {
    const material = this.materials.find(({ id }) => id === materialId);
    if (!material) throw new Error(`Unknown GroundProfile material: ${materialId}.`);
    return material;
  }

  getLayerAtElevation(elevation) {
    const z = finite(Number(elevation), "elevation");
    const tolerance = 1e-10 * Math.max(1, Math.abs(z));
    const layer = this.layers.find((candidate) =>
      z <= candidate.topElevation + tolerance &&
      z >= candidate.bottomElevation - tolerance);

    if (!layer) {
      throw new Error(
        `Elevation ${z} lies outside GroundProfile ${this.id}.`,
      );
    }

    return layer;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      coordinateSystem: { ...this.coordinateSystem },
      groundSurfaceElevation: this.groundSurfaceElevation,
      materials: this.materials.map((material) => material.toJSON()),
      layers: structuredClone(this.layers),
      groundwater: structuredClone(this.groundwater),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
