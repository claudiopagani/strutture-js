import { Node } from "../geometry/Node.js";
import { DistributedLoad } from "../loads/DistributedLoad.js";
import { NodalLoad } from "../loads/NodalLoad.js";
import { Support } from "../supports/Support.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import {
  FrameElement2DEulerBernoulli,
  FrameElement2DTimoshenko,
} from "../fem/elements/index.js";
import { LinearStaticSolver2D } from "../fem/LinearStaticSolver2D.js";
import { ElasticBeamSectionProvider } from "./ElasticBeamSectionProvider.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
const DEFAULT_SECTION_PROPERTY_UNITS = Object.freeze({ force: "N", length: "mm" });
const DISTRIBUTED_LOAD_TYPES = new Set(["distributed", "uniform", "line"]);
const POINT_LOAD_TYPES = new Set(["point", "nodal", "force", "moment"]);
const LOAD_DURATION_ORDER = Object.freeze({
  permanent: 5,
  long: 4,
  medium: 3,
  short: 2,
  instantaneous: 1,
});

export const BEAM_SUPPORT_PRESETS = Object.freeze({
  free: Object.freeze({ ux: false, uy: false, rz: false }),
  roller: Object.freeze({ ux: false, uy: true, rz: false }),
  "sliding-support": Object.freeze({ ux: false, uy: true, rz: false }),
  hinge: Object.freeze({ ux: true, uy: true, rz: false }),
  pin: Object.freeze({ ux: true, uy: true, rz: false }),
  fixed: Object.freeze({ ux: true, uy: true, rz: true }),
});

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`SingleBeamAnalysis requires a finite ${label}.`);
  }
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SingleBeamAnalysis requires a positive ${label}.`);
  }
}

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

function normalizeLoads(loads) {
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

function normalizePoint(point, unitResolver, label) {
  if (!point || typeof point !== "object") {
    throw new Error(`SingleBeamAnalysis requires geometry.${label}.`);
  }

  assertFinite(point.x, `geometry.${label}.x`);
  assertFinite(point.y, `geometry.${label}.y`);

  return {
    x: unitResolver.length(point.x),
    y: unitResolver.length(point.y),
  };
}

function resolveGeometry(geometry, sourceUnits) {
  const unitResolver = createUnitResolver(sourceUnits, FEM_UNITS);
  const start = normalizePoint(geometry?.start, unitResolver, "start");
  const end = normalizePoint(geometry?.end, unitResolver, "end");
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx ** 2 + dy ** 2);

  assertPositive(length, "beam length");

  return {
    start,
    end,
    dx,
    dy,
    length,
    horizontalSpan: Math.abs(dx),
    c: dx / length,
    s: dy / length,
  };
}

function coordinateAtStation(geometry, station) {
  const ratio = station / geometry.length;

  return {
    x: geometry.start.x + geometry.dx * ratio,
    y: geometry.start.y + geometry.dy * ratio,
  };
}

function addStation(stations, station, tolerance) {
  if (!stations.some((existing) => Math.abs(existing - station) <= tolerance)) {
    stations.push(station);
  }
}

function sortStations(stations) {
  return [...stations].sort((a, b) => a - b);
}

function resolveStation(value, geometry, unitResolver, label, defaultValue = null) {
  if (value == null) {
    return defaultValue;
  }

  if (value === "start") {
    return 0;
  }

  if (value === "end" || value === "span" || value === "length") {
    return geometry.length;
  }

  const station = unitResolver.length(value);

  assertFinite(station, label);

  if (station < -1e-12 || station > geometry.length + 1e-12) {
    throw new Error(`${label} must lie within the beam length.`);
  }

  return Math.min(geometry.length, Math.max(0, station));
}

function addDiscretizationStations(stations, geometry, unitResolver, discretization = {}) {
  const elementCount = discretization.elementCount ?? null;
  const maxElementLength =
    discretization.maxElementLength == null
      ? null
      : unitResolver.length(discretization.maxElementLength);
  const rawUserStations =
    discretization.stations ??
    discretization.userStations ??
    discretization.checkStations ??
    [];
  const userStations = Array.isArray(rawUserStations)
    ? rawUserStations
    : [rawUserStations];

  if (elementCount !== null) {
    if (!Number.isInteger(elementCount) || elementCount <= 0) {
      throw new Error("discretization.elementCount must be a positive integer.");
    }

    for (let index = 1; index < elementCount; index += 1) {
      addStation(stations, (geometry.length * index) / elementCount, 1e-9);
    }
  }

  if (maxElementLength !== null) {
    assertPositive(maxElementLength, "discretization.maxElementLength");

    const count = Math.ceil(geometry.length / maxElementLength);

    for (let index = 1; index < count; index += 1) {
      addStation(stations, (geometry.length * index) / count, 1e-9);
    }
  }

  for (const [index, station] of userStations.entries()) {
    addStation(
      stations,
      resolveStation(
        station,
        geometry,
        unitResolver,
        `discretization.stations[${index}]`,
      ),
      1e-9,
    );
  }
}

function normalizeVerificationStationMode(mode) {
  const normalized = String(mode ?? "combined").trim().toLowerCase();
  const aliases = {
    automatic: "auto",
    declared: "combined",
    grid: "auto",
    selected: "combined",
    fem: "all",
    samples: "all",
  };

  return aliases[normalized] ?? normalized;
}

function addVerificationStations(stations, geometry, unitResolver, verificationStations = null) {
  if (!verificationStations || verificationStations.enabled === false) {
    return;
  }

  const options = Array.isArray(verificationStations)
    ? { mode: "user", userStations: verificationStations }
    : verificationStations;
  const hasDeclaredStations =
    options.count != null ||
    options.stationCount != null ||
    options.userStations != null ||
    options.stations != null ||
    options.checkStations != null;
  const mode = normalizeVerificationStationMode(
    options.mode ?? (hasDeclaredStations ? "combined" : "all"),
  );
  const count = options.count ?? options.stationCount ?? null;
  const rawUserStations =
    options.userStations ??
    options.stations ??
    options.checkStations ??
    [];
  const userStations = Array.isArray(rawUserStations)
    ? rawUserStations
    : [rawUserStations];

  if (count != null && ["auto", "combined"].includes(mode)) {
    if (!Number.isInteger(count) || count < 2) {
      throw new Error("verificationStations.count must be an integer greater than or equal to 2.");
    }

    for (let index = 1; index < count - 1; index += 1) {
      addStation(stations, (geometry.length * index) / (count - 1), 1e-9);
    }
  }

  if (["user", "combined"].includes(mode)) {
    for (const [index, station] of userStations.entries()) {
      addStation(
        stations,
        resolveStation(
          station,
          geometry,
          unitResolver,
          `verificationStations.userStations[${index}]`,
        ),
        1e-9,
      );
    }
  }
}

function normalizeSupportDefinitions(supports) {
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

function normalizeLoadDirection(load) {
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

function normalizeProjection(value) {
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

function projectedLineLoadValue(value, load, geometry) {
  const projection = normalizeProjection(load.loadProjection);

  if (projection === "beam-axis") {
    return value;
  }

  return value * (geometry.horizontalSpan / geometry.length);
}

function convertBeamProperties(properties, targetUnits) {
  const propertyUnits = properties.units ?? DEFAULT_SECTION_PROPERTY_UNITS;
  const resolver = createUnitResolver(propertyUnits, targetUnits);
  const converted = {
    axialRigidity: resolver.force(properties.axialRigidity),
    flexuralRigidity: resolver.convert(properties.flexuralRigidity, {
      forceExponent: 1,
      lengthExponent: 2,
    }),
    shearRigidity:
      properties.shearRigidity == null
        ? null
        : resolver.force(properties.shearRigidity),
    shearCorrectionFactor: properties.shearCorrectionFactor ?? null,
    units: targetUnits,
    metadata: { ...properties.metadata },
  };

  return converted;
}

function resolveElementClass(analysisModel, overrideClass = null) {
  if (overrideClass) {
    return overrideClass;
  }

  const normalized = String(analysisModel ?? "euler-bernoulli")
    .trim()
    .toLowerCase();

  if (["euler-bernoulli", "euler", "eb"].includes(normalized)) {
    return FrameElement2DEulerBernoulli;
  }

  if (["timoshenko", "timo"].includes(normalized)) {
    return FrameElement2DTimoshenko;
  }

  throw new Error(`Unsupported beam analysis model: ${analysisModel}.`);
}

function convertDisplacementMap(displacementByNode, resolver) {
  return Object.fromEntries(
    Object.entries(displacementByNode).map(([nodeId, values]) => [
      nodeId,
      {
        ux: resolver.length(values.ux ?? 0),
        uy: resolver.length(values.uy ?? 0),
        rz: values.rz ?? 0,
      },
    ]),
  );
}

function convertReactionMap(reactionByNode, resolver) {
  return Object.fromEntries(
    Object.entries(reactionByNode).map(([nodeId, values]) => [
      nodeId,
      {
        ux: resolver.force(values.ux ?? 0),
        uy: resolver.force(values.uy ?? 0),
        rz: resolver.moment(values.rz ?? 0),
      },
    ]),
  );
}

function extremum(samples, key, compare) {
  if (samples.length === 0) {
    return null;
  }

  return samples.reduce((selected, sample) =>
    compare(sample[key], selected[key]) ? sample : selected,
  );
}

function summarizeInternalForces(samples) {
  return {
    maxAxialForce: extremum(samples, "n", (a, b) => a > b),
    minAxialForce: extremum(samples, "n", (a, b) => a < b),
    maxShearForce: extremum(samples, "v", (a, b) => a > b),
    minShearForce: extremum(samples, "v", (a, b) => a < b),
    maxBendingMoment: extremum(samples, "m", (a, b) => a > b),
    minBendingMoment: extremum(samples, "m", (a, b) => a < b),
    maxAbsBendingMoment: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.m) > Math.abs(selected.m) ? sample : selected,
      samples[0] ?? null,
    ),
  };
}

function summarizeReactions(samples) {
  return {
    maxHorizontalReaction: extremum(samples, "ux", (a, b) => a > b),
    minHorizontalReaction: extremum(samples, "ux", (a, b) => a < b),
    maxVerticalReaction: extremum(samples, "uy", (a, b) => a > b),
    minVerticalReaction: extremum(samples, "uy", (a, b) => a < b),
    maxSupportMomentReaction: extremum(samples, "rz", (a, b) => a > b),
    minSupportMomentReaction: extremum(samples, "rz", (a, b) => a < b),
    maxAbsHorizontalReaction: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.ux) > Math.abs(selected.ux) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsVerticalReaction: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.uy) > Math.abs(selected.uy) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsSupportMomentReaction: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.rz) > Math.abs(selected.rz) ? sample : selected,
      samples[0] ?? null,
    ),
  };
}

function selectExtreme(current, candidate, valueSelector, compare) {
  if (!candidate) {
    return current;
  }

  if (!current || compare(valueSelector(candidate), valueSelector(current))) {
    return candidate;
  }

  return current;
}

function annotateEnvelopeSample(result, sample, quantity, value) {
  if (!sample) {
    return null;
  }

  return {
    resultId: result.id,
    resultType: result.resultType,
    limitState: result.context?.limitState ?? null,
    combinationType: result.context?.combinationType ?? null,
    quantity,
    value,
    sample: { ...sample },
  };
}

function createEnvelope(resultsById) {
  const results = Object.values(resultsById ?? {});
  const state = {
    maxAxialForce: null,
    minAxialForce: null,
    maxShearForce: null,
    minShearForce: null,
    maxBendingMoment: null,
    minBendingMoment: null,
    maxAbsBendingMoment: null,
    maxAbsVerticalDisplacement: null,
    maxHorizontalReaction: null,
    minHorizontalReaction: null,
    maxVerticalReaction: null,
    minVerticalReaction: null,
    maxSupportMomentReaction: null,
    minSupportMomentReaction: null,
    maxAbsHorizontalReaction: null,
    maxAbsVerticalReaction: null,
    maxAbsSupportMomentReaction: null,
  };

  for (const result of results) {
    const forces = result.internalForces ?? {};
    const displacements = result.displacements ?? {};
    const reactions = result.reactions ?? {};

    state.maxAxialForce = selectExtreme(
      state.maxAxialForce,
      annotateEnvelopeSample(
        result,
        forces.maxAxialForce,
        "n",
        forces.maxAxialForce?.n,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minAxialForce = selectExtreme(
      state.minAxialForce,
      annotateEnvelopeSample(
        result,
        forces.minAxialForce,
        "n",
        forces.minAxialForce?.n,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxShearForce = selectExtreme(
      state.maxShearForce,
      annotateEnvelopeSample(
        result,
        forces.maxShearForce,
        "v",
        forces.maxShearForce?.v,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minShearForce = selectExtreme(
      state.minShearForce,
      annotateEnvelopeSample(
        result,
        forces.minShearForce,
        "v",
        forces.minShearForce?.v,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxBendingMoment = selectExtreme(
      state.maxBendingMoment,
      annotateEnvelopeSample(
        result,
        forces.maxBendingMoment,
        "m",
        forces.maxBendingMoment?.m,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minBendingMoment = selectExtreme(
      state.minBendingMoment,
      annotateEnvelopeSample(
        result,
        forces.minBendingMoment,
        "m",
        forces.minBendingMoment?.m,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxAbsBendingMoment = selectExtreme(
      state.maxAbsBendingMoment,
      annotateEnvelopeSample(
        result,
        forces.maxAbsBendingMoment,
        "absM",
        Math.abs(forces.maxAbsBendingMoment?.m ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsVerticalDisplacement = selectExtreme(
      state.maxAbsVerticalDisplacement,
      annotateEnvelopeSample(
        result,
        displacements.maxAbsVerticalDisplacement,
        "absUy",
        Math.abs(displacements.maxAbsVerticalDisplacement?.uy ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxHorizontalReaction = selectExtreme(
      state.maxHorizontalReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxHorizontalReaction,
        "rx",
        reactions.maxHorizontalReaction?.ux,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minHorizontalReaction = selectExtreme(
      state.minHorizontalReaction,
      annotateEnvelopeSample(
        result,
        reactions.minHorizontalReaction,
        "rx",
        reactions.minHorizontalReaction?.ux,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxVerticalReaction = selectExtreme(
      state.maxVerticalReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxVerticalReaction,
        "ry",
        reactions.maxVerticalReaction?.uy,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minVerticalReaction = selectExtreme(
      state.minVerticalReaction,
      annotateEnvelopeSample(
        result,
        reactions.minVerticalReaction,
        "ry",
        reactions.minVerticalReaction?.uy,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxSupportMomentReaction = selectExtreme(
      state.maxSupportMomentReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxSupportMomentReaction,
        "mrz",
        reactions.maxSupportMomentReaction?.rz,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minSupportMomentReaction = selectExtreme(
      state.minSupportMomentReaction,
      annotateEnvelopeSample(
        result,
        reactions.minSupportMomentReaction,
        "mrz",
        reactions.minSupportMomentReaction?.rz,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxAbsHorizontalReaction = selectExtreme(
      state.maxAbsHorizontalReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxAbsHorizontalReaction,
        "absRx",
        Math.abs(reactions.maxAbsHorizontalReaction?.ux ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsVerticalReaction = selectExtreme(
      state.maxAbsVerticalReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxAbsVerticalReaction,
        "absRy",
        Math.abs(reactions.maxAbsVerticalReaction?.uy ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsSupportMomentReaction = selectExtreme(
      state.maxAbsSupportMomentReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxAbsSupportMomentReaction,
        "absMrz",
        Math.abs(reactions.maxAbsSupportMomentReaction?.rz ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
  }

  return state;
}

function createEnvelopes(loadCases, combinations) {
  const allResults = {
    ...loadCases,
    ...combinations,
  };
  const ulsCombinations = Object.fromEntries(
    Object.entries(combinations).filter(
      ([, result]) => result.context?.limitState === "ULS",
    ),
  );
  const sleCombinations = Object.fromEntries(
    Object.entries(combinations).filter(
      ([, result]) => result.context?.limitState === "SLE",
    ),
  );

  return {
    loadCases: createEnvelope(loadCases),
    combinations: createEnvelope(combinations),
    uls: createEnvelope(ulsCombinations),
    sle: createEnvelope(sleCombinations),
    all: createEnvelope(allResults),
  };
}

function sampleBeamResult({ model, femModel, solution, sectionProperties }) {
  const resolver = createUnitResolver(FEM_UNITS, model.units);
  const displacementByNode = convertDisplacementMap(
    solution.displacementByNode,
    resolver,
  );
  const reactionByNode = convertReactionMap(solution.reactionByNode, resolver);
  const nodeResults = femModel.nodes.map((node) => ({
    id: node.id,
    station: resolver.length(node.metadata.station ?? 0),
    x: resolver.length(node.x),
    y: resolver.length(node.y),
    displacement: displacementByNode[node.id],
    reaction: reactionByNode[node.id],
  }));
  const supports = femModel.supports.map((support) => ({
    id: support.id,
    nodeId: support.node.id,
    station: resolver.length(support.metadata.station ?? 0),
    type: support.metadata.type ?? null,
    restraints: { ...support.restraints },
    reaction: reactionByNode[support.node.id],
  }));
  const reactionSamples = supports.map((support) => ({
    supportId: support.id,
    nodeId: support.nodeId,
    station: support.station,
    type: support.type,
    ux: support.reaction?.ux ?? 0,
    uy: support.reaction?.uy ?? 0,
    rz: support.reaction?.rz ?? 0,
  }));
  const internalForceSamples = [];

  for (const element of femModel.elements) {
    const elementLoads = femModel.loads.filter(
      (load) => load.element?.id === element.id,
    );
    const localStations = [0, element.length() / 2, element.length()];
    const samples = element.sampleInternalForces({
      displacements: solution.displacements,
      dofRegistry: solution.dofRegistry,
      loads: elementLoads,
      stations: localStations,
    });

    for (const sample of samples) {
      const station = (element.metadata.startStation ?? 0) + sample.x;
      const coordinates = coordinateAtStation(femModel.geometry, station);

      internalForceSamples.push({
        elementId: element.id,
        station: resolver.length(station),
        x: resolver.length(coordinates.x),
        y: resolver.length(coordinates.y),
        n: resolver.force(sample.n),
        v: resolver.force(sample.v),
        m: resolver.moment(sample.m),
      });
    }
  }

  const displacementSamples = nodeResults.map((node) => ({
    nodeId: node.id,
    station: node.station,
    x: node.x,
    y: node.y,
    ux: node.displacement.ux,
    uy: node.displacement.uy,
    rz: node.displacement.rz,
  }));
  const maxAbsVerticalDisplacement = displacementSamples.reduce(
    (selected, sample) =>
      Math.abs(sample.uy) > Math.abs(selected.uy) ? sample : selected,
    displacementSamples[0] ?? null,
  );

  return {
    units: model.units,
    geometry: femModel.outputGeometry,
    sectionProperties: convertBeamProperties(sectionProperties, model.units),
    nodes: nodeResults,
    supports,
    displacementByNode,
    reactionByNode,
    reactions: {
      samples: reactionSamples,
      ...summarizeReactions(reactionSamples),
    },
    displacements: {
      samples: displacementSamples,
      maxAbsVerticalDisplacement,
    },
    internalForces: {
      samples: internalForceSamples,
      ...summarizeInternalForces(internalForceSamples),
    },
    fem: {
      nodeCount: femModel.nodes.length,
      elementCount: femModel.elements.length,
      loadCount: femModel.allLoads.length,
    },
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
    this.metadata = { ...metadata };
  }
}

export class SingleBeamFemBuilder {
  constructor({
    nodeIdPrefix = "beam-node",
    elementIdPrefix = "beam-element",
    tolerance = 1e-9,
  } = {}) {
    assertPositive(tolerance, "tolerance");

    this.nodeIdPrefix = nodeIdPrefix;
    this.elementIdPrefix = elementIdPrefix;
    this.tolerance = tolerance;
  }

  build(modelOrInput, { loads = null, context = {} } = {}) {
    const model =
      modelOrInput instanceof SingleBeamModel
        ? modelOrInput
        : new SingleBeamModel(modelOrInput);
    const unitResolver = createUnitResolver(model.units, FEM_UNITS);
    const outputResolver = createUnitResolver(FEM_UNITS, model.units);
    const geometry = resolveGeometry(model.geometry, model.units);
    const outputGeometry = {
      start: {
        x: outputResolver.length(geometry.start.x),
        y: outputResolver.length(geometry.start.y),
      },
      end: {
        x: outputResolver.length(geometry.end.x),
        y: outputResolver.length(geometry.end.y),
      },
      length: outputResolver.length(geometry.length),
      horizontalSpan: outputResolver.length(geometry.horizontalSpan),
    };
    const providerContext = {
      ...context,
      analysisModel: model.analysisModel,
      geometry: outputGeometry,
      span: outputGeometry.length,
      units: model.units,
    };
    const sectionProperties =
      model.sectionProvider.getElasticBeamProperties(providerContext);
    const femProperties = convertBeamProperties(sectionProperties, FEM_UNITS);
    const ElementClass = resolveElementClass(model.analysisModel, model.elementClass);
    const elementOptions = {
      axialRigidity: femProperties.axialRigidity,
      flexuralRigidity: femProperties.flexuralRigidity,
      metadata: {
        sectionProperties: femProperties.metadata,
      },
    };

    if (ElementClass === FrameElement2DTimoshenko) {
      if (!Number.isFinite(femProperties.shearRigidity)) {
        throw new Error("Timoshenko beam analysis requires shearRigidity from the section provider.");
      }

      elementOptions.shearRigidity = femProperties.shearRigidity;
      elementOptions.shearCorrectionFactor =
        femProperties.shearCorrectionFactor ?? 1;
    }

    const selectedLoads = loads ?? model.loads;
    const stations = [0, geometry.length];

    addDiscretizationStations(
      stations,
      geometry,
      unitResolver,
      model.discretization,
    );
    addVerificationStations(
      stations,
      geometry,
      unitResolver,
      model.verificationStations,
    );

    for (const support of model.supports) {
      addStation(
        stations,
        resolveStation(
          support.position ?? support.x ?? support.station,
          geometry,
          unitResolver,
          `support ${support.id} position`,
          support.position === "end" ? geometry.length : 0,
        ),
        this.tolerance,
      );
    }

    for (const load of selectedLoads) {
      const type = load.type ?? "uniform";

      if (DISTRIBUTED_LOAD_TYPES.has(type)) {
        addStation(
          stations,
          resolveStation(load.from ?? load.start, geometry, unitResolver, `load ${load.id} start`, 0),
          this.tolerance,
        );
        addStation(
          stations,
          resolveStation(load.to ?? load.end, geometry, unitResolver, `load ${load.id} end`, geometry.length),
          this.tolerance,
        );
        continue;
      }

      if (POINT_LOAD_TYPES.has(type)) {
        addStation(
          stations,
          resolveStation(
            load.x ?? load.position ?? load.station,
            geometry,
            unitResolver,
            `load ${load.id} position`,
            geometry.length / 2,
          ),
          this.tolerance,
        );
        continue;
      }

      throw new Error(`Unsupported beam load type: ${type}.`);
    }

    const sortedStations = sortStations(stations);
    const nodes = sortedStations.map((station, index) => {
      const coordinates = coordinateAtStation(geometry, station);

      return new Node({
        id: `${model.id}-${this.nodeIdPrefix}-${index + 1}`,
        x: coordinates.x,
        y: coordinates.y,
        units: FEM_UNITS,
        metadata: {
          station,
        },
      });
    });
    const nodeAt = (station) => {
      const index = sortedStations.findIndex(
        (candidate) => Math.abs(candidate - station) <= this.tolerance,
      );

      if (index < 0) {
        throw new Error(`Cannot find a beam node at station ${station}.`);
      }

      return nodes[index];
    };
    const elements = [];

    for (let index = 0; index < nodes.length - 1; index += 1) {
      elements.push(
        new ElementClass({
          id: `${model.id}-${this.elementIdPrefix}-${index + 1}`,
          startNode: nodes[index],
          endNode: nodes[index + 1],
          ...elementOptions,
          metadata: {
            ...elementOptions.metadata,
            startStation: sortedStations[index],
            endStation: sortedStations[index + 1],
          },
        }),
      );
    }

    const supportObjects = model.supports
      .map((support) => {
        const station = resolveStation(
          support.position ?? support.x ?? support.station,
          geometry,
          unitResolver,
          `support ${support.id} position`,
          support.position === "end" ? geometry.length : 0,
        );
        const type = support.type ?? support.preset ?? "free";
        const restraints = support.restraints ?? resolveBeamSupportPreset(type);

        if (!Object.values(restraints).some(Boolean)) {
          return null;
        }

        return new Support({
          id: support.id,
          node: nodeAt(station),
          restraints,
          metadata: {
            ...support.metadata,
            station,
            type,
            referenceSystem: "global",
          },
        });
      })
      .filter(Boolean);
    const distributedLoads = [];
    const nodalLoads = [];

    for (const load of selectedLoads) {
      const type = load.type ?? "uniform";
      const factor = load.factor ?? 1;

      if (DISTRIBUTED_LOAD_TYPES.has(type)) {
        const from = resolveStation(
          load.from ?? load.start,
          geometry,
          unitResolver,
          `load ${load.id} start`,
          0,
        );
        const to = resolveStation(
          load.to ?? load.end,
          geometry,
          unitResolver,
          `load ${load.id} end`,
          geometry.length,
        );

        if (from >= to) {
          throw new Error(`Distributed load ${load.id} requires from < to.`);
        }

        const startValue = load.value ?? load.startValue;
        const endValue = load.endValue ?? startValue;

        assertFinite(startValue, `load ${load.id} value`);
        assertFinite(endValue, `load ${load.id} endValue`);

        if (Math.abs(startValue - endValue) > 1e-12) {
          throw new Error("SingleBeamAnalysis supports only uniform distributed loads.");
        }

        const lineLoad = unitResolver.lineLoad(startValue * factor);
        const axisLineLoad = projectedLineLoadValue(lineLoad, load, geometry);
        const { referenceSystem, direction } = normalizeLoadDirection(load);

        if (direction === "mz") {
          throw new Error("Distributed moment loads are not supported in SingleBeamAnalysis.");
        }

        for (const element of elements) {
          const startStation = element.metadata.startStation;
          const endStation = element.metadata.endStation;
          const covered =
            startStation >= from - this.tolerance &&
            endStation <= to + this.tolerance;

          if (!covered) {
            continue;
          }

          distributedLoads.push(
            new DistributedLoad({
              id: `${load.id}-${element.id}`,
              element,
              startValue: axisLineLoad,
              direction,
              referenceSystem,
              distribution: "uniform",
              length: element.length(),
              units: FEM_UNITS,
              metadata: {
                sourceId: load.id,
                actionType: load.actionType,
                loadCaseId: load.loadCaseId,
                from: startStation,
                to: endStation,
                loadProjection: normalizeProjection(load.loadProjection),
                sourceValue: startValue,
                appliedFactor: factor,
              },
            }),
          );
        }

        continue;
      }

      if (POINT_LOAD_TYPES.has(type)) {
        const station = resolveStation(
          load.x ?? load.position ?? load.station,
          geometry,
          unitResolver,
          `load ${load.id} position`,
          geometry.length / 2,
        );
        const { direction } = normalizeLoadDirection(load);
        let components = {};

        if (load.components) {
          components = {
            fx: unitResolver.force((load.components.fx ?? 0) * factor),
            fy: unitResolver.force((load.components.fy ?? 0) * factor),
            mz: unitResolver.moment((load.components.mz ?? 0) * factor),
          };
        } else {
          const value = load.value ?? load.magnitude;

          assertFinite(value, `load ${load.id} value`);

          if (direction === "x") {
            components.fx = unitResolver.force(value * factor);
          } else if (direction === "y") {
            components.fy = unitResolver.force(value * factor);
          } else {
            components.mz = unitResolver.moment(value * factor);
          }
        }

        nodalLoads.push(
          new NodalLoad({
            id: load.id,
            node: nodeAt(station),
            components,
            units: FEM_UNITS,
            metadata: {
              sourceId: load.id,
              actionType: load.actionType,
              loadCaseId: load.loadCaseId,
              station,
              appliedFactor: factor,
            },
          }),
        );
      }
    }

    return {
      id: model.id,
      units: FEM_UNITS,
      geometry,
      outputGeometry,
      nodes,
      elements,
      supports: supportObjects,
      loads: distributedLoads,
      nodalLoads,
      allLoads: [...distributedLoads, ...nodalLoads],
      stations: sortedStations,
      sectionProperties,
      metadata: {
        sourceUnits: model.units,
        analysisModel: model.analysisModel,
        generatedBy: "SingleBeamFemBuilder",
      },
    };
  }
}

function groupLoadsByCase(loads) {
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

function normalizeCombinations(combinations, loadCaseIds) {
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

function loadsForCombination(loads, factors) {
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

function createBeamAnalysisContext(model, loads, context = {}) {
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

export class SingleBeamAnalysis {
  constructor({
    femBuilder = new SingleBeamFemBuilder(),
    linearSolver = null,
  } = {}) {
    this.femBuilder = femBuilder;
    this.linearSolver = linearSolver;
  }

  analyze(input = {}) {
    const model = input instanceof SingleBeamModel ? input : new SingleBeamModel(input);
    const loadCaseGroups = groupLoadsByCase(model.loads);
    const loadCases = {};

    for (const [loadCaseId, loads] of loadCaseGroups.entries()) {
      loadCases[loadCaseId] = this.solve(model, loads, {
        loadCaseId,
        resultType: "load-case",
      });
    }

    const combinations = {};
    const combinationDefinitions = normalizeCombinations(
      model.combinations,
      [...loadCaseGroups.keys()],
    );

    for (const combination of combinationDefinitions) {
      combinations[combination.id] = {
        ...this.solve(
          model,
          loadsForCombination(model.loads, combination.factors),
          {
            combinationId: combination.id,
            resultType: "combination",
            factors: combination.factors,
            ...combination.metadata,
          },
        ),
        factors: { ...combination.factors },
        name: combination.name,
      };
    }

    return {
      id: model.id,
      units: model.units,
      analysisModel: model.analysisModel,
      loadCases,
      combinations,
      envelopes: createEnvelopes(loadCases, combinations),
      metadata: {
        ...model.metadata,
        generatedBy: "SingleBeamAnalysis",
      },
    };
  }

  solve(model, loads, context) {
    const analysisContext = createBeamAnalysisContext(model, loads, context);
    const femModel = this.femBuilder.build(model, {
      loads,
      context: analysisContext,
    });
    const solver = new LinearStaticSolver2D({
      linearSolver: this.linearSolver ?? undefined,
    });
    const solution = solver.solve(femModel);

    return {
      id: context.loadCaseId ?? context.combinationId ?? model.id,
      resultType: context.resultType,
      loads: loads.map((load) => ({
        id: load.id,
        actionType: load.actionType,
        loadCaseId: load.loadCaseId,
        loadDurationClass: load.loadDurationClass ?? null,
        factor: load.factor ?? 1,
      })),
      context: {
        resultType: analysisContext.resultType,
        limitState: analysisContext.limitState ?? null,
        combinationType: analysisContext.combinationType ?? null,
        serviceCombination: analysisContext.serviceCombination ?? null,
        leadingLoadCaseId: analysisContext.leadingLoadCaseId ?? null,
        leadingActionId: analysisContext.leadingActionId ?? null,
        leadingVariableCategory: analysisContext.leadingVariableCategory ?? null,
        accompanyingLoadCaseIds: [
          ...(analysisContext.accompanyingLoadCaseIds ?? []),
        ],
        loadCaseFactors: { ...analysisContext.loadCaseFactors },
        activeLoads: analysisContext.activeLoads.map((load) => ({ ...load })),
        governingLoadDurationClass:
          analysisContext.governingLoadDurationClass,
        governingLoad: analysisContext.governingLoad
          ? { ...analysisContext.governingLoad }
          : null,
      },
      ...sampleBeamResult({
        model,
        femModel,
        solution,
        sectionProperties: femModel.sectionProperties,
      }),
    };
  }
}
