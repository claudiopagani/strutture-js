import { assertExplicitUnitSystem } from "../units/UnitSystem.js";
import { ElasticBeamSectionProvider } from "./ElasticBeamSectionProvider.js";
import { normalizeSectionRotation } from "./SectionRotation.js";

export const BEAM_SUPPORT_PRESETS = Object.freeze({
  free: Object.freeze({ ux: false, uy: false, rz: false }),
  roller: Object.freeze({ ux: false, uy: true, rz: false }),
  "sliding-support": Object.freeze({ ux: false, uy: true, rz: false }),
  hinge: Object.freeze({ ux: true, uy: true, rz: false }),
  pin: Object.freeze({ ux: true, uy: true, rz: false }),
  fixed: Object.freeze({ ux: true, uy: true, rz: true }),
});

export const DISTRIBUTED_LOAD_TYPES = new Set(["distributed", "uniform", "line"]);
export const POINT_LOAD_TYPES = new Set(["point", "nodal", "force", "moment"]);

const LOAD_DURATION_ORDER = Object.freeze({
  permanent: 5,
  long: 4,
  medium: 3,
  short: 2,
  instantaneous: 1,
});

function normalizePresetName(type) {
  return String(type ?? "free")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");
}

export function resolveBeamSupportPreset(type) {
  const normalized = normalizePresetName(type);
  const aliases = {
    libero: "free",
    libera: "free",
    appoggio: "roller",
    "appoggio-scorrevole": "roller",
    scorrevole: "roller",
    cerniera: "hinge",
    incastro: "fixed",
  };
  const presetName = aliases[normalized] ?? normalized;
  const preset = BEAM_SUPPORT_PRESETS[presetName];

  if (!preset) {
    throw new Error(`Unsupported beam support preset: ${type}.`);
  }

  return { ...preset };
}

function expandLoads(loads) {
  if (Array.isArray(loads)) {
    return loads.map((load) => ({ ...load }));
  }

  if (!loads || typeof loads !== "object") {
    return [];
  }

  const expanded = [];
  const pushGroup = (items, actionType) => {
    const entries = Array.isArray(items) ? items : [items];

    for (const item of entries) {
      if (item == null) {
        continue;
      }

      if (typeof item === "number") {
        expanded.push({ actionType, value: item, type: "uniform" });
        continue;
      }

      expanded.push({ actionType, ...item });
    }
  };

  pushGroup(loads.g1 ?? loads.G1, "G1");
  pushGroup(loads.g2 ?? loads.G2, "G2");
  pushGroup(loads.qk ?? loads.Qk ?? loads.QK, "Qk");

  for (const [key, value] of Object.entries(loads)) {
    if (["g1", "G1", "g2", "G2", "qk", "Qk", "QK"].includes(key)) {
      continue;
    }

    pushGroup(value, key);
  }

  return expanded;
}

function resolveLoadCaseId(load, index) {
  if (load.loadCaseId) {
    return load.loadCaseId;
  }

  if (load.loadCase?.id) {
    return load.loadCase.id;
  }

  const actionType = String(load.actionType ?? "LOAD").toUpperCase();

  if (actionType === "QK" || actionType === "Q") {
    return load.id ?? `Qk-${index + 1}`;
  }

  if (actionType === "G1" || actionType === "G2") {
    return actionType;
  }

  return load.id ?? actionType;
}

function resolveActionType(load) {
  if (load.actionType) {
    return load.actionType;
  }

  if (load.action?.permanentClass) {
    return load.action.permanentClass;
  }

  if (load.loadCase?.action?.permanentClass) {
    return load.loadCase.action.permanentClass;
  }

  if (load.action?.category) {
    return "Qk";
  }

  if (load.loadCase?.action?.category) {
    return "Qk";
  }

  return load.category ?? "LOAD";
}

function resolveLoadNature(load) {
  if (load.nature) {
    return load.nature;
  }

  if (load.action?.nature) {
    return load.action.nature;
  }

  if (load.loadCase?.action?.nature) {
    return load.loadCase.action.nature;
  }

  const actionType = String(load.actionType ?? "").toUpperCase();

  if (actionType === "G1" || actionType === "G2") {
    return "permanent";
  }

  if (actionType === "QK" || actionType === "Q") {
    return "variable";
  }

  return load.variableCategory || load.category ? "variable" : "generic";
}

function resolveLoadDurationClass(load) {
  return (
    load.loadDurationClass ??
    load.durationClass ??
    load.action?.loadDurationClass ??
    load.loadCase?.action?.loadDurationClass ??
    load.metadata?.loadDurationClass ??
    (resolveLoadNature(load) === "permanent" ? "permanent" : null)
  );
}

