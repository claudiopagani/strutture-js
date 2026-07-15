// @ts-check

import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const UNIT_WIDTH = 1000;
const DIRECTIONS = Object.freeze(["x", "y"]);
const FACES = Object.freeze(["top", "bottom"]);
const MEMBRANE_ACTION_KEYS = Object.freeze([
  "nxx", "nyy", "nxy", "nx", "ny", "n",
]);

export const RC_PLATE_ANALYSIS_TYPES = Object.freeze({
  ULS_BENDING_SHEAR: "ULS_BENDING_SHEAR",
  SLS_STRESS_CRACKING: "SLS_STRESS_CRACKING",
  SLS_SIMPLIFIED_DEFLECTION: "SLS_SIMPLIFIED_DEFLECTION",
});

const ANALYSIS_TYPES = new Set(Object.values(RC_PLATE_ANALYSIS_TYPES));

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function normalizeCombinationType(value) {
  if (value == null || value === "") {
    return null;
  }

  return String(value).trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function normalizeActions(actions, resolver, label) {
  const source = actions ?? {};

  for (const key of MEMBRANE_ACTION_KEYS) {
    if (Number.isFinite(source[key]) && Math.abs(source[key]) > 1e-12) {
      throw new Error(`${label}.${key} is outside the plate-module scope; membrane actions must be zero.`);
    }
  }

  const normalized = {
    mxx: resolver.force(source.mxx ?? 0),
    myy: resolver.force(source.myy ?? 0),
    mxy: resolver.force(source.mxy ?? 0),
    qx: resolver.lineLoad(source.qx ?? 0),
    qy: resolver.lineLoad(source.qy ?? 0),
  };

  for (const [key, value] of Object.entries(normalized)) {
    if (!Number.isFinite(value)) {
      throw new Error(`${label}.${key} must be finite.`);
    }
  }

  return normalized;
}

function normalizeLayer({ input, face, direction, thickness, resolver }) {
  if (!input) {
    throw new Error(`reinforcement.${face}.${direction} is required.`);
  }

  const barsPerMeter = positive(
    Number(input.barsPerMeter),
    `reinforcement.${face}.${direction}.barsPerMeter`,
  );
  const diameter = positive(
    resolver.length(Number(input.diameter)),
    `reinforcement.${face}.${direction}.diameter`,
  );
  const clearCover = positive(
    resolver.length(Number(input.clearCover)),
    `reinforcement.${face}.${direction}.clearCover`,
  );
  const axis = face === "bottom"
    ? clearCover + diameter / 2
    : thickness - clearCover - diameter / 2;

  if (axis - diameter / 2 < -1e-9 || axis + diameter / 2 > thickness + 1e-9) {
    throw new Error(`reinforcement.${face}.${direction} is outside the plate thickness.`);
  }

  return {
    barsPerMeter,
    diameter,
    clearCover,
    area: barsPerMeter * Math.PI * diameter ** 2 / 4,
    spacing: UNIT_WIDTH / barsPerMeter,
    axis,
    face,
    direction,
  };
}

function normalizeShearReinforcement({ input, thickness, resolver }) {
  if (input == null) {
    return null;
  }

  const diameter = positive(
    resolver.length(Number(input.diameter)),
    "reinforcement.shear.diameter",
  );
  const spacingX = positive(
    resolver.length(Number(input.spacingX)),
    "reinforcement.shear.spacingX",
  );
  const spacingY = positive(
    resolver.length(Number(input.spacingY)),
    "reinforcement.shear.spacingY",
  );

  if (diameter >= thickness) {
    throw new Error("reinforcement.shear.diameter must be smaller than the plate thickness.");
  }

  const areaPerLink = Math.PI * diameter ** 2 / 4;

  return {
    type: "vertical-s-links",
    diameter,
    spacingX,
    spacingY,
    angle: 90,
    effectiveLegsPerLink: 1,
    areaPerLink,
    linksPerSquareMeter: 1_000_000 / (spacingX * spacingY),
    areaPerSpacingForUnitStrip:
      UNIT_WIDTH * areaPerLink / (spacingX * spacingY),
    anchorageAssumption: "effective-around-top-and-bottom-longitudinal-reinforcement",
  };
}

function validateLayerSeparation(layers, thickness) {
  for (let index = 0; index < layers.length; index += 1) {
    const first = layers[index];

    for (let otherIndex = index + 1; otherIndex < layers.length; otherIndex += 1) {
      const second = layers[otherIndex];
      const crossingLayers = first.face === second.face || first.direction === second.direction;

      if (!crossingLayers) {
        continue;
      }

      const required = (first.diameter + second.diameter) / 2;
      const actual = Math.abs(first.axis - second.axis);

      if (actual + Math.max(1e-9, thickness * 1e-12) < required) {
        throw new Error(
          `Reinforcement layers ${first.face}-${first.direction} and ${second.face}-${second.direction} overlap geometrically; adjust clearCover or diameters.`,
        );
      }
    }
  }
}

function normalizeDeflection(deflection, resolver) {
  const source = deflection ?? {};
  const forbiddenKeys = ["system", "structuralSystem", "supportSystem", "scheme"];

  for (const key of forbiddenKeys) {
    if (source[key] != null) {
      throw new Error("The simplified plate deflection check has the fixed flat_slab structural system.");
    }
  }

  return {
    spanX: Number.isFinite(source.spanX) ? resolver.length(source.spanX) : null,
    spanY: Number.isFinite(source.spanY) ? resolver.length(source.spanY) : null,
  };
}

export class ReinforcedConcretePlateModel {
  constructor({
    id,
    units = null,
    materials = {},
    geometry = {},
    reinforcement = {},
    analysis = {},
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("A reinforced concrete plate model id is required.");
    }

    assertExplicitUnitSystem(units, "ReinforcedConcretePlateModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const thickness = positive(
      resolver.length(Number(geometry.thickness)),
      "geometry.thickness",
    );
    const unitWidth = geometry.unitWidth == null
      ? UNIT_WIDTH
      : resolver.length(Number(geometry.unitWidth));

    if (!Number.isFinite(unitWidth) || Math.abs(unitWidth - UNIT_WIDTH) > 1e-6) {
      throw new Error("geometry.unitWidth must represent exactly 1000 mm.");
    }

    if (!materials.concreteMaterial || !materials.reinforcementMaterial) {
      throw new Error("materials.concreteMaterial and materials.reinforcementMaterial are required.");
    }

    const angle = reinforcement.angle ?? 0;

    if (!Number.isFinite(angle)) {
      throw new Error("reinforcement.angle must be finite and expressed in degrees.");
    }

    const normalizedReinforcement = { angle };
    const layers = [];

    for (const face of FACES) {
      normalizedReinforcement[face] = {};
      for (const direction of DIRECTIONS) {
        const layer = normalizeLayer({
          input: reinforcement[face]?.[direction],
          face,
          direction,
          thickness,
          resolver,
        });
        normalizedReinforcement[face][direction] = layer;
        layers.push(layer);
      }
    }

    validateLayerSeparation(layers, thickness);
    normalizedReinforcement.shear = normalizeShearReinforcement({
      input: reinforcement.shear,
      thickness,
      resolver,
    });

    const type = analysis.type;

    if (!ANALYSIS_TYPES.has(type)) {
      throw new Error(`Unsupported reinforced concrete plate analysis type: ${type}.`);
    }

    const defaultCombinationType = normalizeCombinationType(analysis.combinationType);
    const defaultActions = normalizeActions(analysis.actions, resolver, "analysis.actions");
    const states = Array.isArray(analysis.states) && analysis.states.length > 0
      ? analysis.states.map((state, index) => ({
          id: state.id ?? `state-${index + 1}`,
          combinationType: normalizeCombinationType(
            state.combinationType ?? defaultCombinationType,
          ),
          actions: normalizeActions(
            state.actions,
            resolver,
            `analysis.states[${index}].actions`,
          ),
        }))
      : [{
          id: analysis.stateId ?? "state-1",
          combinationType: defaultCombinationType,
          actions: defaultActions,
        }];
    const deflection = normalizeDeflection(analysis.deflection, resolver);

    if (type === RC_PLATE_ANALYSIS_TYPES.SLS_SIMPLIFIED_DEFLECTION) {
      positive(deflection.spanX, "analysis.deflection.spanX");
      positive(deflection.spanY, "analysis.deflection.spanY");
    }

    this.id = id;
    this.units = INTERNAL_UNITS;
    this.materials = { ...materials };
    this.geometry = { thickness, unitWidth };
    this.reinforcement = normalizedReinforcement;
    this.analysis = {
      ...analysis,
      type,
      combinationType: defaultCombinationType,
      actions: defaultActions,
      states,
      deflection,
      serviceability: { ...(analysis.serviceability ?? {}) },
      mesh: { ...(analysis.mesh ?? {}) },
      solver: { ...(analysis.solver ?? {}) },
    };
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  toJSON() {
    return {
      id: this.id,
      units: { ...this.units },
      materials: {
        concreteMaterial: this.materials.concreteMaterial?.toJSON?.() ?? this.materials.concreteMaterial,
        reinforcementMaterial: this.materials.reinforcementMaterial?.toJSON?.() ?? this.materials.reinforcementMaterial,
      },
      geometry: { ...this.geometry },
      reinforcement: structuredClone(this.reinforcement),
      analysis: structuredClone({
        type: this.analysis.type,
        combinationType: this.analysis.combinationType,
        actions: this.analysis.actions,
        states: this.analysis.states,
        deflection: this.analysis.deflection,
        serviceability: this.analysis.serviceability,
        mesh: this.analysis.mesh,
        solver: this.analysis.solver,
      }),
      metadata: { ...this.metadata },
    };
  }
}
