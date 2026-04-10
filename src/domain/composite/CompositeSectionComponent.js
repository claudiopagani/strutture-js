import { createUnitResolver } from "../units/UnitSystem.js";

export class CompositeSectionComponent {
  constructor({
    id = null,
    name,
    section,
    material = null,
    centroidY,
    centroidZ = 0,
    modularRatio = 1,
    role = "generic",
    units = null,
    metadata = {},
  }) {
    if (!name) {
      throw new Error("A composite component name is required.");
    }

    if (!section) {
      throw new Error("A composite component section is required.");
    }

    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedCentroidY = unitResolver.length(centroidY);
    const resolvedCentroidZ = unitResolver.length(centroidZ);

    if (!Number.isFinite(resolvedCentroidY)) {
      throw new Error("A composite component centroidY is required.");
    }

    if (!Number.isFinite(resolvedCentroidZ)) {
      throw new Error("A composite component centroidZ is required.");
    }

    if (!Number.isFinite(modularRatio) || modularRatio <= 0) {
      throw new Error("A positive composite component modularRatio is required.");
    }

    this.id = id;
    this.name = name;
    this.section = section;
    this.material = material;
    this.centroidY = resolvedCentroidY;
    this.centroidZ = resolvedCentroidZ;
    this.modularRatio = modularRatio;
    this.role = role;
    this.metadata = {
      ...metadata,
      unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
    };
  }

  transformedArea() {
    return this.modularRatio * this.section.area;
  }

  transformedInertiaY() {
    return this.modularRatio * (this.section.inertiaY ?? 0);
  }

  transformedInertiaZ() {
    return this.modularRatio * (this.section.inertiaZ ?? 0);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      section: this.section?.toJSON ? this.section.toJSON() : this.section,
      material: this.material?.toJSON ? this.material.toJSON() : this.material,
      centroidY: this.centroidY,
      centroidZ: this.centroidZ,
      modularRatio: this.modularRatio,
      role: this.role,
      metadata: { ...this.metadata },
    };
  }
}
