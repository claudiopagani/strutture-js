import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GroundProfile } from "./GroundProfile.js";
import { GroundSection2D } from "./GroundSection2D.js";
import { PorePressureField2D } from "./PorePressureField2D.js";
import {
  GEOTECHNICAL_INTERNAL_UNITS,
  SoilMaterial,
} from "./SoilMaterial.js";

export const GROUND_MODEL_SCHEMA_VERSION = "ground-model/v1";

function uniqueIds(items, label) {
  const ids = items.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`GroundModel ${label} ids must be unique.`);
  }
}

function resolveDefaultId(items, requested, label) {
  if (requested != null && !items.some(({ id }) => id === requested)) {
    throw new Error(`Unknown GroundModel default ${label}: ${requested}.`);
  }
  return requested ?? (items.length === 1 ? items[0].id : null);
}

function selectedById(items, id, defaultId, label) {
  const selectedId = id ?? defaultId;
  if (selectedId == null) {
    if (items.length === 0) return null;
    throw new Error(`GroundModel requires an explicit ${label} id.`);
  }
  const selected = items.find((item) => item.id === selectedId);
  if (!selected) throw new Error(`Unknown GroundModel ${label}: ${selectedId}.`);
  return selected;
}

function profilePayload(profile) {
  const serialized = profile.toJSON();
  delete serialized.materials;
  return {
    ...serialized,
    materialSource: "ground-model-material-library",
  };
}

export class GroundModel {
  constructor({
    id,
    name = null,
    materials = [],
    profiles = [],
    sections = [],
    porePressureFields = [],
    defaultProfileId = null,
    defaultSectionId = null,
    defaultPorePressureFieldId = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A GroundModel id is required.");
    assertExplicitUnitSystem(units, "GroundModel");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    if (!Array.isArray(materials) || materials.length === 0) {
      throw new Error("GroundModel requires at least one material.");
    }
    const normalizedMaterials = materials.map((material) =>
      material instanceof SoilMaterial
        ? material
        : new SoilMaterial({
            ...material,
            units: material.units ?? units,
          }));
    uniqueIds(normalizedMaterials, "material");

    if (
      !Array.isArray(profiles) ||
      !Array.isArray(sections) ||
      !Array.isArray(porePressureFields)
    ) {
      throw new Error(
        "GroundModel profiles, sections and porePressureFields must be arrays.",
      );
    }
    if (profiles.length === 0 && sections.length === 0) {
      throw new Error(
        "GroundModel requires at least one GroundProfile or GroundSection2D.",
      );
    }
    const normalizedProfiles = profiles.map((profile) => {
      const payload = profile instanceof GroundProfile
        ? profile.toJSON()
        : profile;
      return new GroundProfile({
        ...payload,
        materials: normalizedMaterials,
        units: payload.units ?? units,
      });
    });
    const normalizedSections = sections.map((section) =>
      section instanceof GroundSection2D
        ? section
        : new GroundSection2D({
            ...section,
            units: section.units ?? units,
          }));
    const normalizedFields = porePressureFields.map((field) =>
      field instanceof PorePressureField2D
        ? field
        : new PorePressureField2D({
            ...field,
            units: field.units ?? units,
          }));
    uniqueIds(normalizedProfiles, "profile");
    uniqueIds(normalizedSections, "section");
    uniqueIds(normalizedFields, "pore-pressure field");

    const materialIds = new Set(normalizedMaterials.map(({ id: materialId }) =>
      materialId));
    for (const profile of normalizedProfiles) {
      for (const layer of profile.layers) {
        if (!materialIds.has(layer.materialId)) {
          throw new Error(
            `GroundModel profile ${profile.id} references unknown material ${layer.materialId}.`,
          );
        }
      }
    }
    for (const section of normalizedSections) {
      for (const zone of section.zones) {
        if (!materialIds.has(zone.materialId)) {
          throw new Error(
            `GroundModel section ${section.id} references unknown material ${zone.materialId}.`,
          );
        }
      }
    }

    this.schemaVersion = GROUND_MODEL_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.materials = normalizedMaterials;
    this.profiles = normalizedProfiles;
    this.sections = normalizedSections;
    this.porePressureFields = normalizedFields;
    this.defaultProfileId = resolveDefaultId(
      normalizedProfiles,
      defaultProfileId,
      "profile",
    );
    this.defaultSectionId = resolveDefaultId(
      normalizedSections,
      defaultSectionId,
      "section",
    );
    this.defaultPorePressureFieldId = resolveDefaultId(
      normalizedFields,
      defaultPorePressureFieldId,
      "pore-pressure field",
    );
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      spatialModelDimension: normalizedSections.length > 0 ? "2d" : "1d",
    };
  }

