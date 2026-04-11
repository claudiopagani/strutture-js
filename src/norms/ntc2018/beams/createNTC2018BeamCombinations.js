import {
  getNTC2018ActionCombinationFactors,
} from "../actions/createNTC2018Action.js";
import {
  NTC2018_ULS_PARTIAL_FACTORS,
} from "../loads/ntc2018LoadParameters.js";

const NTC2018_REFERENCE = "DM 17/01/2018 - NTC 2018";
const DEFAULT_COMBINATION_TYPES = Object.freeze([
  "ULS",
  "SLE_RARE",
  "SLE_FREQUENT",
  "SLE_QUASI_PERMANENT",
]);

function compactId(value) {
  return String(value ?? "")
    .trim()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^A-Za-z0-9_.-]/g, "");
}

function normalizeType(type) {
  const normalized = String(type ?? "").trim().toUpperCase();
  const aliases = {
    SLU: "ULS",
    "ULS_STR_GEO": "ULS",
    RARE: "SLE_RARE",
    SLE: "SLE_RARE",
    SLS: "SLE_RARE",
    SLS_RARE: "SLE_RARE",
    FREQUENT: "SLE_FREQUENT",
    SLS_FREQUENT: "SLE_FREQUENT",
    QUASI_PERMANENT: "SLE_QUASI_PERMANENT",
    "SLE_QP": "SLE_QUASI_PERMANENT",
    "SLS_QP": "SLE_QUASI_PERMANENT",
    "SLS_QUASI_PERMANENT": "SLE_QUASI_PERMANENT",
  };

  return aliases[normalized] ?? normalized;
}

function resolveAction(input) {
  return input?.action ?? input?.loadCase?.action ?? input?.load?.action ?? null;
}

function resolveLoadCase(input, action = resolveAction(input)) {
  return input?.loadCase ?? input?.load?.loadCase ?? action?.loadCase ?? null;
}

function resolveLoadCaseId(input, action = resolveAction(input)) {
  const loadCase = resolveLoadCase(input, action);

  return (
    input?.loadCaseId ??
    input?.load?.loadCaseId ??
    loadCase?.id ??
    action?.loadCase?.id ??
    input?.id ??
    action?.id ??
    null
  );
}

function resolveActionType(input, action = resolveAction(input)) {
  if (input?.actionType) {
    return input.actionType;
  }

  if (input?.load?.actionType) {
    return input.load.actionType;
  }

  if (action?.permanentClass) {
    return action.permanentClass;
  }

  if (action?.nature === "variable" || action?.category) {
    return "Qk";
  }

  return input?.category ?? null;
}

function resolveNature(input, action = resolveAction(input)) {
  if (input?.nature) {
    return input.nature;
  }

  if (input?.load?.nature) {
    return input.load.nature;
  }

  if (action?.nature) {
    return action.nature;
  }

  const actionType = String(resolveActionType(input, action) ?? "").toUpperCase();

  if (actionType === "G1" || actionType === "G2") {
    return "permanent";
  }

  if (actionType === "QK" || actionType === "Q") {
    return "variable";
  }

  return input?.variableCategory || input?.category ? "variable" : "generic";
}

function resolveCategory(input, action = resolveAction(input)) {
  return (
    input?.category ??
    input?.variableCategory ??
    input?.load?.variableCategory ??
    input?.load?.category ??
    action?.category ??
    null
  );
}

function resolveLoadDurationClass(input, action = resolveAction(input)) {
  return (
    input?.loadDurationClass ??
    input?.durationClass ??
    input?.load?.loadDurationClass ??
    input?.load?.durationClass ??
    action?.loadDurationClass ??
    (resolveNature(input, action) === "permanent" ? "permanent" : null)
  );
}

function resolvePermanentClass(input, action = resolveAction(input)) {
  return (
    input?.permanentClass ??
    input?.load?.permanentClass ??
    action?.permanentClass ??
    resolveActionType(input, action) ??
    "G1"
  );
}

function resolvePartialFactor(action, {
  permanentClass = null,
  family = "imposed",
  effect = "unfavourable",
  combinationSet = "A1",
} = {}) {
  if (typeof action?.getPartialFactor === "function") {
    return action.getPartialFactor({ combinationSet, effect });
  }

  if (permanentClass) {
    const key = `${permanentClass.toUpperCase()}_${effect.toUpperCase()}`;
    const fallback = NTC2018_ULS_PARTIAL_FACTORS[key];

    if (Number.isFinite(fallback)) {
      return fallback;
    }

    return effect === "favourable" ? 1 : 1.3;
  }

  void family;
  return effect === "favourable" ? 0 : NTC2018_ULS_PARTIAL_FACTORS.Q_UNFAVOURABLE;
}

