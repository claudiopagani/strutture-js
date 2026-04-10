export class SteelElasticLaw {
  constructor({
    Es,
    stressCap = null,
    tensionPositive = true,
  }) {
    if (!Number.isFinite(Es) || Es <= 0) {
      throw new Error("SteelElasticLaw requires a positive Es.");
    }

    if (stressCap != null && (!Number.isFinite(stressCap) || stressCap <= 0)) {
      throw new Error("SteelElasticLaw stressCap must be positive.");
    }

    this.Es = Es;
    this.stressCap = stressCap;
    this.tensionPositive = tensionPositive;
  }

  stress(strain) {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    let stress = this.Es * strain;

    if (this.stressCap != null) {
      stress = Math.max(-this.stressCap, Math.min(this.stressCap, stress));
    }

    return this.tensionPositive ? stress : -stress;
  }

  strainLimits() {
    return {
      tension:
        this.stressCap == null
          ? Number.POSITIVE_INFINITY
          : this.tensionPositive
            ? this.stressCap / this.Es
            : -(this.stressCap / this.Es),
      compression:
        this.stressCap == null
          ? Number.NEGATIVE_INFINITY
          : this.tensionPositive
            ? -(this.stressCap / this.Es)
            : this.stressCap / this.Es,
    };
  }

  toJSON() {
    return {
      type: "steel-elastic",
      Es: this.Es,
      stressCap: this.stressCap,
      tensionPositive: this.tensionPositive,
    };
  }
}
