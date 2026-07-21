import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";
import { WallSoilReactionLaw } from "./WallSoilReactionLaw.js";

export const EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION =
  "embedded-retaining-wall-scenario/v1";

export const EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS = Object.freeze([
  "static",
  "pseudostatic",
]);

export const EMBEDDED_RETAINING_WALL_SUPPORT_TYPES = Object.freeze([
  "ground-anchor",
  "strut",
  "generic-support",
]);

export const EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS = Object.freeze([
  "unilateral",
  "bilateral",
]);

const SIDES = Object.freeze(["retained", "excavation"]);
const DIRECTIONS = Object.freeze([
  "toward-retained-side",
  "toward-excavation-side",
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative.`);
  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return number;
}

function provenance(value, label) {
  const normalized = structuredClone(value ?? {});
  if (typeof normalized.source !== "string" || !normalized.source.trim()) {
    throw new Error(`${label}.source is required.`);
  }
  normalized.source = normalized.source.trim();
  return normalized;
}

function normalizeLayerCurve(side, layerId, input, resolver, units) {
  if (!Array.isArray(input?.stations) || input.stations.length === 0) {
    throw new Error(
      `soilResponse.sides.${side}.curvesByLayer.${layerId} requires stations.`,
    );
  }
  const stations = input.stations.map((station, index) => {
    const lawInput = station.law ?? station.curve;
    const law = lawInput instanceof WallSoilReactionLaw
      ? lawInput
      : new WallSoilReactionLaw({
          ...lawInput,
          id: lawInput?.id ?? `${side}-${layerId}-wall-law-${index + 1}`,
          units: lawInput?.units ?? units,
        });
    const depth = resolver.length(finite(
      station.depth,
      `${side}.${layerId}.stations[${index}].depth`,
    ));
    if (depth < 0) throw new Error("Wall-soil station depth cannot be negative.");
    return {
      depth,
      law,
      metadata: structuredClone(station.metadata ?? {}),
    };
  }).sort((left, right) => left.depth - right.depth);
  for (let index = 1; index < stations.length; index += 1) {
    if (stations[index].depth <= stations[index - 1].depth) {
      throw new Error(`${side}.${layerId} station depths must be unique.`);
    }
  }
  const reactionMultiplier = positive(
    input.reactionMultiplier ?? 1,
    `${side}.${layerId}.reactionMultiplier`,
  );
  if (reactionMultiplier !== 1 && input.provenance == null) {
    throw new Error(
      `${side}.${layerId}.provenance is required for a reactionMultiplier.`,
    );
  }
  return {
    layerId,
    interpolation: "linear-response",
    outsideStationRange: "nearest-station",
    reactionMultiplier,
    provenance: input.provenance == null
      ? null
      : provenance(input.provenance, `${side}.${layerId}.provenance`),
    stations,
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizeSide(side, input, resolver, units) {
  if (!input?.profileId) {
    throw new Error(`soilResponse.sides.${side}.profileId is required.`);
  }
  if (!input.curvesByLayer || typeof input.curvesByLayer !== "object" ||
    Array.isArray(input.curvesByLayer)) {
    throw new Error(
      `soilResponse.sides.${side}.curvesByLayer must be an object map.`,
    );
  }
  const curvesByLayer = Object.fromEntries(Object.entries(
    input.curvesByLayer,
  ).map(([layerId, curve]) => [
    layerId,
    normalizeLayerCurve(side, layerId, curve, resolver, units),
  ]));
  if (Object.keys(curvesByLayer).length === 0) {
    throw new Error(`soilResponse.sides.${side}.curvesByLayer is empty.`);
  }
  return {
    side,
    profileId: String(input.profileId),
    xCoordinate: resolver.length(finite(
      input.xCoordinate ?? (side === "retained" ? -0.5 : 0.5),
      `soilResponse.sides.${side}.xCoordinate`,
    )),
    defaultPorePressureFieldId: input.defaultPorePressureFieldId == null
      ? null
      : String(input.defaultPorePressureFieldId),
    curvesByLayer,
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizeSupport(input, index, resolver) {
  const type = input.type ?? "generic-support";
  const behavior = input.behavior ?? "unilateral";
  const actionDirection = input.actionDirection ?? "toward-retained-side";
  if (!EMBEDDED_RETAINING_WALL_SUPPORT_TYPES.includes(type)) {
    throw new Error(`Unsupported embedded-wall support type: ${type}.`);
  }
  if (!EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS.includes(behavior)) {
    throw new Error(`Unsupported embedded-wall support behavior: ${behavior}.`);
  }
  if (!DIRECTIONS.includes(actionDirection)) {
    throw new Error(`Unsupported support actionDirection: ${actionDirection}.`);
  }
  const capacity = input.capacity == null
    ? null
    : {
        maximumForce: positive(
          resolver.force(finite(
            input.capacity.maximumForce,
            `supports[${index}].capacity.maximumForce`,
          )),
          `supports[${index}].capacity.maximumForce`,
        ),
        basis: String(input.capacity.basis ?? "assigned"),
        provenance: provenance(
          input.capacity.provenance,
          `supports[${index}].capacity.provenance`,
        ),
      };
  return {
    id: String(input.id ?? `support-${index + 1}`),
    name: input.name ?? input.id ?? `support-${index + 1}`,
    type,
    elevation: resolver.length(finite(
      input.elevation,
      `supports[${index}].elevation`,
    )),
    stiffness: positive(resolver.convert(finite(
      input.stiffness,
      `supports[${index}].stiffness`,
    ), { forceExponent: 1, lengthExponent: -1 }),
      `supports[${index}].stiffness`),
    prestress: nonNegative(resolver.force(finite(
      input.prestress ?? 0,
      `supports[${index}].prestress`,
    )), `supports[${index}].prestress`),
    actionDirection,
    behavior,
    capacity,
    provenance: provenance(
      input.provenance,
      `supports[${index}].provenance`,
    ),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizePressureSegments(input, component, resolver, label) {
  const diagram = input.diagram?.toJSON instanceof Function
    ? input.diagram.toJSON()
    : input.diagram;
  if (diagram?.segments) {
    return diagram.segments.map((segment, index) => ({
      topElevation: finite(
        segment.topElevation,
        `${label}.diagram.segments[${index}].topElevation`,
      ),
      bottomElevation: finite(
        segment.bottomElevation,
        `${label}.diagram.segments[${index}].bottomElevation`,
      ),
      topPressure: finite(
        segment.top?.[component],
        `${label}.diagram.segments[${index}].top.${component}`,
      ),
      bottomPressure: finite(
        segment.bottom?.[component],
        `${label}.diagram.segments[${index}].bottom.${component}`,
      ),
    }));
  }
  if (!Array.isArray(input.segments) || input.segments.length === 0) {
    throw new Error(`${label} requires a diagram or pressure segments.`);
  }
  return input.segments.map((segment, index) => ({
    topElevation: resolver.length(finite(
      segment.topElevation,
      `${label}.segments[${index}].topElevation`,
    )),
    bottomElevation: resolver.length(finite(
      segment.bottomElevation,
      `${label}.segments[${index}].bottomElevation`,
    )),
    topPressure: resolver.stress(finite(
      segment.topPressure,
      `${label}.segments[${index}].topPressure`,
    )),
    bottomPressure: resolver.stress(finite(
      segment.bottomPressure,
      `${label}.segments[${index}].bottomPressure`,
    )),
  }));
}

function normalizePressureLoad(input, index, resolver) {
  const side = input.side;
  const component = input.component ?? "totalNormal";
  if (!SIDES.includes(side)) {
    throw new Error(`pressureLoads[${index}].side is invalid.`);
  }
  const segments = normalizePressureSegments(
    input,
    component,
    resolver,
    `pressureLoads[${index}]`,
  );
  for (const segment of segments) {
    if (segment.topElevation <= segment.bottomElevation) {
      throw new Error("Pressure-load segment top must be above bottom.");
    }
    if (segment.topPressure < 0 || segment.bottomPressure < 0) {
      throw new Error("Pressure-load magnitudes must be non-negative.");
    }
  }
  return {
    id: String(input.id ?? `pressure-load-${index + 1}`),
    side,
    component,
    category: String(input.category ?? "assigned"),
    scale: finite(input.scale ?? 1, `pressureLoads[${index}].scale`),
    segments,
    provenance: provenance(
      input.provenance,
      `pressureLoads[${index}].provenance`,
    ),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizeNodalAction(input, index, resolver) {
  const force = resolver.force(finite(
    input.force ?? 0,
    `nodalActions[${index}].force`,
  ));
  const moment = resolver.moment(finite(
    input.moment ?? 0,
    `nodalActions[${index}].moment`,
  ));
  if (force === 0 && moment === 0) {
    throw new Error("A nodal action must contain a non-zero force or moment.");
  }
  return {
    id: String(input.id ?? `nodal-action-${index + 1}`),
    elevation: resolver.length(finite(
      input.elevation,
      `nodalActions[${index}].elevation`,
    )),
    force,
    moment,
    provenance: provenance(
      input.provenance,
      `nodalActions[${index}].provenance`,
    ),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizeStage(input, index, resolver) {
  const porePressureFieldIdBySide = {};
  for (const side of SIDES) {
    if (Object.hasOwn(input.porePressureFieldIdBySide ?? {}, side)) {
      const value = input.porePressureFieldIdBySide[side];
      porePressureFieldIdBySide[side] = value == null ? null : String(value);
    }
  }
  return {
    id: String(input.id ?? `stage-${index + 1}`),
    name: input.name ?? input.id ?? `Stage ${index + 1}`,
    retainedGroundElevation: resolver.length(finite(
      input.retainedGroundElevation,
      `stages[${index}].retainedGroundElevation`,
    )),
    excavationGroundElevation: resolver.length(finite(
      input.excavationGroundElevation,
      `stages[${index}].excavationGroundElevation`,
    )),
    activeSupportIds: [...new Set((input.activeSupportIds ?? []).map(String))],
    porePressureFieldIdBySide,
    pressureLoads: (input.pressureLoads ?? []).map((load, loadIndex) =>
      normalizePressureLoad(load, loadIndex, resolver)),
    nodalActions: (input.nodalActions ?? []).map((action, actionIndex) =>
      normalizeNodalAction(action, actionIndex, resolver)),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizeSolver(input, resolver) {
  const minimumStageIncrement = positive(
    input?.minimumStageIncrement ?? 1 / 1024,
    "solver.minimumStageIncrement",
  );
  if (minimumStageIncrement >= 1) {
    throw new Error("solver.minimumStageIncrement must be less than one.");
  }
  return {
    strategy: "staged-incremental-damped-newton",
    incrementsPerStage: positiveInteger(
      input?.incrementsPerStage ?? 10,
      "solver.incrementsPerStage",
    ),
    maxIterations: positiveInteger(
      input?.maxIterations ?? 50,
      "solver.maxIterations",
    ),
    maxLineSearchReductions: positiveInteger(
      input?.maxLineSearchReductions ?? 12,
      "solver.maxLineSearchReductions",
    ),
    relativeResidualTolerance: positive(
      input?.relativeResidualTolerance ?? 1e-8,
      "solver.relativeResidualTolerance",
    ),
    displacementTolerance: positive(resolver.length(finite(
      input?.displacementTolerance ?? 1e-10,
      "solver.displacementTolerance",
    )), "solver.displacementTolerance"),
    minimumStageIncrement,
  };
}

function serializeSide(side) {
  return {
    side: side.side,
    profileId: side.profileId,
    xCoordinate: side.xCoordinate,
    defaultPorePressureFieldId: side.defaultPorePressureFieldId,
    curvesByLayer: Object.fromEntries(Object.entries(side.curvesByLayer).map(
      ([layerId, curve]) => [layerId, {
        layerId,
        interpolation: curve.interpolation,
        outsideStationRange: curve.outsideStationRange,
        reactionMultiplier: curve.reactionMultiplier,
        provenance: structuredClone(curve.provenance),
        stations: curve.stations.map((station) => ({
          depth: station.depth,
          law: station.law.toJSON(),
          metadata: structuredClone(station.metadata),
        })),
        metadata: structuredClone(curve.metadata),
      }],
    )),
    metadata: structuredClone(side.metadata),
  };
}

export class EmbeddedRetainingWallScenario {
  constructor({
    id,
    name = null,
    loadingCondition = "static",
    loadingProvenance = null,
    soilResponse = null,
    supports = [],
    stages = [],
    discretization = null,
    solver = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("An EmbeddedRetainingWallScenario id is required.");
    if (!EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS.includes(
      loadingCondition,
    )) {
      throw new Error(`Unsupported wall loading condition: ${loadingCondition}.`);
    }
    assertExplicitUnitSystem(units, "EmbeddedRetainingWallScenario");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const model = soilResponse?.model ??
      "assigned-effective-pressure-displacement-curves";
    if (model !== "assigned-effective-pressure-displacement-curves") {
      throw new Error(`Unsupported embedded-wall soil response: ${model}.`);
    }
    const normalizedSupports = supports.map((support, index) =>
      normalizeSupport(support, index, resolver));
    const supportIds = normalizedSupports.map(({ id: supportId }) => supportId);
    if (new Set(supportIds).size !== supportIds.length) {
      throw new Error("Embedded-wall support ids must be unique.");
    }
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new Error("EmbeddedRetainingWallScenario requires stages.");
    }
    const normalizedStages = stages.map((stage, index) =>
      normalizeStage(stage, index, resolver));
    const stageIds = normalizedStages.map(({ id: stageId }) => stageId);
    if (new Set(stageIds).size !== stageIds.length) {
      throw new Error("Embedded-wall stage ids must be unique.");
    }
    for (const stage of normalizedStages) {
      for (const supportId of stage.activeSupportIds) {
        if (!supportIds.includes(supportId)) {
          throw new Error(
            `Stage ${stage.id} references unknown support ${supportId}.`,
          );
        }
      }
    }
    if (loadingCondition === "pseudostatic") {
      if (loadingProvenance == null) {
        throw new Error(
          "Pseudostatic loading requires loadingProvenance.source.",
        );
      }
      if (!normalizedStages.some((stage) => stage.pressureLoads.some(
        ({ category }) => category === "seismic",
      ))) {
        throw new Error(
          "Pseudostatic loading requires at least one seismic pressure load.",
        );
      }
    }

    this.schemaVersion = EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION;
    this.id = String(id);
    this.name = name ?? this.id;
    this.loadingCondition = loadingCondition;
    this.loadingProvenance = loadingProvenance == null
      ? null
      : provenance(loadingProvenance, "loadingProvenance");
    this.soilResponse = {
      model,
      sides: {
        retained: normalizeSide(
          "retained",
          soilResponse?.sides?.retained,
          resolver,
          units,
        ),
        excavation: normalizeSide(
          "excavation",
          soilResponse?.sides?.excavation,
          resolver,
          units,
        ),
      },
      loading: "static-envelope-memoryless",
      metadata: structuredClone(soilResponse?.metadata ?? {}),
    };
    this.supports = normalizedSupports;
    this.stages = normalizedStages;
    this.discretization = {
      model: "boundary-conforming-euler-bernoulli",
      maxElementLength: positive(resolver.length(finite(
        discretization?.maxElementLength ?? 0.5,
        "discretization.maxElementLength",
      )), "discretization.maxElementLength"),
    };
    this.solver = normalizeSolver(solver, resolver);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      signConvention: {
        displacement:
          "positive from retained side toward excavation side",
        rotation: "dy/dx with x positive downward from wall top",
        pressure:
          "positive magnitude acts from the selected soil side into wall",
        supportForce:
          "positive scalar acts in support.actionDirection",
      },
    };
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      loadingCondition: this.loadingCondition,
      loadingProvenance: structuredClone(this.loadingProvenance),
      soilResponse: {
        model: this.soilResponse.model,
        sides: {
          retained: serializeSide(this.soilResponse.sides.retained),
          excavation: serializeSide(this.soilResponse.sides.excavation),
        },
        loading: this.soilResponse.loading,
        metadata: structuredClone(this.soilResponse.metadata),
      },
      supports: structuredClone(this.supports),
      stages: structuredClone(this.stages),
      discretization: { ...this.discretization },
      solver: { ...this.solver },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
