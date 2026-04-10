export class SteelElasticPerfectlyPlasticLaw {
  constructor({
    Es,
    fyd,
    esu = null,
    tensionPositive = true,
  }) {
    if (!Number.isFinite(Es) || Es <= 0) {
      throw new Error("SteelElasticPerfectlyPlasticLaw requires a positive Es.");
    }

    if (!Number.isFinite(fyd) || fyd <= 0) {
      throw new Error("SteelElasticPerfectlyPlasticLaw requires a positive fyd.");
    }

    if (esu != null && (!Number.isFinite(esu) || esu <= 0)) {
      throw new Error("SteelElasticPerfectlyPlasticLaw esu must be positive.");
    }

    this.Es = Es;
    this.fyd = fyd;
    this.esu = esu;
    this.tensionPositive = tensionPositive;
  }

  yieldStrain() {
    return this.fyd / this.Es;
  }

  stress(strain) {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    const elasticStress = this.Es * strain;
    const limitedStress = Math.max(-this.fyd, Math.min(this.fyd, elasticStress));
    return this.tensionPositive ? limitedStress : -limitedStress;
  }

  strainLimits() {
    return {
      tension: this.tensionPositive ? this.esu : this.esu == null ? Number.POSITIVE_INFINITY : -this.esu,
      compression:
        this.tensionPositive
          ? this.esu == null
            ? Number.NEGATIVE_INFINITY
            : -this.esu
          : this.esu == null
            ? Number.NEGATIVE_INFINITY
            : this.esu,
    };
  }

  toJSON() {
    return {
      type: "steel-elastic-perfectly-plastic",
      Es: this.Es,
      fyd: this.fyd,
      esu: this.esu,
      tensionPositive: this.tensionPositive,
    };
  }
}
