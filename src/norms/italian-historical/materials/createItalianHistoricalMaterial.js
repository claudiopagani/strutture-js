import { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  characteristicValueFromExistingMean,
  resolveExistingMaterialState,
} from "../../../domain/materials/existingMaterialConfidence.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES,
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS,
} from "./historicalReinforcementSteelCatalogs.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const HISTORICAL_REINFORCEMENT_ELONGATION_CHARACTERISTIC = 0.075;
const round = (value, decimals = 2) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function assertCatalogEntry(catalog, key, message) {
  const entry = catalog[key];

  if (!entry) {
    throw new Error(message);
  }

  return entry;
}

export function createItalianHistoricalReinforcementSteelMaterial({
  grade,
  id = grade,
  name = `Acciaio per c.a. ${grade}`,
  gammaS = 1.15,
  density = 7850,
  elasticModulus = null,
  existing = false,
  knowledgeLevel = "LC1",
  confidenceFactor = null,
  yieldMeanStrength = null,
  ultimateMeanStrength = null,
  units = null,
  metadata = {},
}) {
  assertExplicitUnitSystem(units, "createItalianHistoricalReinforcementSteelMaterial");
  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const preset = assertCatalogEntry(
    ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES,
    grade,
    `Unsupported Italian historical reinforcement steel grade: ${grade}.`,
  );
  const standard =
    ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS[preset.standardId];
  const existingState = resolveExistingMaterialState({
    existing,
    knowledgeLevel,
    confidenceFactor,
  });
  const fyMean = yieldMeanStrength == null
    ? preset.fyk
    : unitResolver.stress(yieldMeanStrength);
  const ftMean = ultimateMeanStrength == null
    ? preset.ftk
    : unitResolver.stress(ultimateMeanStrength);
  const fyk = existingState.existing
    ? characteristicValueFromExistingMean(fyMean, existingState.confidenceFactor)
    : preset.fyk;
  const ftk = existingState.existing
    ? characteristicValueFromExistingMean(ftMean, existingState.confidenceFactor)
    : preset.ftk;

  return new SteelMaterial({
    id,
    name,
    grade,
    density: unitResolver.volumeLoad(density),
    elasticModulus: elasticModulus == null ? 210000 : unitResolver.stress(elasticModulus),
    fyMean: existingState.existing ? round(fyMean, 2) : null,
    ftMean: existingState.existing ? round(ftMean, 2) : null,
    fyk: round(fyk, 2),
    fyd: round(fyk / gammaS, 2),
    ftk: round(ftk, 2),
    elongationCharacteristic: HISTORICAL_REINFORCEMENT_ELONGATION_CHARACTERISTIC,
    existing: existingState.existing,
    knowledgeLevel: existingState.knowledgeLevel ?? knowledgeLevel,
    confidenceFactor: existingState.confidenceFactor,
    units: INTERNAL_UNITS,
    metadata: {
      ...metadata,
      normativePreset: "ITALIAN_HISTORICAL_REINFORCEMENT",
      standardId: preset.standardId,
      standardReference: preset.standardReference,
      normativeReference: preset.standardReference,
      standardTitle: standard?.title ?? null,
      steelUse: "reinforcement",
      gammaS,
      elongationCharacteristic: HISTORICAL_REINFORCEMENT_ELONGATION_CHARACTERISTIC,
      elongationCharacteristicPermille: round(
        HISTORICAL_REINFORCEMENT_ELONGATION_CHARACTERISTIC * 1000,
        2,
      ),
      ultimateStrain: round(
        0.9 * HISTORICAL_REINFORCEMENT_ELONGATION_CHARACTERISTIC,
        6,
      ),
      existingMaterial: existingState.existing,
      knowledgeLevel: existingState.knowledgeLevel,
      knowledgeLevelDescription: existingState.knowledgeLevelDescription,
      confidenceFactor: existingState.confidenceFactor,
      characteristicStrengthSource: existingState.existing
        ? "mean-divided-by-confidence-factor"
        : "catalog-characteristic",
    },
  });
}
