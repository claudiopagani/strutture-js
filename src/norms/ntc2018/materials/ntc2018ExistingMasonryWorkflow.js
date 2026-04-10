import { createNTC2018ExistingMasonryMaterial } from "./createNTC2018Material.js";
import { NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS } from "./ntc2018MaterialCatalogs.js";
import { resolveMasonryTypology } from "./ntc2018ExistingMasonryCatalogs.js";

const DEFAULT_TYPOLOGY_ID = 1;
const DEFAULT_PARAMETER_LEVEL = 1;

const getModifierDefinitionById = (modifierId) =>
  NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS.find(
    (modifier) => modifier.id === modifierId,
  );

const buildModifierItem = (definition, typology, selection = {}) => {
  const valueKey = definition.usesTypologyValueKey ?? definition.key;
  const typologyValue = typology?.multipliers?.[valueKey];
  const enabled = typologyValue != null;
  const value = definition.key === "maltaBuona"
    ? selection.value ?? typologyValue
    : typologyValue;

  return {
    id: definition.id,
    key: definition.key,
    text: definition.label,
    type:
      definition.phase === "survey"
        ? "Stato di fatto"
        : "Interventi di consolidamento",
    checked: enabled ? Boolean(selection.selected) : false,
    enabled,
    value,
    toDisable: [...(definition.incompatibleWith ?? [])],
    toUncheck: [...(definition.incompatibleWith ?? [])],
  };
};

export const createNTC2018ExistingMasonryModifierState = (
  typologyId = DEFAULT_TYPOLOGY_ID,
  selections = {},
) => {
  const typology = resolveMasonryTypology(typologyId);

  if (!typology) {
    throw new Error(`Tipologia muraria NTC 2018 non riconosciuta: ${typologyId}.`);
  }

  const modifiers = NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS.map(
    (definition) => buildModifierItem(definition, typology, selections[definition.key]),
  );

  modifiers.push({
    id: 9,
    key: "coefficienteMassimoComplessivo",
    text: "Coefficiente massimo complessivo",
    type: "Coefficiente massimo complessivo",
    checked: false,
    enabled: true,
    value: typology.multipliers.coefficienteMassimoComplessivo,
    toDisable: [],
    toUncheck: [],
  });

  return modifiers;
};

export const toggleNTC2018ExistingMasonryModifier = (modifiers, modifierId) => {
  const selected = modifiers.find((item) => item.id === modifierId);

  if (!selected || !selected.enabled) {
    return modifiers.map((item) => ({ ...item }));
  }

  const nextChecked = !selected.checked;
  const idsToDisable = selected.toDisable ?? selected.toUncheck ?? [];

  return modifiers.map((item) => {
    if (item.id === modifierId) {
      return {
        ...item,
        checked: nextChecked,
      };
    }

    if (idsToDisable.includes(item.id)) {
      return {
        ...item,
        checked: false,
        enabled: !nextChecked,
      };
    }

    return { ...item };
  });
};

export const updateNTC2018ExistingMasonryMaltaBuona = (modifiers, fm) => {
  const coefficienteMaltaBuona = Math.pow(fm, 0.35);

  return modifiers.map((item) =>
    item.key === "maltaBuona"
      ? {
          ...item,
          value: coefficienteMaltaBuona,
        }
      : { ...item },
  );
};

export const createNTC2018ExistingMasonryWorkflowState = () => ({
  tipologiaIndex: DEFAULT_TYPOLOGY_ID,
  livelloDiConfidenza: DEFAULT_PARAMETER_LEVEL,
  coefficienti: createNTC2018ExistingMasonryModifierState(DEFAULT_TYPOLOGY_ID),
});

export const selectNTC2018ExistingMasonryTypology = (currentState, tipologiaIndex) => ({
  ...currentState,
  tipologiaIndex,
  coefficienti: createNTC2018ExistingMasonryModifierState(tipologiaIndex),
});

export const selectNTC2018ExistingMasonryParameterLevel = (
  currentState,
  livelloDiConfidenza,
) => ({
  ...currentState,
  livelloDiConfidenza,
});

export const applyNTC2018ExistingMasonryModifierToggle = (
  currentState,
  coefficienteId,
) => ({
  ...currentState,
  coefficienti: toggleNTC2018ExistingMasonryModifier(
    currentState.coefficienti,
    coefficienteId,
  ),
});

export const applyNTC2018ExistingMasonryMaltaBuonaUpdate = (currentState, fm) => ({
  ...currentState,
  coefficienti: updateNTC2018ExistingMasonryMaltaBuona(
    currentState.coefficienti,
    fm,
  ),
});

export const modifierSelectionsFromState = (modifiers) =>
  modifiers.reduce((acc, modifier) => {
    if (!modifier.key || modifier.id === 9 || !modifier.enabled || !modifier.checked) {
      return acc;
    }

    acc[modifier.key] = {
      selected: true,
      value: modifier.value,
    };
    return acc;
  }, {});

export const evaluateNTC2018ExistingMasonryWorkflow = async (requestBody) => {
  const material = createNTC2018ExistingMasonryMaterial({
    masonryTypologyId: requestBody.tipologiaIndex,
    parameterLevel: requestBody.livelloDiConfidenza,
    modifierSelections: modifierSelectionsFromState(requestBody.coefficienti ?? []),
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    ok: true,
    data: {
      parametriOriginali: material.originalPropertiesJSON(),
      parametriAnteOperam: material.stateOfFactPropertiesJSON(),
      modificatoriStatoDiFatto: { ...material.stateOfFactMultipliers },
      modificatori: { ...material.improvementMultipliers },
      parametriPostOperam: material.adjustedProperties(),
      materiale: material.toJSON(),
    },
  };
};

export const getNTC2018ExistingMasonryModifierDefinition = getModifierDefinitionById;
