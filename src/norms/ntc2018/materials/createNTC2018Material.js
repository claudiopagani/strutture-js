import { ConcreteMaterial } from "../../../domain/materials/ConcreteMaterial.js";
import { ExistingMasonryMaterial } from "../../../domain/materials/ExistingMasonryMaterial.js";
import { NTC2018ExistingMasonryMaterial } from "../../../domain/materials/NTC2018ExistingMasonryMaterial.js";
import { GlulamTimberMaterial } from "../../../domain/materials/GlulamTimberMaterial.js";
import { SolidTimberMaterial } from "../../../domain/materials/SolidTimberMaterial.js";
import { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import { TimberMaterial } from "../../../domain/materials/TimberMaterial.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  NTC2018_CONCRETE_CLASSES,
  NTC2018_EXISTING_MASONRY_KNOWLEDGE_LEVELS,
  NTC2018_REINFORCEMENT_STEEL_GRADES,
  NTC2018_STRUCTURAL_STEEL_GRADES,
  NTC2018_TIMBER_STRENGTH_CLASSES,
} from "./ntc2018MaterialCatalogs.js";

const NTC2018_REFERENCE = "DM 17/01/2018 - NTC 2018";
const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

const round = (value, decimals = 2) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

const assertCatalogEntry = (catalog, key, message) => {
  const entry = catalog[key];

  if (!entry) {
    throw new Error(message);
  }

  return entry;
};

export function createNTC2018ConcreteMaterial({
  strengthClass,
  id = strengthClass,
  name = `Calcestruzzo ${strengthClass}`,
  density = null,
  gammaC = 1.5,
  alphaCc = 0.85,
  units = null,
  metadata = {},
}) {
  assertExplicitUnitSystem(units, "createNTC2018ConcreteMaterial");
  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const preset = assertCatalogEntry(
    NTC2018_CONCRETE_CLASSES,
    strengthClass,
    `Unsupported NTC 2018 concrete class: ${strengthClass}.`,
  );

  const fcm = preset.fck + 8;
  const ecm = 22000 * (fcm / 10) ** 0.3;
  const fctm = preset.fck <= 50
    ? 0.3 * preset.fck ** (2 / 3)
    : 2.12 * Math.log(1 + fcm / 10);

  return new ConcreteMaterial({
    id,
    name,
    strengthClass,
    density:
      density == null
        ? (preset.concreteType === "lightweight" ? 2000 : 2500)
        : unitResolver.volumeLoad(density),
    elasticModulus: round(ecm, 0),
    fck: preset.fck,
    fcd: round((alphaCc * preset.fck) / gammaC, 2),
    fctm: round(fctm, 2),
    units: INTERNAL_UNITS,
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
      ntcReference: NTC2018_REFERENCE,
      gammaC,
      alphaCc,
      concreteType: preset.concreteType ?? "normal-weight",
      rck: preset.rck,
      fcm: round(fcm, 2),
    },
  });
}

export function createNTC2018ReinforcementSteelMaterial({
  grade = "B450C",
  id = grade,
  name = `Acciaio per c.a. ${grade}`,
  gammaS = 1.15,
  density = 7850,
  elasticModulus = null,
  units = null,
  metadata = {},
}) {
  assertExplicitUnitSystem(units, "createNTC2018ReinforcementSteelMaterial");
  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const preset = assertCatalogEntry(
    NTC2018_REINFORCEMENT_STEEL_GRADES,
    grade,
    `Unsupported NTC 2018 reinforcement steel grade: ${grade}.`,
  );

  return new SteelMaterial({
    id,
    name,
    grade,
    density: unitResolver.volumeLoad(density),
    elasticModulus: elasticModulus == null ? 210000 : unitResolver.stress(elasticModulus),
    fyk: preset.fyk,
    fyd: round(preset.fyk / gammaS, 2),
    ftk: preset.ftk,
    ductilityClass: preset.ductilityClass,
    units: INTERNAL_UNITS,
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
      ntcReference: NTC2018_REFERENCE,
      steelUse: "reinforcement",
      gammaS,
    },
  });
}

export function createNTC2018StructuralSteelMaterial({
  grade = "S235",
  id = grade,
  name = `Acciaio carpenteria ${grade}`,
  gammaM0 = 1.05,
  density = 7850,
  elasticModulus = null,
  units = null,
  metadata = {},
}) {
  assertExplicitUnitSystem(units, "createNTC2018StructuralSteelMaterial");
  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const preset = assertCatalogEntry(
    NTC2018_STRUCTURAL_STEEL_GRADES,
    grade,
    `Unsupported NTC 2018 structural steel grade: ${grade}.`,
  );

  return new SteelMaterial({
    id,
    name,
    grade,
    density: unitResolver.volumeLoad(density),
    elasticModulus: elasticModulus == null ? 210000 : unitResolver.stress(elasticModulus),
    fyk: preset.fyk,
    fyd: round(preset.fyk / gammaM0, 2),
    ftk: preset.ftk,
    units: INTERNAL_UNITS,
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
      ntcReference: NTC2018_REFERENCE,
      steelUse: "structural",
      gammaM0,
      thicknessAssumption: "valori caratteristici assunti per spessori ordinari",
    },
  });
}

