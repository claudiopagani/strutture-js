import { BaseMaterial } from "./BaseMaterial.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class TimberMaterial extends BaseMaterial {
  constructor({
    strengthClass,
    timberType = null,
    productStandard = null,
    strengthStandard = null,
    serviceClass = null,
    kmod = null,
    fmK = null,
    fc0K = null,
    ft0K = null,
    fvK = null,
    e0_05 = null,
    g0_05 = null,
    units = null,
    ...baseProps
  }) {
    assertExplicitUnitSystem(units, "TimberMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "timber",
      units,
      ...baseProps,
    });

    this.strengthClass = strengthClass;
    this.timberType = timberType;
    this.productStandard = productStandard;
    this.strengthStandard = strengthStandard;
    this.serviceClass = serviceClass;
    this.kmod = kmod;
    this.fmK = unitResolver.stress(fmK);
    this.fc0K = unitResolver.stress(fc0K);
    this.ft0K = unitResolver.stress(ft0K);
    this.fvK = unitResolver.stress(fvK);
    this.e0_05 = unitResolver.stress(e0_05);
    this.g0_05 = unitResolver.stress(g0_05);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      strengthClass: this.strengthClass,
      timberType: this.timberType,
      productStandard: this.productStandard,
      strengthStandard: this.strengthStandard,
      serviceClass: this.serviceClass,
      kmod: this.kmod,
      fmK: this.fmK,
      fc0K: this.fc0K,
      ft0K: this.ft0K,
      fvK: this.fvK,
      e0_05: this.e0_05,
      g0_05: this.g0_05,
    };
  }
}
