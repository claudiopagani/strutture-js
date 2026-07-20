import { SoilStructureInterface } from
  "../domain/geotechnics/SoilStructureInterface.js";

const USACE_REFERENCE =
  "USACE EM 1110-2-2502 (2022), table 6.2, recommended design values for interface friction angle";
const USACE_REFERENCE_URL =
  "https://www.publications.usace.army.mil/Portals/76/Users/182/86/2486/EM%201110-2-2502.pdf";

const surfaceEntries = [
  ["pvc-smooth", "PVC, smooth", "pvc", "smooth", "smooth"],
  [
    "painted-steel-smooth",
    "Painted steel, smooth",
    "steel",
    "painted-smooth",
    "smooth",
  ],
  ["rough-steel", "Rough steel", "steel", "rough", "rough-formed"],
  [
    "formed-concrete",
    "Formed concrete",
    "concrete",
    "formed",
    "rough-formed",
  ],
  [
    "rough-concrete-cast-against-ground",
    "Rough concrete cast against ground",
    "concrete",
    "rough-cast-against-ground",
    "rough-cast",
  ],
  ["masonry-custom", "Masonry, project-defined surface", "masonry", "custom", null],
  ["timber-custom", "Timber, project-defined surface", "timber", "custom", null],
  ["custom", "Custom wall surface", "custom", "custom", null],
];

export const WALL_SURFACE_TYPE_CATALOG = Object.freeze(Object.fromEntries(
  surfaceEntries.map(([id, name, materialType, finish, usaceColumn]) => [
    id,
    Object.freeze({
      id,
      name,
      materialType,
      finish,
      usaceColumn,
      references: usaceColumn == null ? [] : [USACE_REFERENCE],
      referenceUrls: usaceColumn == null ? [] : [USACE_REFERENCE_URL],
      catalogProvidesInterfaceValues: usaceColumn != null,
    }),
  ]),
));

const soilEntries = [
  ["clean-gravel", "Clean gravel or gravel-sand mixture", [6, 20], [14, 20, 28]],
  ["coarse-clean-sand", "Coarse clean sand", [2, 6], [14, 22, 28]],
  ["medium-sand", "Medium sand", [0.5, 2], [14, 24, 28]],
  ["fine-sand", "Fine sand or soil mixed with silt/clay", [0.2, 0.5], [14, 26, 28]],
  [
    "fine-sandy-silt",
    "Fine sandy silt to nonplastic silt",
    [0.075, 0.2],
    [14, 28, 28],
  ],
];

export const SOIL_INTERFACE_CLASS_CATALOG = Object.freeze({
  ...Object.fromEntries(soilEntries.map(([id, name, d50RangeMm, angles]) => [
    id,
    Object.freeze({
      id,
      name,
      d50RangeMm: Object.freeze([...d50RangeMm]),
      recommendationModel: "assigned-angle",
      valuesByUsaceColumn: Object.freeze({
        smooth: angles[0],
        "rough-formed": angles[1],
        "rough-cast": angles[2],
      }),
      units: { angle: "deg", d50: "mm" },
      reference: USACE_REFERENCE,
    }),
  ])),
  "plastic-silt-or-clay": Object.freeze({
    id: "plastic-silt-or-clay",
    name: "Plastic silt or clay",
    d50RangeMm: Object.freeze([0, 0.075]),
    recommendationModel: "soil-friction-ratio",
    valuesByUsaceColumn: Object.freeze({
      smooth: 0.25,
      "rough-formed": 0.5,
      "rough-cast": 0.8,
    }),
    units: { ratio: "dimensionless", d50: "mm" },
    reference: USACE_REFERENCE,
  }),
  rock: Object.freeze({
    id: "rock",
    name: "Rock",
    d50RangeMm: null,
    recommendationModel: "soil-friction-ratio",
    valuesByUsaceColumn: Object.freeze({ "rough-cast": 0.8 }),
    units: { ratio: "dimensionless" },
    reference: USACE_REFERENCE,
  }),
});

