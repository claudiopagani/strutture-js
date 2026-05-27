export class SteelElasticPlasticHardeningLaw {
  constructor({
    Es,
    fyd,
    ftd = null,
    esu = 0.01,
    hardeningModulus = null,
    tensionPositive = true,
  }) {
    if (!Number.isFinite(Es) || Es <= 0) {
      throw new Error("SteelElasticPlasticHardeningLaw requires a positive Es.");
    }

    if (!Number.isFinite(fyd) || fyd <= 0) {
      throw new Error("SteelElasticPlasticHardeningLaw requires a positive fyd.");
    }

    if (!Number.isFinite(esu) || esu <= 0) {
      throw new Error("SteelElasticPlasticHardeningLaw requires a positive esu.");
    }

    const ey = fyd / Es;

    if (esu <= ey) {
      throw new Error("SteelElasticPlasticHardeningLaw requires esu greater than yield strain.");
    }

    if (ftd != null && (!Number.isFinite(ftd) || ftd < fyd)) {
      throw new Error("SteelElasticPlasticHardeningLaw requires ftd >= fyd.");
    }

    if (
      hardeningModulus != null &&
      (!Number.isFinite(hardeningModulus) || hardeningModulus < 0)
    ) {
      throw new Error("SteelElasticPlasticHardeningLaw hardeningModulus must be non-negative.");
    }

    this.Es = Es;
    this.fyd = fyd;
    this.ftd = ftd ?? fyd;
    this.esu = esu;
    this.hardeningModulus =
      hardeningModulus ??
      (this.ftd - this.fyd) / (this.esu - ey);
    this.tensionPositive = tensionPositive;
  }

  yieldStrain() {
    return this.fyd / this.Es;
  }

  stress(strain) {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    const sign = strain < 0 ? -1 : 1;
    const absoluteStrain = Math.abs(strain);
    const ey = this.yieldStrain();
    const absoluteStress =
      absoluteStrain <= ey
        ? this.Es * absoluteStrain
        : Math.min(
            this.ftd,
            this.fyd + this.hardeningModulus * (absoluteStrain - ey),
          );
    const stress = sign * absoluteStress;

    return this.tensionPositive ? stress : -stress;
  }

  strainLimits() {
    return {
      tension: this.tensionPositive ? this.esu : -this.esu,
      compression: this.tensionPositive ? -this.esu : this.esu,
    };
  }

  toJSON() {
    return {
      type: "steel-elastic-plastic-hardening",
      Es: this.Es,
      fyd: this.fyd,
      ftd: this.ftd,
      esu: this.esu,
      hardeningModulus: this.hardeningModulus,
      tensionPositive: this.tensionPositive,
    };
  }
}
