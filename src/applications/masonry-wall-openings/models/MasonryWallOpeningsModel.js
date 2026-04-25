import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "m" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryWallOpeningsModel requires a positive ${label}.`);
  }
}

function convertLineLoadPayload(payload, resolver) {
  if (Number.isFinite(payload)) {
    return resolver.lineLoad(payload);
  }

  if (!payload || typeof payload !== "object" || payload.constructor !== Object) {
    return payload ?? null;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      Number.isFinite(value)
        ? resolver.lineLoad(value)
        : value && typeof value === "object" && value.constructor === Object
          ? {
              ...value,
              value: Number.isFinite(value.value)
                ? resolver.lineLoad(value.value)
                : value.value,
            }
          : value,
    ]),
  );
}

function normalizeRingFrame(ringFrame, resolver) {
  if (!ringFrame || typeof ringFrame !== "object") {
    return ringFrame ?? null;
  }

  return {
    ...ringFrame,
    profileWidthInPlane: Number.isFinite(ringFrame.profileWidthInPlane)
      ? resolver.length(ringFrame.profileWidthInPlane)
      : ringFrame.profileWidthInPlane ?? null,
  };
}

function normalizeLintel(lintel, resolver) {
  if (!lintel || typeof lintel !== "object") {
    return lintel ?? null;
  }

  return {
    ...lintel,
    bearingLength: Number.isFinite(lintel.bearingLength)
      ? resolver.length(lintel.bearingLength)
      : lintel.bearingLength ?? null,
  };
}

export class MasonryWallOpeningsModel {
  constructor({
    id,
    label = null,
    units = null,
    walls = [],
    openings = [],
    settings = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A masonry wall openings model id is required.");
    }

    assertExplicitUnitSystem(units, "MasonryWallOpeningsModel");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    let cursor = 0;

    this.id = id;
    this.label = label ?? id;
    this.units = INTERNAL_UNITS;
    this.walls = walls.map((wall, index) => {
      const resolvedLength = unitResolver.length(wall.length);
      const resolvedHeight = unitResolver.length(wall.height);
      const resolvedThickness = unitResolver.length(wall.thickness);

      assertPositive(resolvedLength, `walls[${index}].length`);
      assertPositive(resolvedHeight, `walls[${index}].height`);
      assertPositive(resolvedThickness, `walls[${index}].thickness`);

      const normalizedWall = {
        id: wall.id ?? `wall-${index + 1}`,
        index,
        xStart: cursor,
        xEnd: cursor + resolvedLength,
        length: resolvedLength,
        height: resolvedHeight,
        thickness: resolvedThickness,
        material: wall.material ?? null,
        verticalLineLoad: convertLineLoadPayload(wall.verticalLineLoad, unitResolver),
        metadata: { ...(wall.metadata ?? {}) },
      };

      cursor = normalizedWall.xEnd;
      return normalizedWall;
    });

    if (this.walls.length === 0) {
      throw new Error("MasonryWallOpeningsModel requires at least one wall.");
    }

    this.openings = openings.map((opening, index) => {
      const resolvedX = unitResolver.length(opening.x);
      const resolvedY = unitResolver.length(opening.y);
      const resolvedWidth = unitResolver.length(opening.width);
      const resolvedHeight = unitResolver.length(opening.height);

      if (!Number.isFinite(resolvedX)) {
        throw new Error(`MasonryWallOpeningsModel requires a finite openings[${index}].x.`);
      }

      if (!Number.isFinite(resolvedY)) {
        throw new Error(`MasonryWallOpeningsModel requires a finite openings[${index}].y.`);
      }

      assertPositive(resolvedWidth, `openings[${index}].width`);
      assertPositive(resolvedHeight, `openings[${index}].height`);

      return {
        id: opening.id ?? `opening-${index + 1}`,
        index,
        x: resolvedX,
        y: resolvedY,
        width: resolvedWidth,
        height: resolvedHeight,
        ringFrame: normalizeRingFrame(opening.ringFrame, unitResolver),
        lintel: normalizeLintel(opening.lintel, unitResolver),
        metadata: { ...(opening.metadata ?? {}) },
      };
    });

    const residualPierWarningThreshold =
      Number.isFinite(settings.residualPierWarningThreshold)
        ? unitResolver.length(settings.residualPierWarningThreshold)
        : 0.5;

    this.settings = {
      normativePreset: settings.normativePreset ?? "tuscany-openings-2022",
      stiffnessSelection: settings.stiffnessSelection ?? "mean",
      strengthSelection: settings.strengthSelection ?? "mean",
      stiffnessState: settings.stiffnessState ?? "cracked",
      useCorrectiveModifiers: settings.useCorrectiveModifiers ?? true,
      divideByConfidenceFactor: settings.divideByConfidenceFactor ?? false,
      ...settings,
      residualPierWarningThreshold,
    };
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  totalLength() {
    return this.walls.at(-1)?.xEnd ?? 0;
  }

  maxHeight() {
    return this.walls.reduce(
      (selected, wall) => Math.max(selected, wall.height),
      0,
    );
  }

  openingEnvelope(opening) {
    return {
      xStart: opening.x,
      xEnd: opening.x + opening.width,
      yStart: opening.y,
      yEnd: opening.y + opening.height,
    };
  }

  toJSON() {
    return {
      id: this.id,
      label: this.label,
      units: { ...this.units },
      walls: this.walls.map((wall) => ({ ...wall })),
      openings: this.openings.map((opening) => ({ ...opening })),
      settings: { ...this.settings },
      metadata: { ...this.metadata },
    };
  }
}