  static fromGroundProfile({
    profile,
    id = null,
    name = null,
    sectionId = null,
    porePressureFieldId = null,
    minimumX = 0,
    maximumX = 1,
    metadata = {},
  } = {}) {
    if (!(profile instanceof GroundProfile)) {
      throw new Error("GroundModel.fromGroundProfile requires a GroundProfile.");
    }
    const section = GroundSection2D.fromGroundProfile({
      profile,
      id: sectionId,
      minimumX,
      maximumX,
    });
    const field = PorePressureField2D.fromGroundProfile({
      profile,
      id: porePressureFieldId,
    });
    return new GroundModel({
      id: id ?? `${profile.id}-ground-model`,
      name: name ?? `${profile.name} ground model`,
      materials: profile.materials,
      profiles: [profile],
      sections: [section],
      porePressureFields: [field],
      defaultProfileId: profile.id,
      defaultSectionId: section.id,
      defaultPorePressureFieldId: field.id,
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        ...structuredClone(metadata ?? {}),
        sourceProfileId: profile.id,
        conversion: "ground-model-from-ground-profile",
      },
    });
  }

  getMaterial(materialId) {
    const material = this.materials.find(({ id }) => id === materialId);
    if (!material) throw new Error(`Unknown GroundModel material: ${materialId}.`);
    return material;
  }

  getProfile(profileId = null) {
    return selectedById(
      this.profiles,
      profileId,
      this.defaultProfileId,
      "profile",
    );
  }

  getSection(sectionId = null) {
    return selectedById(
      this.sections,
      sectionId,
      this.defaultSectionId,
      "section",
    );
  }

  getPorePressureField(fieldId = null) {
    return selectedById(
      this.porePressureFields,
      fieldId,
      this.defaultPorePressureFieldId,
      "pore-pressure field",
    );
  }

  resolveZoneMaterial({ sectionId = null, x, z } = {}, options = {}) {
    const section = this.getSection(sectionId);
    if (!section) throw new Error("GroundModel contains no GroundSection2D.");
    const zone = section.getZoneAtPoint({ x, z }, options);
    if (!zone) return null;
    return {
      sectionId: section.id,
      zone,
      material: this.getMaterial(zone.materialId),
    };
  }

  porePressureAt({ fieldId = null, x, z } = {}) {
    const field = this.getPorePressureField(fieldId);
    if (!field) return 0;
    return field.porePressureAt({ x, z });
  }

  analysisContext({
    profileId = null,
    sectionId = null,
    porePressureFieldId = null,
  } = {}) {
    return {
      groundModelId: this.id,
      profile: this.getProfile(profileId),
      section: this.getSection(sectionId),
      porePressureField: this.getPorePressureField(porePressureFieldId),
      materials: [...this.materials],
    };
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      materials: this.materials.map((material) => material.toJSON()),
      profiles: this.profiles.map(profilePayload),
      sections: this.sections.map((section) => section.toJSON()),
      porePressureFields: this.porePressureFields.map((field) => field.toJSON()),
      defaultProfileId: this.defaultProfileId,
      defaultSectionId: this.defaultSectionId,
      defaultPorePressureFieldId: this.defaultPorePressureFieldId,
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
