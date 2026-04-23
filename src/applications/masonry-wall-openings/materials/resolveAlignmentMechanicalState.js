import { uniqueStrings } from "../../../core/results/checkUtils.js";
import { MasonryWallOpeningsModel } from "../models/MasonryWallOpeningsModel.js";
import { resolveMasonryStageMaterial } from "./resolveMasonryStageMaterial.js";

function resolveStageSettings(alignment, options = {}) {
  return {
    normativePreset:
      options.normativePreset ??
      options.materialNormativePreset ??
      alignment.settings?.normativePreset ??
      "tuscany-openings-2022",
    stiffnessSelection:
      options.stiffnessSelection ??
      alignment.settings?.stiffnessSelection ??
      "mean",
    strengthSelection:
      options.strengthSelection ??
      alignment.settings?.strengthSelection ??
      "mean",
    stiffnessState:
      options.stiffnessState ??
      alignment.settings?.stiffnessState ??
      "cracked",
    useCorrectiveModifiers:
      options.useCorrectiveModifiers ??
      alignment.settings?.useCorrectiveModifiers ??
      true,
    divideByConfidenceFactor:
      options.divideByConfidenceFactor ??
      alignment.settings?.divideByConfidenceFactor ??
      false,
  };
}

function resolveWallOverride(options = {}, wallId) {
  return (
    options.wallMaterialOverrides?.[wallId] ??
    options.materialOverridesByWallId?.[wallId] ??
    options.materialOverrides?.[wallId] ??
    null
  );
}

function createResolvedAlignmentModel(alignment, resolvedWalls, settings) {
  return new MasonryWallOpeningsModel({
    id: alignment.id,
    label: alignment.label,
    units: alignment.units,
    walls: resolvedWalls.map((wall, index) => ({
      id: wall.id,
      length: wall.length,
      height: wall.height,
      thickness: wall.thickness,
      material: wall.material,
      verticalLineLoad: wall.verticalLineLoad,
      metadata: {
        ...(alignment.walls[index]?.metadata ?? {}),
      },
    })),
    openings: alignment.openings.map((opening) => ({
      id: opening.id,
      x: opening.x,
      y: opening.y,
      width: opening.width,
      height: opening.height,
      ringFrame: opening.ringFrame,
      lintel: opening.lintel,
      metadata: {
        ...(opening.metadata ?? {}),
      },
    })),
    settings: {
      ...alignment.settings,
      ...settings,
    },
    metadata: {
      ...(alignment.metadata ?? {}),
    },
  });
}

export function resolveAlignmentMechanicalState({
  alignment,
  stage = "design",
  options = {},
} = {}) {
  if (!alignment || typeof alignment.totalLength !== "function") {
    throw new Error(
      "resolveAlignmentMechanicalState requires a MasonryWallOpeningsModel-compatible alignment.",
    );
  }

  const settings = resolveStageSettings(alignment, options);
  const warnings = [];
  const assumptions = [
    "The first mechanical-state resolver distinguishes state-of-fact and design by selecting stage-specific masonry property sets when available, while preserving the original wall geometry and load definition.",
    "If no dedicated stage-specific property set exists, the resolver falls back to the best available base or direct masonry properties and traces that fallback in warnings.",
  ];
  const resolvedWalls = alignment.walls.map((wall) => {
    const resolution = resolveMasonryStageMaterial({
      material: wall.material,
      stage,
      settings,
      override: resolveWallOverride(options, wall.id),
      targetUnits: alignment.units,
      contextId: wall.id,
    });

    warnings.push(...resolution.warnings);
    assumptions.push(...resolution.assumptions);

    return {
      ...wall,
      material: resolution.material,
      mechanicalState: resolution.metadata,
      adoptedProperties: resolution.resolvedProperties,
    };
  });
  const resolvedAlignment = createResolvedAlignmentModel(
    alignment,
    resolvedWalls,
    settings,
  );

  return {
    stage,
    settings,
    alignment: resolvedAlignment,
    walls: resolvedWalls.map((wall) => ({
      wallId: wall.id,
      material: wall.material,
      adoptedProperties: { ...(wall.adoptedProperties ?? {}) },
      metadata: { ...(wall.mechanicalState ?? {}) },
    })),
    warnings: uniqueStrings(warnings),
    assumptions: uniqueStrings(assumptions),
    metadata: {
      stage,
      normativePreset: settings.normativePreset,
      stiffnessSelection: settings.stiffnessSelection,
      strengthSelection: settings.strengthSelection,
      stiffnessState: settings.stiffnessState,
      useCorrectiveModifiers: settings.useCorrectiveModifiers,
      divideByConfidenceFactor: settings.divideByConfidenceFactor,
      wallCount: resolvedWalls.length,
    },
  };
}