export const WALL_SURFACE_TYPE_IDS = Object.freeze(
  Object.keys(WALL_SURFACE_TYPE_CATALOG),
);
export const SOIL_INTERFACE_CLASS_IDS = Object.freeze(
  Object.keys(SOIL_INTERFACE_CLASS_CATALOG),
);

export function getWallSurfaceTypeData(wallSurfaceTypeId) {
  const entry = WALL_SURFACE_TYPE_CATALOG[wallSurfaceTypeId];
  if (!entry) throw new Error(`Unknown wall surface type: ${wallSurfaceTypeId}.`);
  return structuredClone(entry);
}

export function listWallSurfaceTypes() {
  return WALL_SURFACE_TYPE_IDS.map(getWallSurfaceTypeData);
}

export function getSoilInterfaceClassData(soilInterfaceClassId) {
  const entry = SOIL_INTERFACE_CLASS_CATALOG[soilInterfaceClassId];
  if (!entry) {
    throw new Error(`Unknown soil interface class: ${soilInterfaceClassId}.`);
  }
  return structuredClone(entry);
}

export function listSoilInterfaceClasses() {
  return SOIL_INTERFACE_CLASS_IDS.map(getSoilInterfaceClassData);
}

export function getUSACE2022InterfaceRecommendation({
  wallSurfaceTypeId,
  soilInterfaceClassId,
} = {}) {
  const wallSurface = getWallSurfaceTypeData(wallSurfaceTypeId);
  const soilClass = getSoilInterfaceClassData(soilInterfaceClassId);
  if (wallSurface.usaceColumn == null) {
    throw new Error(
      `Wall surface ${wallSurfaceTypeId} requires an explicit project interface parameter.`,
    );
  }
  const value = soilClass.valuesByUsaceColumn[wallSurface.usaceColumn];
  if (value == null) {
    throw new Error(
      `USACE table 6.2 has no recommendation for ${soilInterfaceClassId} against ${wallSurfaceTypeId}.`,
    );
  }

  return {
    wallSurfaceTypeId,
    soilInterfaceClassId,
    model: soilClass.recommendationModel,
    value,
    angleUnits: soilClass.recommendationModel === "assigned-angle"
      ? "deg"
      : null,
    basis: "indicative",
    provenance: {
      source: USACE_REFERENCE,
      sourceUrl: USACE_REFERENCE_URL,
      table: "6.2",
      sourceKind: "recommended-design-value",
    },
    metadata: {
      cappedBySoilFrictionInResolution: true,
      requiresProjectAuthorization: true,
    },
  };
}

export function createSoilStructureInterfaceFromWallSurface({
  id,
  name = null,
  wallSurfaceTypeId,
  soilInterfaceClassId,
  parameterSetId = "usace-2022-table-6-2",
  metadata = {},
} = {}) {
  const wallSurface = getWallSurfaceTypeData(wallSurfaceTypeId);
  const recommendation = getUSACE2022InterfaceRecommendation({
    wallSurfaceTypeId,
    soilInterfaceClassId,
  });
  const parameterSet = {
    id: parameterSetId,
    basis: recommendation.basis,
    model: recommendation.model,
    soilInterfaceClassId,
    provenance: recommendation.provenance,
    metadata: recommendation.metadata,
  };
  if (recommendation.model === "assigned-angle") {
    parameterSet.frictionAngle = recommendation.value;
    parameterSet.angleUnits = recommendation.angleUnits;
  } else {
    parameterSet.frictionRatio = recommendation.value;
  }

  return new SoilStructureInterface({
    id,
    name,
    wallSurface: {
      typeId: wallSurface.id,
      materialType: wallSurface.materialType,
      finish: wallSurface.finish,
      metadata: { catalogEntry: wallSurface.id },
    },
    parameterSets: [parameterSet],
    defaultParameterSetId: parameterSetId,
    metadata: {
      ...structuredClone(metadata ?? {}),
      catalogEntryId: wallSurface.id,
      catalogRecommendationIsIndicative: true,
    },
  });
}
