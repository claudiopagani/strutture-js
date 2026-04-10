import { BaseMaterial } from "./BaseMaterial.js";
import { createUnitResolver } from "../units/UnitSystem.js";

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
    units = null,
    ...baseProps
  }) {
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
    };
  }
}
