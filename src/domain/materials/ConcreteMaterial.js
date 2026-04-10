import { BaseMaterial } from "./BaseMaterial.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class ConcreteMaterial extends BaseMaterial {
  constructor({
    strengthClass,
    fck = null,
    fcd = null,
    fctm = null,
    units = null,
    ...baseProps
  }) {
    assertExplicitUnitSystem(units, "ConcreteMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "concrete",
      units,
      ...baseProps,
    });

    this.strengthClass = strengthClass;
    this.fck = unitResolver.stress(fck);
    this.fcd = unitResolver.stress(fcd);
    this.fctm = unitResolver.stress(fctm);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      strengthClass: this.strengthClass,
      fck: this.fck,
      fcd: this.fcd,
      fctm: this.fctm,
    };
  }
}
