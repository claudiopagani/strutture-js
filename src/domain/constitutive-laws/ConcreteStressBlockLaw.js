export class ConcreteStressBlockLaw {
  constructor({
    fcd,
    eta = 1,
    ec4 = 0,
    ecu,
    tensionPositive = true,
  }) {
    if (!Number.isFinite(fcd) || fcd <= 0) {
      throw new Error("ConcreteStressBlockLaw requires a positive fcd.");
    }

    if (!Number.isFinite(eta) || eta <= 0) {
      throw new Error("ConcreteStressBlockLaw requires a positive eta.");
    }

    if (!Number.isFinite(ec4) || ec4 < 0) {
      throw new Error("ConcreteStressBlockLaw requires ec4 >= 0.");
    }

    if (!Number.isFinite(ecu) || ecu <= 0 || ecu < ec4) {
      throw new Error("ConcreteStressBlockLaw requires ecu >= ec4.");
    }

    this.fcd = fcd;
    this.eta = eta;
    this.ec4 = ec4;
    this.ecu = ecu;
    this.tensionPositive = tensionPositive;
  }

  peakCompressionStrain() {
    return this.ec4;
  }

  stress(strain) {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    const compressionStrain = this.tensionPositive ? -strain : strain;

    if (compressionStrain <= this.ec4) {
      return 0;
    }

    const compressionStress = this.eta * this.fcd;
    return this.tensionPositive ? -compressionStress : compressionStress;
  }

  strainLimits() {
    return {
      tension: Number.POSITIVE_INFINITY,
      compression: this.tensionPositive ? -this.ecu : this.ecu,
    };
  }

  toJSON() {
    return {
      type: "concrete-stress-block",
      fcd: this.fcd,
      eta: this.eta,
      ec4: this.ec4,
      ecu: this.ecu,
      tensionPositive: this.tensionPositive,
    };
  }
}