export function normalizeLoads(loads) {
  return expandLoads(loads).map((load, index) => {
    const actionType = resolveActionType(load);
    const id = load.id ?? `${actionType}-${index + 1}`;
    const normalized = {
      ...load,
      id,
      actionType,
      type: load.type ?? "uniform",
      factor: load.factor ?? 1,
    };

    return {
      ...normalized,
      loadCaseId: resolveLoadCaseId(normalized, index),
      nature: resolveLoadNature(normalized),
      variableCategory:
        normalized.variableCategory ??
        normalized.action?.category ??
        normalized.loadCase?.action?.category ??
        normalized.category ??
        null,
      loadDurationClass: resolveLoadDurationClass(normalized),
    };
  });
}

export function normalizeSupportDefinitions(supports) {
  if (Array.isArray(supports)) {
    return supports.map((support, index) => ({
      id: support.id ?? `support-${index + 1}`,
      ...support,
    }));
  }

  if (!supports || typeof supports !== "object") {
    return [];
  }

  const definitions = [];

  if (supports.start != null) {
    const start =
      typeof supports.start === "string"
        ? { type: supports.start }
        : { ...supports.start };

    definitions.push({
      id: start.id ?? "start-support",
      position: "start",
      ...start,
    });
  }

  if (supports.end != null) {
    const end =
      typeof supports.end === "string"
        ? { type: supports.end }
        : { ...supports.end };

    definitions.push({
      id: end.id ?? "end-support",
      position: "end",
      ...end,
    });
  }

  return definitions;
}

export function normalizeLoadDirection(load) {
  const rawDirection = String(load.direction ?? "global-y")
    .trim()
    .toLowerCase();

  if (["global-x", "x", "fx"].includes(rawDirection)) {
    return { referenceSystem: "global", direction: "x" };
  }

  if (["global-y", "y", "fy", "vertical"].includes(rawDirection)) {
    return { referenceSystem: "global", direction: "y" };
  }

  if (["moment", "moment-z", "mz", "rz"].includes(rawDirection)) {
    return { referenceSystem: "global", direction: "mz" };
  }

  throw new Error(`Unsupported beam load direction: ${load.direction}.`);
}

export function normalizeProjection(value) {
  const projection = String(value ?? "horizontal").trim().toLowerCase();
  const aliases = {
    axis: "beam-axis",
    local: "beam-axis",
    member: "beam-axis",
    "beam_axis": "beam-axis",
    "beam axis": "beam-axis",
    horizontal: "horizontal",
    "global-x": "horizontal",
  };
  const normalized = aliases[projection] ?? projection;

  if (!["horizontal", "beam-axis"].includes(normalized)) {
    throw new Error(`Unsupported loadProjection: ${value}.`);
  }

  return normalized;
}

export function projectedLineLoadValue(value, load, geometry) {
  const projection = normalizeProjection(load.loadProjection);

  if (projection === "beam-axis") {
    return value;
  }

  return value * (geometry.horizontalSpan / geometry.length);
}

export function groupLoadsByCase(loads) {
  const groups = new Map();

  for (const load of loads) {
    if (!groups.has(load.loadCaseId)) {
      groups.set(load.loadCaseId, []);
    }

    groups.get(load.loadCaseId).push(load);
  }

  return groups;
}

function normalizeCombinationFactors(factors) {
  if (Array.isArray(factors)) {
    return Object.fromEntries(
      factors.map((item) => [
        item.loadCaseId ?? item.loadCase?.id ?? item.loadCase,
        item.factor,
      ]),
    );
  }

  return { ...(factors ?? {}) };
}

function inferLimitState(combination) {
  const rawValue =
    combination.limitState ??
    combination.combinationType ??
    combination.type ??
    combination.id ??
    "";
  const normalized = String(rawValue).trim().toUpperCase();

  if (normalized.includes("ULS") || normalized.includes("SLU")) {
    return "ULS";
  }

  if (normalized.includes("SLE") || normalized.includes("SLS")) {
    return "SLE";
  }

  return null;
}

export function normalizeCombinations(combinations, loadCaseIds) {
  if (combinations === false) {
    return [];
  }

  if (Array.isArray(combinations)) {
    return combinations.map((combination, index) => ({
      id: combination.id ?? `combination-${index + 1}`,
      name: combination.name ?? combination.id ?? `Combination ${index + 1}`,
      factors: normalizeCombinationFactors(combination.factors),
      metadata: {
        ...combination.metadata,
        combinationType: combination.combinationType ?? combination.type ?? null,
        limitState:
          combination.limitState ??
          combination.metadata?.limitState ??
          inferLimitState(combination),
        serviceCombination:
          combination.serviceCombination ??
          combination.metadata?.serviceCombination ??
          null,
        deformationState:
          combination.deformationState ??
          combination.metadata?.deformationState ??
          null,
        stiffnessState:
          combination.stiffnessState ??
          combination.metadata?.stiffnessState ??
          null,
        rcStiffnessState:
          combination.rcStiffnessState ??
          combination.metadata?.rcStiffnessState ??
          null,
      },
    }));
  }

  if (Array.isArray(combinations?.items)) {
    return normalizeCombinations(combinations.items, loadCaseIds);
  }

  if (Array.isArray(combinations?.combinations)) {
    return normalizeCombinations(combinations.combinations, loadCaseIds);
  }

  return [
    {
      id: "characteristic",
      name: "Characteristic",
      factors: Object.fromEntries(loadCaseIds.map((id) => [id, 1])),
      metadata: {
        generated: true,
        limitState: null,
      },
    },
  ];
}

