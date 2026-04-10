import { BaseMaterial } from "./BaseMaterial.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class SteelMaterial extends BaseMaterial {
  constructor({
    grade,
    fyk = null,
    fyd = null,
    ftk = null,
    ductilityClass = null,
    units = null,
    ...baseProps
  }) {
    assertExplicitUnitSystem(units, "SteelMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "steel",
      units,
      ...baseProps,
    });

    this.grade = grade;
    this.fyk = unitResolver.stress(fyk);
    this.fyd = unitResolver.stress(fyd);
    this.ftk = unitResolver.stress(ftk);
    this.ductilityClass = ductilityClass;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      grade: this.grade,
      fyk: this.fyk,
      fyd: this.fyd,
      ftk: this.ftk,
      ductilityClass: this.ductilityClass,
    };
  }
}
