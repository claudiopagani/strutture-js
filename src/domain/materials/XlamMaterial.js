import { TimberMaterial } from "./TimberMaterial.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class XlamMaterial extends TimberMaterial {
  constructor({
    e0Mean,
    e90Mean = null,
    g0Mean = null,
    g90Mean = null,
    rollingShearStrength = null,
    units = null,
    ...timberProps
  }) {
    assertExplicitUnitSystem(units, "XlamMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({ units, ...timberProps });

    this.e0Mean =
      unitResolver.stress(e0Mean) ?? this.elasticModulus ?? null;
    this.e90Mean =
      unitResolver.stress(e90Mean) ?? (this.e0Mean != null ? this.e0Mean / 30 : null);
    this.g0Mean =
      unitResolver.stress(g0Mean) ?? (this.e0Mean != null ? this.e0Mean / 16 : null);
    this.g90Mean =
      unitResolver.stress(g90Mean) ?? (this.g0Mean != null ? this.g0Mean / 10 : null);
    this.rollingShearStrength =
      unitResolver.stress(rollingShearStrength) ??
      this.fvK ??
      unitResolver.stress(timberProps.metadata?.rollingShearStrength) ??
      null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      e0Mean: this.e0Mean,
      e90Mean: this.e90Mean,
      g0Mean: this.g0Mean,
      g90Mean: this.g90Mean,
      rollingShearStrength: this.rollingShearStrength,
    };
  }
}
