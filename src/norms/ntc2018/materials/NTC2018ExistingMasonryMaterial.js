import { ExistingMasonryMaterial } from "../../../domain/materials/ExistingMasonryMaterial.js";
import {
  NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS,
  NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS,
  getTabulatedMechanicalProperties,
  resolveMasonryTypology,
} from "./ntc2018ExistingMasonryCatalogs.js";

const round = (value, decimals = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

const clone = (value) => JSON.parse(JSON.stringify(value));

const STATE_OF_FACT_MODIFIER_IDS = [1, 2, 3];
const IMPROVEMENT_MODIFIER_IDS = [4, 5, 6, 7, 8];
const KNOWLEDGE_TO_PARAMETER_LEVEL = {
  LC1: 1,
  LC2: 2,
  LC3: 2,
};

const applyMechanicalMultipliers = (properties, multipliers) => ({
  fm: round(properties.fm * multipliers.resistenzaCompressione),
  tau0: round(properties.tau0 * multipliers.resistenzaTaglio),
  fv0:
    properties.fv0 == null
      ? undefined
      : round(properties.fv0 * multipliers.resistenzaTaglio),
  E: round(properties.E * multipliers.moduliElastici),
  G: round(properties.G * multipliers.moduliElastici),
  w: properties.w,
});

const normalizeParameterLevel = ({ parameterLevel, knowledgeLevel }) => {
  if (parameterLevel != null) {
    const normalized = Number(parameterLevel);

    if (NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS[normalized]) {
      return normalized;
    }

    throw new Error(
      "parameterLevel deve assumere valore 1 oppure 2 per i parametri tabellati di muratura esistente.",
    );
  }

  return KNOWLEDGE_TO_PARAMETER_LEVEL[knowledgeLevel] ?? 2;
};

const getModifierValue = ({ selection, availableModifier }) => {
  if (!selection?.selected) {
    return 1;
  }

  return selection.value ?? availableModifier.value ?? 1;
};

export class NTC2018ExistingMasonryMaterial extends ExistingMasonryMaterial {
  constructor({
    masonryTypology,
    masonryTypologyId,
    masonryType,
    parameterLevel = null,
    knowledgeLevel = "LC2",
    confidenceFactor = 1,
    modifierSelections = {},
    surveyFactors,
    improvementFactors,
    metadata = {},
    id = null,
    name = null,
    conditionLevel = "existing",
    testResults = [],
    interventions = [],
    ...rest
  }) {
    const resolvedTypology = resolveMasonryTypology(
      masonryTypologyId ?? masonryTypology ?? masonryType,
    );

    if (!resolvedTypology) {
      throw new Error(
        "Tipologia muraria NTC 2018 non riconosciuta. Passare masonryTypologyId oppure il nome completo della tipologia.",
      );
    }

    const resolvedParameterLevel = normalizeParameterLevel({
      parameterLevel,
      knowledgeLevel,
    });
    const selectedModifiers = {
      ...NTC2018ExistingMasonryMaterial.mergeLegacySelections(
        surveyFactors,
        improvementFactors,
      ),
      ...clone(modifierSelections),
    };
    const availableModifiers = NTC2018ExistingMasonryMaterial.buildAvailableModifiers(
      resolvedTypology,
      selectedModifiers,
    );

    NTC2018ExistingMasonryMaterial.validateModifierSelections(
      selectedModifiers,
      availableModifiers,
    );

    const baseProperties = getTabulatedMechanicalProperties(
      resolvedTypology,
      resolvedParameterLevel,
    );
    const stateOfFactMultipliers =
      NTC2018ExistingMasonryMaterial.computeStateOfFactMultipliers(
        availableModifiers,
        selectedModifiers,
      );
    const stateOfFactProperties = applyMechanicalMultipliers(
      baseProperties,
      stateOfFactMultipliers,
    );
    const improvementMultipliers =
      NTC2018ExistingMasonryMaterial.computeImprovementMultipliers(
        resolvedTypology,
        availableModifiers,
        selectedModifiers,
      );
    const improvedProperties = applyMechanicalMultipliers(
      stateOfFactProperties,
      improvementMultipliers,
    );

    super({
      id,
      name: name ?? resolvedTypology.name,
      masonryType: resolvedTypology.name,
      baseProperties,
      surveyFactors: stateOfFactMultipliers,
      improvementFactors: improvementMultipliers,
      knowledgeLevel,
      confidenceFactor,
      conditionLevel,
      elasticModulus: improvedProperties.E,
      shearModulus: improvedProperties.G,
      metadata: {
        ...metadata,
        normativePreset: "NTC2018ExistingMasonry",
        masonryTypologyId: resolvedTypology.id,
        masonryTypologyName: resolvedTypology.name,
        masonryParameterLevel: resolvedParameterLevel,
      },
      testResults,
      interventions,
      ...rest,
    });

    this.masonryTypology = resolvedTypology;
    this.parameterLevel = resolvedParameterLevel;
    this.modifierSelections = selectedModifiers;
    this.availableModifiers = availableModifiers;
    this.originalMechanicalProperties = baseProperties;
    this.stateOfFactMultipliers = stateOfFactMultipliers;
    this.stateOfFactProperties = stateOfFactProperties;
    this.improvementMultipliers = improvementMultipliers;
    this.improvedMechanicalProperties = improvedProperties;
  }

  static mergeLegacySelections(surveyFactors = {}, improvementFactors = {}) {
    const mapLegacy = (source, dictionary) =>
      Object.entries(dictionary).reduce((acc, [legacyKey, modifierKey]) => {
        if (source?.[legacyKey] == null || source[legacyKey] === 1) {
          return acc;
        }

        acc[modifierKey] = {
          selected: true,
          value: source[legacyKey],
        };
        return acc;
      }, {});

    return {
      ...mapLegacy(surveyFactors, {
        mortarQuality: "maltaBuona",
        geometry: "ricorsiOListature",
        connections: "connessioneTrasversale",
      }),
      ...mapLegacy(improvementFactors, {
        groutInjection: "iniezioniMisceleLeganti",
        reinforcedPlaster: "intonacoArmato",
        jacketing: "ristilaturaArmata",
        ties: "tirantiniAntiespulsivi",
      }),
    };
  }

  static buildAvailableModifiers(typology, selections) {
    return NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS.map((definition) => {
      const baseKey = definition.usesTypologyValueKey ?? definition.key;
      const typologyValue = typology.multipliers[baseKey];
      const selected = selections[definition.key]?.selected ?? false;
      const enabled = typologyValue != null;

      return {
        ...definition,
        enabled,
        selected,
        value: definition.key === "maltaBuona"
          ? selections[definition.key]?.value ?? typologyValue
          : typologyValue,
      };
    });
  }

  static validateModifierSelections(selections, availableModifiers) {
    const byKey = Object.fromEntries(
      availableModifiers.map((item) => [item.key, item]),
    );
    const byId = Object.fromEntries(
      availableModifiers.map((item) => [item.id, item]),
    );

    for (const [key, selection] of Object.entries(selections)) {
      if (!selection?.selected) {
        continue;
      }

      const modifier = byKey[key];

      if (!modifier) {
        throw new Error(`Coefficiente murario sconosciuto: ${key}.`);
      }

      if (!modifier.enabled) {
        throw new Error(
          `Il coefficiente "${modifier.label}" non e disponibile per la tipologia muraria selezionata.`,
        );
      }
    }

    for (const modifier of availableModifiers) {
      if (!selections[modifier.key]?.selected) {
        continue;
      }

      for (const incompatibleId of modifier.incompatibleWith ?? []) {
        const incompatible = byId[incompatibleId];

        if (selections[incompatible.key]?.selected) {
          throw new Error(
            `I coefficienti "${modifier.label}" e "${incompatible.label}" non possono essere usati insieme.`,
          );
        }
      }
    }
  }

  static computeStateOfFactMultipliers(availableModifiers, selections) {
    const selectedValues = availableModifiers
      .filter((modifier) => STATE_OF_FACT_MODIFIER_IDS.includes(modifier.id))
      .map((modifier) => getModifierValue({
        selection: selections[modifier.key],
        availableModifier: modifier,
      }))
      .sort((a, b) => b - a)
      .slice(0, 2);

    const topTwoProduct = selectedValues.reduce((acc, value) => acc * value, 1);
    const maltaBuona = availableModifiers.find(
      (modifier) => modifier.key === "maltaBuona",
    );
    const maltaBuonaValue = getModifierValue({
      selection: selections.maltaBuona,
      availableModifier: maltaBuona,
    });

    return {
      resistenzaCompressione: round(topTwoProduct),
      resistenzaTaglio: round(topTwoProduct),
      moduliElastici: round(maltaBuonaValue),
    };
  }

  static computeImprovementMultipliers(typology, availableModifiers, selections) {
    const getByKey = (key) =>
      availableModifiers.find((modifier) => modifier.key === key);
    const maxOverall = typology.multipliers.coefficienteMassimoComplessivo;

    let connessioneTrasversale = getModifierValue({
      selection: selections.connessioneTrasversale,
      availableModifier: getByKey("connessioneTrasversale"),
    });
    const ricorsiOListature = getModifierValue({
      selection: selections.ricorsiOListature,
      availableModifier: getByKey("ricorsiOListature"),
    });
    const maltaBuona = getModifierValue({
      selection: selections.maltaBuona,
      availableModifier: getByKey("maltaBuona"),
    });
    const iniezioniMisceleLeganti = getModifierValue({
      selection: selections.iniezioniMisceleLeganti,
      availableModifier: getByKey("iniezioniMisceleLeganti"),
    });
    const intonacoArmato = getModifierValue({
      selection: selections.intonacoArmato,
      availableModifier: getByKey("intonacoArmato"),
    });
    const ristilaturaArmata = getModifierValue({
      selection: selections.ristilaturaArmata,
      availableModifier: getByKey("ristilaturaArmata"),
    });
    const diatoniArtificiali = getModifierValue({
      selection: selections.diatoniArtificiali,
      availableModifier: getByKey("diatoniArtificiali"),
    });
    const tirantiniAntiespulsivi = getModifierValue({
      selection: selections.tirantiniAntiespulsivi,
      availableModifier: getByKey("tirantiniAntiespulsivi"),
    });

    const hasInterventionsNeedingConnectionReduction = [
      selections.intonacoArmato,
      selections.ristilaturaArmata,
      selections.diatoniArtificiali,
      selections.tirantiniAntiespulsivi,
    ].some((selection) => selection?.selected);

    if (
      selections.connessioneTrasversale?.selected &&
      (connessioneTrasversale > ricorsiOListature ||
        connessioneTrasversale > maltaBuona) &&
      hasInterventionsNeedingConnectionReduction
    ) {
      connessioneTrasversale = selections.connessioneTrasversale.value ?? connessioneTrasversale;
    } else {
      connessioneTrasversale = 1;
    }

    return {
      resistenzaCompressione: round(
        Math.min(
          (iniezioniMisceleLeganti *
            intonacoArmato *
            ristilaturaArmata *
            diatoniArtificiali *
            tirantiniAntiespulsivi) /
            connessioneTrasversale,
          maxOverall,
        ),
      ),
      resistenzaTaglio: round(
        Math.min(
          (iniezioniMisceleLeganti *
            intonacoArmato *
            ristilaturaArmata *
            diatoniArtificiali) /
            connessioneTrasversale,
          maxOverall,
        ),
      ),
      moduliElastici: round(
        Math.min(
          iniezioniMisceleLeganti *
            intonacoArmato *
            ((ristilaturaArmata - 1) * 0.5 + 1),
          maxOverall,
        ),
      ),
    };
  }

  adjustedProperty(propertyName) {
    return this.improvedMechanicalProperties[propertyName] ?? null;
  }

  adjustedProperties() {
    return { ...this.improvedMechanicalProperties };
  }

  stateOfFactPropertiesJSON() {
    return { ...this.stateOfFactProperties };
  }

  originalPropertiesJSON() {
    return { ...this.originalMechanicalProperties };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      masonryTypology: {
        id: this.masonryTypology.id,
        name: this.masonryTypology.name,
        notes: this.masonryTypology.notes,
      },
      parameterLevel: {
        ...NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS[this.parameterLevel],
      },
      modifierSelections: clone(this.modifierSelections),
      availableModifiers: clone(this.availableModifiers),
      originalMechanicalProperties: this.originalPropertiesJSON(),
      stateOfFactMultipliers: { ...this.stateOfFactMultipliers },
      stateOfFactProperties: this.stateOfFactPropertiesJSON(),
      improvementMultipliers: { ...this.improvementMultipliers },
      improvedMechanicalProperties: this.adjustedProperties(),
    };
  }
}