function resolveCombinationFactors(action, category) {
  if (typeof action?.getCombinationFactor === "function") {
    return {
      psi0: action.getCombinationFactor("psi0"),
      psi1: action.getCombinationFactor("psi1"),
      psi2: action.getCombinationFactor("psi2"),
    };
  }

  return getNTC2018ActionCombinationFactors(category);
}

function normalizePermanentEntry(input) {
  const action = resolveAction(input);
  const loadCaseId = resolveLoadCaseId(input, action);
  const permanentClass = resolvePermanentClass(input, action);

  if (!loadCaseId) {
    throw new Error("NTC 2018 beam permanent actions require a loadCaseId.");
  }

  return {
    id: input?.id ?? action?.id ?? loadCaseId,
    loadCaseId,
    action,
    actionId: action?.id ?? null,
    actionType: permanentClass,
    permanentClass,
    nature: "permanent",
    favourable: Boolean(input?.favourable ?? input?.load?.favourable),
    loadDurationClass: resolveLoadDurationClass(input, action) ?? "permanent",
    metadata: {
      ...input?.metadata,
      ...input?.load?.metadata,
    },
  };
}

function normalizeVariableEntry(input) {
  const action = resolveAction(input);
  const loadCaseId = resolveLoadCaseId(input, action);
  const category = resolveCategory(input, action);

  if (!loadCaseId) {
    throw new Error("NTC 2018 beam variable actions require a loadCaseId.");
  }

  if (!category) {
    throw new Error(`NTC 2018 beam variable action ${loadCaseId} requires a category.`);
  }

  return {
    id: input?.id ?? action?.id ?? loadCaseId,
    loadCaseId,
    action,
    actionId: action?.id ?? null,
    actionType: "Qk",
    category,
    family: input?.family ?? input?.load?.family ?? action?.family ?? "imposed",
    nature: "variable",
    leadingEligible:
      input?.leadingEligible ??
      input?.load?.leadingEligible ??
      action?.leadingEligible ??
      true,
    loadDurationClass: resolveLoadDurationClass(input, action),
    combinationFactors: resolveCombinationFactors(action, category),
    metadata: {
      ...input?.metadata,
      ...input?.load?.metadata,
    },
  };
}

function normalizeLoads(loads = []) {
  const permanentActions = [];
  const variableActions = [];

  for (const load of loads) {
    const nature = resolveNature(load);

    if (nature === "permanent") {
      permanentActions.push(normalizePermanentEntry({ load, ...load }));
      continue;
    }

    if (nature === "variable") {
      variableActions.push(normalizeVariableEntry({ load, ...load }));
    }
  }

  return { permanentActions, variableActions };
}

function normalizeInputActions({ loads = [], permanentActions = [], variableActions = [] } = {}) {
  const fromLoads = normalizeLoads(loads);

  return {
    permanentActions: [
      ...fromLoads.permanentActions,
      ...permanentActions.map((action) => normalizePermanentEntry(action)),
    ],
    variableActions: [
      ...fromLoads.variableActions,
      ...variableActions.map((action) => normalizeVariableEntry(action)),
    ],
  };
}

function factorsToMetadata(factors) {
  return Object.fromEntries(
    Object.entries(factors).map(([loadCaseId, factor]) => [
      loadCaseId,
      Number(factor.toFixed(12)),
    ]),
  );
}

function baseMetadata({ type, leadingVariableAction = null, permanentActions, variableActions }) {
  return {
    normativePreset: "NTC2018",
    ntcReference: NTC2018_REFERENCE,
    leadingLoadCaseId: leadingVariableAction?.loadCaseId ?? null,
    leadingActionId: leadingVariableAction?.actionId ?? null,
    leadingVariableCategory: leadingVariableAction?.category ?? null,
    accompanyingLoadCaseIds: leadingVariableAction
      ? variableActions
          .filter((action) => action.loadCaseId !== leadingVariableAction.loadCaseId)
          .map((action) => action.loadCaseId)
      : [],
    loadDurations: Object.fromEntries(
      [...permanentActions, ...variableActions].map((action) => [
        action.loadCaseId,
        action.loadDurationClass,
      ]),
    ),
    generatedBy: "createNTC2018BeamCombinations",
    requestedType: type,
  };
}