export function createNTC2018TimberMaterial({
  strengthClass,
  id = strengthClass,
  name = `Legno ${strengthClass}`,
  gammaM = 1.5,
  serviceClass = 1,
  kmod = 0.8,
  units = null,
  metadata = {},
}) {
  assertExplicitUnitSystem(units, "createNTC2018TimberMaterial");
  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const preset = assertCatalogEntry(
    NTC2018_TIMBER_STRENGTH_CLASSES,
    strengthClass,
    `Unsupported NTC 2018 timber strength class: ${strengthClass}.`,
  );

  const timberPayload = {
    id,
    name,
    strengthClass,
    density: unitResolver.volumeLoad(preset.density),
    elasticModulus: preset.meanElasticModulus,
    e0_05: preset.e0_05 ?? preset.meanElasticModulus * (2 / 3),
    timberType: preset.timberType,
    productStandard: preset.productStandard,
    strengthStandard: preset.strengthStandard,
    serviceClass,
    kmod,
    units: INTERNAL_UNITS,
    fmK: preset.fmK,
    fc0K: preset.fc0K,
    ft0K: preset.ft0K,
    fvK: preset.fvK ?? null,
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
      ntcReference: NTC2018_REFERENCE,
      family: preset.timberType,
      timberType: preset.timberType,
      glulamType: preset.glulamType,
      productStandard: preset.productStandard,
      strengthStandard: preset.strengthStandard,
      e0_05: round(preset.e0_05 ?? preset.meanElasticModulus * (2 / 3), 2),
      e0_05Source:
        preset.e0_05 != null
          ? "strength-class-catalog"
          : "mean-elastic-modulus-ratio-2/3",
      gammaM,
      fmD: round((kmod * preset.fmK) / gammaM, 2),
      fc0D: round((kmod * preset.fc0K) / gammaM, 2),
      ft0D: round((kmod * preset.ft0K) / gammaM, 2),
      fvD: preset.fvK != null ? round((kmod * preset.fvK) / gammaM, 2) : null,
    },
  };

  if (preset.timberType === "solid-timber") {
    return new SolidTimberMaterial({
      ...timberPayload,
      gradingMethod: preset.gradingMethod,
    });
  }

  if (preset.timberType === "glulam") {
    return new GlulamTimberMaterial({
      ...timberPayload,
      glulamType: preset.glulamType,
    });
  }

  return new TimberMaterial(timberPayload);
}

export function createNTC2018ExistingMasonryMaterial({
  knowledgeLevel = "LC1",
  baseProperties = {},
  surveyFactors = {},
  improvementFactors = {},
  masonryTypology = null,
  masonryTypologyId = null,
  parameterLevel = null,
  modifierSelections = {},
  units = null,
  metadata = {},
  ...rest
}) {
  assertExplicitUnitSystem(units, "createNTC2018ExistingMasonryMaterial");
  const preset = assertCatalogEntry(
    NTC2018_EXISTING_MASONRY_KNOWLEDGE_LEVELS,
    knowledgeLevel,
    `Unsupported NTC 2018 knowledge level: ${knowledgeLevel}.`,
  );

  const sharedMetadata = {
    ...metadata,
    normativePreset: "NTC2018",
    ntcReference: `${NTC2018_REFERENCE}; Circolare 21/01/2019 n. 7`,
    knowledgeLevelDescription: preset.description,
  };

  if (masonryTypology != null || masonryTypologyId != null || rest.masonryType != null) {
    return new NTC2018ExistingMasonryMaterial({
      knowledgeLevel,
      confidenceFactor: preset.confidenceFactor,
      masonryTypology,
      masonryTypologyId,
      parameterLevel,
      modifierSelections,
      surveyFactors,
      improvementFactors,
      units: INTERNAL_UNITS,
      metadata: sharedMetadata,
      ...rest,
    });
  }

  return new ExistingMasonryMaterial({
    knowledgeLevel,
    confidenceFactor: preset.confidenceFactor,
    baseProperties,
    surveyFactors,
    improvementFactors,
    units,
    metadata: sharedMetadata,
    ...rest,
  });
}
