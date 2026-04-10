import { createUnitResolver } from "../units/UnitSystem.js";

export class BaseMaterial {
  constructor({
    id = null,
    name,
    category,
    density = null,
    elasticModulus = null,
    shearModulus = null,
    poissonRatio = null,
    thermalExpansion = null,
    units = null,
    metadata = {},
  }) {
    if (!name) {
      throw new Error("A material name is required.");
    }

    if (!category) {
      throw new Error("A material category is required.");
    }

    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    this.id = id;
    this.name = name;
    this.category = category;
    this.density = unitResolver.volumeLoad(density);
    this.elasticModulus = unitResolver.stress(elasticModulus);
    this.shearModulus = unitResolver.stress(shearModulus);
    this.poissonRatio = poissonRatio;
    this.thermalExpansion = thermalExpansion;
    this.metadata = {
      ...metadata,
      unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
    };
  }

  isExistingMaterial() {
    return false;
  }

  clone(overrides = {}) {
    return new this.constructor({
      ...this.toJSON(),
      ...overrides,
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      density: this.density,
      elasticModulus: this.elasticModulus,
      shearModulus: this.shearModulus,
      poissonRatio: this.poissonRatio,
      thermalExpansion: this.thermalExpansion,
      metadata: { ...this.metadata },
    };
  }
}
