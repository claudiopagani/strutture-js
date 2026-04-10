import { LoadCombination } from "../../../domain/analysis/LoadCombination.js";
import {
  NTC2018_ULS_PARTIAL_FACTORS,
} from "./ntc2018LoadParameters.js";
import {
  getNTC2018ActionCombinationFactors,
} from "../actions/createNTC2018Action.js";

const NTC2018_REFERENCE = "DM 17/01/2018 - NTC 2018";

const normalizePermanentAction = (action) => {
  if (action?.nature === "permanent") {
    return {
      actionType: action.permanentClass ?? "G1",
      favourable: false,
      loadCase: action.loadCase,
      actionObject: action,
    };
  }

  return {
    actionType: action.actionType ?? "G1",
    favourable: Boolean(action.favourable),
    loadCase: action.loadCase,
    actionObject: action.action ?? null,
  };
};

const normalizeVariableAction = (action) => {
  if (action?.nature === "variable") {
    return {
      category: action.category,
      loadCase: action.loadCase,
      actionObject: action,
    };
  }

  return {
    category: action.category,
    loadCase: action.loadCase,
    actionObject: action.action ?? null,
  };
};

export function createNTC2018ULSFundamentalCombination({
  id,
  name = id,
  permanentActions = [],
  variableActions = [],
  leadingVariableAction,
  metadata = {},
}) {
  if (!leadingVariableAction) {
    throw new Error("A leading variable action is required for an NTC 2018 ULS combination.");
  }

  const combination = new LoadCombination({
    id,
    name,
    combinationType: "ULS_STR_GEO",
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
      ntcReference: NTC2018_REFERENCE,
    },
  });

  permanentActions.map(normalizePermanentAction).forEach((action) => {
    const factor = action.actionObject
      ? action.actionObject.getPartialFactor({
        combinationSet: "A1",
        effect: action.favourable ? "favourable" : "unfavourable",
      })
      : action.actionType === "G2"
        ? action.favourable
          ? NTC2018_ULS_PARTIAL_FACTORS.G2_FAVOURABLE
          : NTC2018_ULS_PARTIAL_FACTORS.G2_UNFAVOURABLE
        : action.favourable
          ? NTC2018_ULS_PARTIAL_FACTORS.G1_FAVOURABLE
          : NTC2018_ULS_PARTIAL_FACTORS.G1_UNFAVOURABLE;

    combination.addFactor(action.loadCase, factor);
  });

  const normalizedLeadingAction = normalizeVariableAction(leadingVariableAction);
  const leadingFactor = normalizedLeadingAction.actionObject
    ? normalizedLeadingAction.actionObject.getPartialFactor({
      combinationSet: "A1",
      effect: "unfavourable",
    })
    : NTC2018_ULS_PARTIAL_FACTORS.Q_UNFAVOURABLE;

  combination.addFactor(
    normalizedLeadingAction.loadCase,
    leadingFactor,
  );

  variableActions
    .map(normalizeVariableAction)
    .filter((action) => action.loadCase.id !== normalizedLeadingAction.loadCase.id)
    .forEach((action) => {
      const combinationFactor = action.actionObject
        ? action.actionObject.getCombinationFactor("psi0")
        : getNTC2018ActionCombinationFactors(action.category).psi0;
      const partialFactor = action.actionObject
        ? action.actionObject.getPartialFactor({
          combinationSet: "A1",
          effect: "unfavourable",
        })
        : NTC2018_ULS_PARTIAL_FACTORS.Q_UNFAVOURABLE;

      combination.addFactor(
        action.loadCase,
        partialFactor * combinationFactor,
      );
    });

  return combination;
}

export function createNTC2018SLECombination({
  id,
  name = id,
  type = "RARE",
  permanentActions = [],
  variableActions = [],
  leadingVariableAction = null,
  metadata = {},
}) {
  const normalizedType = type.toUpperCase();
  const supportedTypes = ["RARE", "FREQUENT", "QUASI_PERMANENT"];

  if (!supportedTypes.includes(normalizedType)) {
    throw new Error(`Unsupported NTC 2018 SLE combination type: ${type}.`);
  }

  const combination = new LoadCombination({
    id,
    name,
    combinationType: `SLE_${normalizedType}`,
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
      ntcReference: NTC2018_REFERENCE,
    },
  });

  permanentActions.map(normalizePermanentAction).forEach((action) => {
    combination.addFactor(action.loadCase, 1.0);
  });

  const normalizedLeadingAction = leadingVariableAction
    ? normalizeVariableAction(leadingVariableAction)
    : null;

  variableActions.map(normalizeVariableAction).forEach((action) => {
    const psi0 = action.actionObject
      ? action.actionObject.getCombinationFactor("psi0")
      : getNTC2018ActionCombinationFactors(action.category).psi0;
    const psi1 = action.actionObject
      ? action.actionObject.getCombinationFactor("psi1")
      : getNTC2018ActionCombinationFactors(action.category).psi1;
    const psi2 = action.actionObject
      ? action.actionObject.getCombinationFactor("psi2")
      : getNTC2018ActionCombinationFactors(action.category).psi2;

    if (normalizedType === "QUASI_PERMANENT") {
      combination.addFactor(action.loadCase, psi2);
      return;
    }

    if (!normalizedLeadingAction) {
      throw new Error(`A leading variable action is required for SLE ${normalizedType}.`);
    }

    if (action.loadCase.id === normalizedLeadingAction.loadCase.id) {
      combination.addFactor(
        action.loadCase,
        normalizedType === "RARE" ? 1.0 : psi1,
      );
      return;
    }

    combination.addFactor(
      action.loadCase,
      normalizedType === "RARE" ? psi0 : psi2,
    );
  });

  return combination;
}
