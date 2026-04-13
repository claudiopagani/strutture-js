import { ReinforcementBar } from "./ReinforcementBar.js";
import { createUnitResolver } from "../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function resolveLayer(input, face) {
  if (!input) {
    return null;
  }

  const count = input.count ?? input.number ?? input.bars;

  if (!isFinitePositive(count) || !Number.isInteger(count)) {
    throw new Error(`Longitudinal ${face} reinforcement requires a positive integer count.`);
  }

  if (!isFinitePositive(input.diameter)) {
    throw new Error(`Longitudinal ${face} reinforcement requires a positive diameter.`);
  }

  if (!isFinitePositive(input.cover)) {
    throw new Error(`Longitudinal ${face} reinforcement requires a positive cover.`);
  }

  return {
    id: input.id ?? face,
    name: input.name ?? `${face} longitudinal reinforcement`,
    face,
    count,
    diameter: input.diameter,
    cover: input.cover,
    zStart: input.zStart ?? null,
    zEnd: input.zEnd ?? null,
    material: input.material ?? null,
    grade: input.grade ?? "B450C",
    metadata: input.metadata ?? {},
  };
}

function widthAtFace(section, face) {
  if (face === "top") {
    return section.flangeWidth ?? section.width;
  }

  if (face === "bottom") {
    return section.webWidth ?? section.width;
  }

  return section.width;
}

function zOffsetAtFace(section, face, width) {
  if (face === "bottom" && Number.isFinite(section.webWidth) && Number.isFinite(section.width)) {
    return (section.width - width) / 2;
  }

  return 0;
}

function barPositionsForLayer({ section, layer, resolver }) {
  const width = widthAtFace(section, layer.face);

  if (!isFinitePositive(width)) {
    throw new Error(`Cannot derive ${layer.face} reinforcement width for this section.`);
  }

  const diameter = resolver.length(layer.diameter);
  const cover = resolver.length(layer.cover);
  const y =
    layer.face === "bottom"
      ? cover + diameter / 2
      : section.height - cover - diameter / 2;
  const zStart =
    layer.zStart == null
      ? zOffsetAtFace(section, layer.face, width) + cover + diameter / 2
      : resolver.length(layer.zStart);
  const zEnd =
    layer.zEnd == null
      ? zOffsetAtFace(section, layer.face, width) + width - cover - diameter / 2
      : resolver.length(layer.zEnd);

  if (!Number.isFinite(y) || y < 0 || y > section.height) {
    throw new Error(`Computed ${layer.face} reinforcement y coordinate is outside the section.`);
  }

  if (!Number.isFinite(zStart) || !Number.isFinite(zEnd) || zStart > zEnd) {
    throw new Error(`Computed ${layer.face} reinforcement z coordinates are invalid.`);
  }

  if (layer.count === 1) {
    return [
      {
        y,
        z: (zStart + zEnd) / 2,
      },
    ];
  }

  const spacing = (zEnd - zStart) / (layer.count - 1);

  return Array.from({ length: layer.count }, (_, index) => ({
    y,
    z: zStart + index * spacing,
  }));
}

function createBarsForLayer({
  section,
  layer,
  material,
  units,
}) {
  const resolver = createUnitResolver(units, INTERNAL_UNITS);
  const positions = barPositionsForLayer({ section, layer, resolver });
  const diameter = resolver.length(layer.diameter);
  const bars = positions.map((position, index) =>
    new ReinforcementBar({
      id: `${layer.id}-${index + 1}`,
      name: `${layer.name} ${index + 1}`,
      diameter,
      grade: layer.grade,
      material: layer.material ?? material,
      y: position.y,
      z: position.z,
      units: INTERNAL_UNITS,
      metadata: {
        ...layer.metadata,
        face: layer.face,
        generatedBy: "createLongitudinalReinforcementLayout",
        layerId: layer.id,
      },
    }),
  );

  return {
    bars,
    group: {
      id: layer.id,
      name: layer.name,
      face: layer.face,
      barIds: bars.map((bar) => bar.id),
      diameter,
      count: layer.count,
      cover: resolver.length(layer.cover),
      longitudinalReinforcementArea: bars.reduce((sum, bar) => sum + bar.area, 0),
    },
  };
}

export function createLongitudinalReinforcementLayout({
  section,
  material = null,
  units = section?.metadata?.unitSystem ?? INTERNAL_UNITS,
  top = null,
  bottom = null,
  additionalBars = [],
  groups = [],
} = {}) {
  if (!section) {
    throw new Error("createLongitudinalReinforcementLayout requires a concrete section.");
  }

  const layers = [
    resolveLayer(bottom, "bottom"),
    resolveLayer(top, "top"),
  ].filter(Boolean);
  const generated = layers.map((layer) =>
    createBarsForLayer({
      section,
      layer,
      material,
      units,
    }),
  );
  const generatedBars = generated.flatMap((item) => item.bars);
  const generatedGroups = generated.map((item) => item.group);

  return {
    reinforcementBars: [
      ...generatedBars,
      ...additionalBars,
    ],
    longitudinalReinforcementGroups: [
      ...generatedGroups,
      ...groups,
    ],
    metadata: {
      generatedBy: "createLongitudinalReinforcementLayout",
      hasGeneratedTopLayer: Boolean(top),
      hasGeneratedBottomLayer: Boolean(bottom),
    },
  };
}
