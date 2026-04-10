import { BaseMaterial } from "./BaseMaterial.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class MasonryMaterial extends BaseMaterial {
  constructor({
    masonryType,
    unitType = null,
    mortarType = null,
    fm = null,
    tau0 = null,
    fv0 = null,
    units = null,
    ...baseProps
  }) {
    assertExplicitUnitSystem(units, "MasonryMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "masonry",
      units,
      ...baseProps,
    });

    this.masonryType = masonryType;
    this.unitType = unitType;
    this.mortarType = mortarType;
    this.fm = unitResolver.stress(fm);
    this.tau0 = unitResolver.stress(tau0);
    this.fv0 = unitResolver.stress(fv0);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      masonryType: this.masonryType,
      unitType: this.unitType,
      mortarType: this.mortarType,
      fm: this.fm,
      tau0: this.tau0,
      fv0: this.fv0,
    };
  }
}
