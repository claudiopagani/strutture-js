import { assertExplicitUnitSystem } from "../units/UnitSystem.js";
import { GroundModel } from "./GroundModel.js";
import {
  GEOTECHNICAL_INTERNAL_UNITS,
  SOIL_PARAMETER_BASES,
} from "./SoilMaterial.js";

export const GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION =
  "geotechnical-design-situation/v1";

export const GEOTECHNICAL_DESIGN_SITUATION_TYPES = Object.freeze([
  "persistent",
  "transient",
  "accidental",
  "seismic",
]);

export const GEOTECHNICAL_TIME_CONDITIONS = Object.freeze([
  "short-term",
  "long-term",
  "not-specified",
]);

export const GEOTECHNICAL_DRAINAGE_CONDITIONS = Object.freeze([
  "drained",
  "undrained",
  "mixed",
]);

export const GEOTECHNICAL_LIMIT_STATES = Object.freeze([
  "ULS",
  "SLS",
  "ALS",
  "not-specified",
]);

export const GEOTECHNICAL_SEISMIC_MODELS = Object.freeze([
  "none",
  "pseudostatic",
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function normalizeStringMap(value, label) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object map.`);
  }
  return Object.fromEntries(Object.entries(value).map(([key, selected]) => {
    if (!key || typeof selected !== "string" || !selected) {
      throw new Error(`${label} must map non-empty ids to non-empty ids.`);
    }
    return [key, selected];
  }));
}

function normalizeSeismic(seismic, situationType) {
  const model = seismic?.model ?? "none";
  if (!GEOTECHNICAL_SEISMIC_MODELS.includes(model)) {
    throw new Error(`Unsupported geotechnical seismic model: ${model}.`);
  }
  if (situationType === "seismic" && model === "none") {
    throw new Error(
      "A seismic GeotechnicalDesignSituation requires an explicit seismic model.",
    );
  }
  if (model === "none") {
    return { model: "none", metadata: structuredClone(seismic?.metadata ?? {}) };
  }

  const kh = finite(seismic.kh, "seismic.kh");
  const kv = finite(seismic.kv ?? 0, "seismic.kv");
  if (kh < 0) throw new Error("seismic.kh must be non-negative.");
  if (kv <= -1 || kv >= 1) {
    throw new Error("seismic.kv must satisfy -1 < kv < 1.");
  }
  return {
    model,
    kh,
    kv,
    verticalConvention: seismic.verticalConvention ??
      "positive-kv-reduces-effective-gravity-through-factor-1-minus-kv",
    metadata: structuredClone(seismic.metadata ?? {}),
  };
}

function selectedZone(groundModel, sectionId, zoneId) {
  if (!zoneId) return null;
  const section = groundModel.getSection(sectionId);
  if (!section) throw new Error("A GroundSection2D is required for zone selection.");
  const zone = section.zones.find(({ id }) => id === zoneId);
  if (!zone) {
    throw new Error(`Unknown zone ${zoneId} in GroundSection2D ${section.id}.`);
  }
  return zone;
}

function selectedLayer(groundModel, profileId, layerId) {
  if (!layerId) return null;
  const profile = groundModel.getProfile(profileId);
  if (!profile) throw new Error("A GroundProfile is required for layer selection.");
  const layer = profile.layers.find(({ id }) => id === layerId);
  if (!layer) {
    throw new Error(`Unknown layer ${layerId} in GroundProfile ${profile.id}.`);
  }
  return layer;
}

export class GeotechnicalDesignSituation {
  constructor({
    id,
    name = null,
    groundModelId = null,
    groundModel = null,
    situationType = "persistent",
    limitState = "not-specified",
    timeCondition = "not-specified",
    drainageCondition = "mixed",
    requiredParameterBasis = null,
    profileId = null,
    sectionId = null,
    porePressureFieldId = null,
    constructionStageId = null,
    parameterSelection = {},
    allowIndicativeValues = false,
    seismic = null,
    normativeContext = {},
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A GeotechnicalDesignSituation id is required.");
    assertExplicitUnitSystem(units, "GeotechnicalDesignSituation");
    if (!GEOTECHNICAL_DESIGN_SITUATION_TYPES.includes(situationType)) {
      throw new Error(`Unsupported geotechnical situation type: ${situationType}.`);
    }
    if (!GEOTECHNICAL_LIMIT_STATES.includes(limitState)) {
      throw new Error(`Unsupported geotechnical limit state: ${limitState}.`);
    }
    if (!GEOTECHNICAL_TIME_CONDITIONS.includes(timeCondition)) {
      throw new Error(`Unsupported geotechnical time condition: ${timeCondition}.`);
    }
    if (!GEOTECHNICAL_DRAINAGE_CONDITIONS.includes(drainageCondition)) {
      throw new Error(
        `Unsupported geotechnical drainage condition: ${drainageCondition}.`,
      );
    }
    if (
      requiredParameterBasis != null &&
      !SOIL_PARAMETER_BASES.includes(requiredParameterBasis)
    ) {
      throw new Error(
        `Unsupported requiredParameterBasis: ${requiredParameterBasis}.`,
      );
    }
    if (groundModel != null && !(groundModel instanceof GroundModel)) {
      throw new Error("groundModel must be a GroundModel instance.");
    }
    const resolvedGroundModelId = groundModelId ?? groundModel?.id ?? null;
    if (!resolvedGroundModelId) {
      throw new Error("GeotechnicalDesignSituation groundModelId is required.");
    }
    if (groundModel && groundModel.id !== resolvedGroundModelId) {
      throw new Error("groundModelId does not match the supplied GroundModel.");
    }

    this.schemaVersion = GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.groundModelId = resolvedGroundModelId;
    this.situationType = situationType;
    this.limitState = limitState;
    this.timeCondition = timeCondition;
    this.drainageCondition = drainageCondition;
    this.requiredParameterBasis = requiredParameterBasis;
    this.spatialSelection = {
      profileId,
      sectionId,
      porePressureFieldId,
    };
    this.constructionStageId = constructionStageId;
    this.parameterSelection = {
      byMaterial: normalizeStringMap(
        parameterSelection.byMaterial,
        "parameterSelection.byMaterial",
      ),
      byZone: normalizeStringMap(
        parameterSelection.byZone,
        "parameterSelection.byZone",
      ),
      byLayer: normalizeStringMap(
        parameterSelection.byLayer,
        "parameterSelection.byLayer",
      ),
      byInterface: normalizeStringMap(
        parameterSelection.byInterface,
        "parameterSelection.byInterface",
      ),
    };
    this.allowIndicativeValues = Boolean(allowIndicativeValues);
    this.seismic = normalizeSeismic(seismic, situationType);
    this.normativeContext = structuredClone(normativeContext ?? {});
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
    };

    if (groundModel) this.validateAgainst(groundModel);
  }

  validateAgainst(groundModel) {
    if (!(groundModel instanceof GroundModel)) {
      throw new Error("validateAgainst requires a GroundModel.");
    }
    if (groundModel.id !== this.groundModelId) {
      throw new Error(
        `Design situation ${this.id} references GroundModel ${this.groundModelId}, not ${groundModel.id}.`,
      );
    }
    const { profileId, sectionId, porePressureFieldId } = this.spatialSelection;
    if (profileId != null) groundModel.getProfile(profileId);
    if (sectionId != null) groundModel.getSection(sectionId);
    if (porePressureFieldId != null) {
      groundModel.getPorePressureField(porePressureFieldId);
    }

    for (const [materialId, parameterSetId] of Object.entries(
      this.parameterSelection.byMaterial,
    )) {
      groundModel.getMaterial(materialId).getParameterSet(parameterSetId);
    }
    for (const [zoneId, parameterSetId] of Object.entries(
      this.parameterSelection.byZone,
    )) {
      const zone = selectedZone(groundModel, sectionId, zoneId);
      groundModel.getMaterial(zone.materialId).getParameterSet(parameterSetId);
    }
    for (const [layerId, parameterSetId] of Object.entries(
      this.parameterSelection.byLayer,
    )) {
      const layer = selectedLayer(groundModel, profileId, layerId);
      groundModel.getMaterial(layer.materialId).getParameterSet(parameterSetId);
    }
    return true;
  }

  resolveParameterSet({
    groundModel,
    materialId = null,
    zoneId = null,
    layerId = null,
  } = {}) {
    this.validateAgainst(groundModel);
    const { profileId, sectionId } = this.spatialSelection;
    const zone = selectedZone(groundModel, sectionId, zoneId);
    const layer = selectedLayer(groundModel, profileId, layerId);
    const resolvedMaterialId = materialId ?? zone?.materialId ?? layer?.materialId;
    if (!resolvedMaterialId) {
      throw new Error("Parameter resolution requires materialId, zoneId or layerId.");
    }
    if (zone && zone.materialId !== resolvedMaterialId) {
      throw new Error(`Zone ${zone.id} does not use material ${resolvedMaterialId}.`);
    }
    if (layer && layer.materialId !== resolvedMaterialId) {
      throw new Error(`Layer ${layer.id} does not use material ${resolvedMaterialId}.`);
    }
    const material = groundModel.getMaterial(resolvedMaterialId);

    const candidates = [
      zone && {
        id: this.parameterSelection.byZone[zone.id],
        source: "zone",
        sourceId: zone.id,
      },
      layer && {
        id: this.parameterSelection.byLayer[layer.id],
        source: "layer",
        sourceId: layer.id,
      },
      {
        id: this.parameterSelection.byMaterial[material.id],
        source: "material",
        sourceId: material.id,
      },
      {
        id: material.defaultParameterSetId,
        source: "material-default",
        sourceId: material.id,
      },
    ].filter((candidate) => candidate?.id != null);
    if (candidates.length === 0) {
      throw new Error(
        `No parameter set is selected for material ${material.id} in design situation ${this.id}.`,
      );
    }
    const selected = candidates[0];
    const parameterSet = material.getParameterSet(selected.id);
    if (
      this.drainageCondition !== "mixed" &&
      parameterSet.drainage !== this.drainageCondition
    ) {
      throw new Error(
        `Parameter set ${parameterSet.id} is ${parameterSet.drainage}, but design situation ${this.id} requires ${this.drainageCondition}.`,
      );
    }
    if (
      this.requiredParameterBasis != null &&
      parameterSet.basis !== this.requiredParameterBasis
    ) {
      throw new Error(
        `Parameter set ${parameterSet.id} has basis ${parameterSet.basis}, but ${this.requiredParameterBasis} is required.`,
      );
    }
    if (parameterSet.basis === "indicative" && !this.allowIndicativeValues) {
      throw new Error(
        `Indicative parameter set ${parameterSet.id} is not authorized by design situation ${this.id}.`,
      );
    }

    return {
      groundModelId: groundModel.id,
      designSituationId: this.id,
      materialId: material.id,
      zoneId: zone?.id ?? null,
      layerId: layer?.id ?? null,
      parameterSetId: parameterSet.id,
      selectionSource: selected.source,
      selectionSourceId: selected.sourceId,
      parameterSet: structuredClone(parameterSet),
      warnings: parameterSet.basis === "indicative"
        ? ["An indicative parameter set was explicitly authorized."]
        : [],
    };
  }

  resolveInterfaceParameterSetId(interfaceId) {
    if (!interfaceId) throw new Error("interfaceId is required.");
    return this.parameterSelection.byInterface[interfaceId] ?? null;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      groundModelId: this.groundModelId,
      situationType: this.situationType,
      limitState: this.limitState,
      timeCondition: this.timeCondition,
      drainageCondition: this.drainageCondition,
      requiredParameterBasis: this.requiredParameterBasis,
      profileId: this.spatialSelection.profileId,
      sectionId: this.spatialSelection.sectionId,
      porePressureFieldId: this.spatialSelection.porePressureFieldId,
      constructionStageId: this.constructionStageId,
      parameterSelection: structuredClone(this.parameterSelection),
      allowIndicativeValues: this.allowIndicativeValues,
      seismic: structuredClone(this.seismic),
      normativeContext: structuredClone(this.normativeContext),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}

