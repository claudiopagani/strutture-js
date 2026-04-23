const INTERNAL_UNITS = Object.freeze({ force: "N", length: "m" });

function assertFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `MasonryWallSpandrelModel requires a finite non-negative ${label}.`,
    );
  }
}

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryWallSpandrelModel requires a finite positive ${label}.`);
  }
}

export class MasonryWallSpandrelModel {
  constructor({
    id,
    alignmentId,
    xStart,
    xEnd,
    height,
    thickness,
    material = null,
    sourceWallIds = [],
    deformableLength = null,
    rigidLeftLength = 0,
    rigidRightLength = 0,
    mechanics = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A masonry wall spandrel id is required.");
    }

    if (!alignmentId) {
      throw new Error("A masonry wall spandrel alignmentId is required.");
    }

    assertFiniteNonNegative(xStart, "xStart");
    assertFinitePositive(xEnd - xStart, "length");
    assertFinitePositive(height, "height");
    assertFinitePositive(thickness, "thickness");
    assertFiniteNonNegative(rigidLeftLength, "rigidLeftLength");
    assertFiniteNonNegative(rigidRightLength, "rigidRightLength");

    const resolvedDeformableLength = deformableLength ?? xEnd - xStart;

    assertFinitePositive(resolvedDeformableLength, "deformableLength");

    this.id = id;
    this.units = INTERNAL_UNITS;
    this.alignmentId = alignmentId;
    this.xStart = xStart;
    this.xEnd = xEnd;
    this.height = height;
    this.thickness = thickness;
    this.material = material;
    this.sourceWallIds = [...new Set(sourceWallIds)];
    this.deformableLength = resolvedDeformableLength;
    this.rigidLeftLength = rigidLeftLength;
    this.rigidRightLength = rigidRightLength;
    this.mechanics = { ...mechanics };
    this.metadata = { ...metadata };
  }

  length() {
    return this.xEnd - this.xStart;
  }

  toJSON() {
    return {
      id: this.id,
      units: { ...this.units },
      alignmentId: this.alignmentId,
      xStart: this.xStart,
      xEnd: this.xEnd,
      height: this.height,
      thickness: this.thickness,
      material: this.material?.toJSON?.() ?? this.material,
      sourceWallIds: [...this.sourceWallIds],
      deformableLength: this.deformableLength,
      rigidLeftLength: this.rigidLeftLength,
      rigidRightLength: this.rigidRightLength,
      mechanics: { ...this.mechanics },
      metadata: { ...this.metadata },
    };
  }
}
