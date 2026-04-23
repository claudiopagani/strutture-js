const INTERNAL_UNITS = Object.freeze({ force: "N", length: "m" });

function assertFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`MasonryWallPierModel requires a finite non-negative ${label}.`);
  }
}

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryWallPierModel requires a finite positive ${label}.`);
  }
}

export class MasonryWallPierModel {
  constructor({
    id,
    wallId,
    sourceWallIds = [],
    alignmentId,
    x,
    length,
    effectiveLength = null,
    height,
    thickness,
    material = null,
    tributaryVerticalLoad = 0,
    tributaryLoadByWall = {},
    deformableHeight = null,
    rigidBottomLength = 0,
    rigidTopLength = 0,
    topBoundaryMode = "not-resolved",
    mechanics = {},
    capacity = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A masonry wall pier id is required.");
    }

    if (!wallId) {
      throw new Error("A masonry wall pier wallId is required.");
    }

    if (!alignmentId) {
      throw new Error("A masonry wall pier alignmentId is required.");
    }

    assertFiniteNonNegative(x, "x");
    assertFinitePositive(length, "length");
    assertFinitePositive(height, "height");
    assertFinitePositive(thickness, "thickness");
    assertFiniteNonNegative(rigidBottomLength, "rigidBottomLength");
    assertFiniteNonNegative(rigidTopLength, "rigidTopLength");

    const resolvedEffectiveLength = effectiveLength ?? length;
    const resolvedDeformableHeight =
      deformableHeight ?? height - rigidBottomLength - rigidTopLength;

    assertFiniteNonNegative(resolvedEffectiveLength, "effectiveLength");
    assertFinitePositive(resolvedDeformableHeight, "deformableHeight");

    this.id = id;
    this.units = INTERNAL_UNITS;
    this.wallId = wallId;
    this.sourceWallIds = [...new Set(sourceWallIds.length > 0 ? sourceWallIds : [wallId])];
    this.alignmentId = alignmentId;
    this.x = x;
    this.length = length;
    this.effectiveLength = resolvedEffectiveLength;
    this.height = height;
    this.thickness = thickness;
    this.material = material;
    this.tributaryVerticalLoad = tributaryVerticalLoad;
    this.tributaryLoadByWall = { ...tributaryLoadByWall };
    this.deformableHeight = resolvedDeformableHeight;
    this.rigidBottomLength = rigidBottomLength;
    this.rigidTopLength = rigidTopLength;
    this.topBoundaryMode = topBoundaryMode;
    this.mechanics = { ...mechanics };
    this.capacity = { ...capacity };
    this.metadata = { ...metadata };
  }

  xEnd() {
    return this.x + this.length;
  }

  toJSON() {
    return {
      id: this.id,
      units: { ...this.units },
      wallId: this.wallId,
      sourceWallIds: [...this.sourceWallIds],
      alignmentId: this.alignmentId,
      x: this.x,
      length: this.length,
      effectiveLength: this.effectiveLength,
      height: this.height,
      thickness: this.thickness,
      material: this.material?.toJSON?.() ?? this.material,
      tributaryVerticalLoad: this.tributaryVerticalLoad,
      tributaryLoadByWall: { ...this.tributaryLoadByWall },
      deformableHeight: this.deformableHeight,
      rigidBottomLength: this.rigidBottomLength,
      rigidTopLength: this.rigidTopLength,
      topBoundaryMode: this.topBoundaryMode,
      mechanics: { ...this.mechanics },
      capacity: { ...this.capacity },
      metadata: { ...this.metadata },
    };
  }
}
