import { SOIL_PARAMETER_BASES } from "./SoilMaterial.js";

export const SOIL_STRUCTURE_INTERFACE_SCHEMA_VERSION =
  "soil-structure-interface/v1";

export const SOIL_STRUCTURE_INTERFACE_MODELS = Object.freeze([
  "assigned-angle",
  "soil-friction-ratio",
]);

function normalizeAngle(value, units, label) {
  if (!Number.isFinite(Number(value))) throw new Error(`${label} must be finite.`);
  const normalizedUnits = String(units ?? "").trim().toLowerCase();
  const angle = normalizedUnits === "deg"
    ? Number(value) * Math.PI / 180
    : normalizedUnits === "rad"
      ? Number(value)
      : null;

  if (angle == null) {
    throw new Error(`${label} requires angleUnits equal to "deg" or "rad".`);
  }
  if (angle < 0 || angle >= Math.PI / 2) {
    throw new Error(`${label} must satisfy 0 <= delta < 90 degrees.`);
  }
  return angle;
}

function normalizeParameterSet(input, defaultAngleUnits, index) {
  const label = `parameterSets[${index}]`;
  if (!input?.id) throw new Error(`${label}.id is required.`);
  if (!SOIL_PARAMETER_BASES.includes(input.basis)) {
    throw new Error(`${label}.basis is unsupported: ${input.basis}.`);
  }

  const model = input.model;
  if (!SOIL_STRUCTURE_INTERFACE_MODELS.includes(model)) {
    throw new Error(`${label}.model is unsupported: ${model}.`);
  }

  let frictionAngle = null;
  let frictionRatio = null;
  if (model === "assigned-angle") {
    frictionAngle = normalizeAngle(
      input.frictionAngle,
      input.angleUnits ?? defaultAngleUnits,
      `${label}.frictionAngle`,
    );
  } else {
    frictionRatio = Number(input.frictionRatio);
    if (!Number.isFinite(frictionRatio) || frictionRatio < 0 || frictionRatio > 1) {
      throw new Error(`${label}.frictionRatio must satisfy 0 <= ratio <= 1.`);
    }
  }

  return {
    id: input.id,
    basis: input.basis,
    model,
    frictionAngle,
    frictionRatio,
    angleUnits: "rad",
    soilInterfaceClassId: input.soilInterfaceClassId ?? null,
    provenance: structuredClone(input.provenance ?? {}),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

export class SoilStructureInterface {
  constructor({
    id,
    name = null,
    wallSurface,
    parameterSets = [],
    defaultParameterSetId = null,
    angleUnits = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A SoilStructureInterface id is required.");
    if (!wallSurface?.typeId) {
      throw new Error("SoilStructureInterface wallSurface.typeId is required.");
    }
    if (!Array.isArray(parameterSets) || parameterSets.length === 0) {
      throw new Error("SoilStructureInterface requires at least one parameter set.");
    }

    const normalizedSets = parameterSets.map((parameterSet, index) =>
      normalizeParameterSet(parameterSet, angleUnits, index));
    const ids = normalizedSets.map(({ id: parameterSetId }) => parameterSetId);
    if (new Set(ids).size !== ids.length) {
      throw new Error("SoilStructureInterface parameter set ids must be unique.");
    }

    const resolvedDefault = defaultParameterSetId ??
      (normalizedSets.length === 1 ? normalizedSets[0].id : null);
    if (resolvedDefault != null && !ids.includes(resolvedDefault)) {
      throw new Error(
        `Unknown SoilStructureInterface default parameter set: ${resolvedDefault}.`,
      );
    }

    this.schemaVersion = SOIL_STRUCTURE_INTERFACE_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.wallSurface = {
      typeId: wallSurface.typeId,
      materialType: wallSurface.materialType ?? "custom",
      finish: wallSurface.finish ?? "custom",
      metadata: structuredClone(wallSurface.metadata ?? {}),
    };
    this.parameterSets = normalizedSets;
    this.defaultParameterSetId = resolvedDefault;
    this.metadata = structuredClone(metadata ?? {});
  }

  getParameterSet(parameterSetId = null) {
    const selectedId = parameterSetId ?? this.defaultParameterSetId;
    if (selectedId == null) {
      throw new Error(
        `SoilStructureInterface ${this.id} requires an explicit parameterSetId.`,
      );
    }
    const parameterSet = this.parameterSets.find(({ id }) => id === selectedId);
    if (!parameterSet) {
      throw new Error(
        `Unknown parameter set ${selectedId} for SoilStructureInterface ${this.id}.`,
      );
    }
    return parameterSet;
  }

  resolveFrictionAngle({
    soilFrictionAngles,
    parameterSetId = null,
  } = {}) {
    if (!Array.isArray(soilFrictionAngles) || soilFrictionAngles.length === 0) {
      throw new Error("soilFrictionAngles must contain at least one angle.");
    }
    const angles = soilFrictionAngles.map((value, index) => {
      const angle = Number(value);
      if (!Number.isFinite(angle) || angle < 0 || angle >= Math.PI / 2) {
        throw new Error(
          `soilFrictionAngles[${index}] must satisfy 0 <= phi < pi/2.`,
        );
      }
      return angle;
    });
    const governingSoilFrictionAngle = Math.min(...angles);
    const parameterSet = this.getParameterSet(parameterSetId);
    const nominalFrictionAngle = parameterSet.model === "assigned-angle"
      ? parameterSet.frictionAngle
      : parameterSet.frictionRatio * governingSoilFrictionAngle;
    const frictionAngle = Math.min(
      nominalFrictionAngle,
      governingSoilFrictionAngle,
    );

    return {
      interfaceId: this.id,
      parameterSetId: parameterSet.id,
      parameterBasis: parameterSet.basis,
      model: parameterSet.model,
      wallSurface: structuredClone(this.wallSurface),
      soilInterfaceClassId: parameterSet.soilInterfaceClassId,
      frictionAngle,
      nominalFrictionAngle,
      frictionRatio: parameterSet.frictionRatio,
      governingSoilFrictionAngle,
      cappedBySoilFriction:
        nominalFrictionAngle > governingSoilFrictionAngle + 1e-14,
      provenance: structuredClone(parameterSet.provenance),
      metadata: structuredClone(parameterSet.metadata),
      units: { angle: "rad" },
    };
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      wallSurface: structuredClone(this.wallSurface),
      parameterSets: structuredClone(this.parameterSets),
      defaultParameterSetId: this.defaultParameterSetId,
      metadata: structuredClone(this.metadata),
    };
  }
}