export function loadsForCombination(loads, factors) {
  return loads
    .map((load) => ({
      ...load,
      factor: (load.factor ?? 1) * (factors[load.loadCaseId] ?? 0),
    }))
    .filter((load) => load.factor !== 0);
}

function normalizeDurationOrder(loadDurationClass) {
  const normalized = String(loadDurationClass ?? "").trim().toLowerCase();
  const aliases = {
    permanente: "permanent",
    lunga: "long",
    "lunga-durata": "long",
    media: "medium",
    "media-durata": "medium",
    breve: "short",
    "breve-durata": "short",
    istantanea: "instantaneous",
  };

  return aliases[normalized] ?? normalized;
}

function loadParticipation(load) {
  return {
    id: load.id,
    actionType: load.actionType,
    loadCaseId: load.loadCaseId,
    factor: load.factor ?? 1,
    nature: load.nature ?? resolveLoadNature(load),
    variableCategory: load.variableCategory ?? null,
    loadDurationClass: load.loadDurationClass ?? resolveLoadDurationClass(load),
    leadingEligible:
      load.leadingEligible ??
      load.action?.leadingEligible ??
      load.loadCase?.action?.leadingEligible ??
      true,
    metadata: { ...load.metadata },
  };
}

function resolveGoverningLoadDuration(activeLoads) {
  const loadsWithDuration = activeLoads
    .map((load) => ({
      ...load,
      normalizedLoadDurationClass: normalizeDurationOrder(load.loadDurationClass),
    }))
    .filter((load) => LOAD_DURATION_ORDER[load.normalizedLoadDurationClass]);

  if (loadsWithDuration.length === 0) {
    return {
      loadDurationClass: "permanent",
      load: null,
    };
  }

  const load = loadsWithDuration.reduce((current, candidate) =>
    LOAD_DURATION_ORDER[candidate.normalizedLoadDurationClass] <
    LOAD_DURATION_ORDER[current.normalizedLoadDurationClass]
      ? candidate
      : current,
  );

  return {
    loadDurationClass: load.normalizedLoadDurationClass,
    load,
  };
}

function loadCaseFactorsFromLoads(loads) {
  return loads.reduce((acc, load) => {
    acc[load.loadCaseId] = load.factor ?? 1;
    return acc;
  }, {});
}

export function createBeamAnalysisContext(model, loads, context = {}) {
  const activeLoads = loads
    .filter((load) => (load.factor ?? 1) !== 0)
    .map(loadParticipation);
  const governingDuration = resolveGoverningLoadDuration(activeLoads);

  return {
    ...context,
    beamId: model.id,
    analysisModel: model.analysisModel,
    loadCaseFactors: {
      ...(context.factors ?? loadCaseFactorsFromLoads(loads)),
    },
    activeLoads,
    governingLoadDurationClass:
      context.governingLoadDurationClass ??
      governingDuration.loadDurationClass,
    governingLoad: context.governingLoad ?? governingDuration.load,
  };
}

export class SingleBeamModel {
  constructor({
    id = "single-beam",
    units,
    geometry,
    sectionProvider = null,
    section = null,
    material = null,
    analysisModel = "euler-bernoulli",
    elementClass = null,
    supports = {},
    loads = [],
    combinations = null,
    discretization = {},
    verificationStations = null,
    sectionRotation = null,
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("A SingleBeamModel id is required.");
    }

    assertExplicitUnitSystem(units, "SingleBeamModel");

    this.id = id;
    this.units = units;
    this.geometry = geometry;
    this.sectionProvider =
      sectionProvider ??
      new ElasticBeamSectionProvider({
        section,
        material,
      });
    this.analysisModel = analysisModel;
    this.elementClass = elementClass;
    this.supports = normalizeSupportDefinitions(supports);
    this.loads = normalizeLoads(loads);
    this.combinations = combinations;
    this.discretization = { ...discretization };
    this.verificationStations = Array.isArray(verificationStations)
      ? [...verificationStations]
      : verificationStations
        ? { ...verificationStations }
        : null;
    this.sectionRotation = normalizeSectionRotation(sectionRotation);
    this.metadata = { ...metadata };
  }
}