function createUlsCombination({
  idPrefix,
  permanentActions,
  variableActions,
  leadingVariableAction = null,
  combinationSet,
}) {
  const factors = {};
  const partialFactors = {};

  for (const action of permanentActions) {
    const effect = action.favourable ? "favourable" : "unfavourable";
    const factor = resolvePartialFactor(action.action, {
      permanentClass: action.permanentClass,
      effect,
      combinationSet,
    });

    factors[action.loadCaseId] = factor;
    partialFactors[action.loadCaseId] = factor;
  }

  if (leadingVariableAction) {
    for (const action of variableActions) {
      const partialFactor = resolvePartialFactor(action.action, {
        family: action.family,
        effect: "unfavourable",
        combinationSet,
      });
      const combinationFactor =
        action.loadCaseId === leadingVariableAction.loadCaseId
          ? 1
          : action.combinationFactors.psi0;

      factors[action.loadCaseId] = partialFactor * combinationFactor;
      partialFactors[action.loadCaseId] = partialFactor;
    }
  }

  const suffix = leadingVariableAction
    ? compactId(leadingVariableAction.loadCaseId)
    : "permanent";

  return {
    id: `${idPrefix}-ULS-${suffix}`,
    name: `ULS ${suffix}`,
    limitState: "ULS",
    combinationType: "ULS_STR_GEO",
    factors,
    metadata: {
      ...baseMetadata({
        type: "ULS",
        leadingVariableAction,
        permanentActions,
        variableActions,
      }),
      partialFactors: factorsToMetadata(partialFactors),
      combinationFactors: Object.fromEntries(
        variableActions.map((action) => [
          action.loadCaseId,
          action.loadCaseId === leadingVariableAction?.loadCaseId
            ? 1
            : action.combinationFactors.psi0,
        ]),
      ),
    },
  };
}

function createSleCombination({
  idPrefix,
  type,
  permanentActions,
  variableActions,
  leadingVariableAction = null,
}) {
  const normalizedType = normalizeType(type);
  const sleType = normalizedType.replace("SLE_", "");
  const factors = {};
  const psiFactors = {};

  for (const action of permanentActions) {
    factors[action.loadCaseId] = 1;
    psiFactors[action.loadCaseId] = 1;
  }

  for (const action of variableActions) {
    let factor = action.combinationFactors.psi2;

    if (sleType === "RARE") {
      factor =
        action.loadCaseId === leadingVariableAction?.loadCaseId
          ? 1
          : action.combinationFactors.psi0;
    } else if (sleType === "FREQUENT") {
      factor =
        action.loadCaseId === leadingVariableAction?.loadCaseId
          ? action.combinationFactors.psi1
          : action.combinationFactors.psi2;
    }

    factors[action.loadCaseId] = factor;
    psiFactors[action.loadCaseId] = factor;
  }

  const suffix = leadingVariableAction
    ? compactId(leadingVariableAction.loadCaseId)
    : "all";

  return {
    id: `${idPrefix}-${normalizedType}-${suffix}`,
    name: `${normalizedType} ${suffix}`,
    limitState: "SLE",
    combinationType: normalizedType,
    factors,
    metadata: {
      ...baseMetadata({
        type: normalizedType,
        leadingVariableAction,
        permanentActions,
        variableActions,
      }),
      serviceCombination: sleType.toLowerCase().replace("_", "-"),
      psiFactors: factorsToMetadata(psiFactors),
    },
  };
}

function leadingVariableActionsFor(type, variableActions) {
  const normalizedType = normalizeType(type);

  if (normalizedType === "SLE_QUASI_PERMANENT") {
    return [null];
  }

  const candidates = variableActions.filter((action) => action.leadingEligible);

  return candidates.length > 0 ? candidates : [null];
}

export function createNTC2018BeamCombinations({
  loads = [],
  permanentActions = [],
  variableActions = [],
  types = DEFAULT_COMBINATION_TYPES,
  idPrefix = "NTC2018",
  combinationSet = "A1",
} = {}) {
  const normalizedTypes = types.map(normalizeType);
  const normalized = normalizeInputActions({
    loads,
    permanentActions,
    variableActions,
  });
  const combinations = [];

  for (const type of normalizedTypes) {
    if (type === "ULS") {
      for (const leadingVariableAction of leadingVariableActionsFor(type, normalized.variableActions)) {
        combinations.push(
          createUlsCombination({
            idPrefix,
            permanentActions: normalized.permanentActions,
            variableActions: normalized.variableActions,
            leadingVariableAction,
            combinationSet,
          }),
        );
      }
      continue;
    }

    if (["SLE_RARE", "SLE_FREQUENT", "SLE_QUASI_PERMANENT"].includes(type)) {
      for (const leadingVariableAction of leadingVariableActionsFor(type, normalized.variableActions)) {
        combinations.push(
          createSleCombination({
            idPrefix,
            type,
            permanentActions: normalized.permanentActions,
            variableActions: normalized.variableActions,
            leadingVariableAction,
          }),
        );
      }
      continue;
    }

    throw new Error(`Unsupported NTC 2018 beam combination type: ${type}.`);
  }

  return combinations;
}
