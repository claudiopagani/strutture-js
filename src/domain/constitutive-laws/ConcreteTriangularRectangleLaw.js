export class ConcreteTriangularRectangleLaw {
  constructor({
    fcd,
    ec3,
    ecu,
    tensionPositive = true,
  }) {
    if (!Number.isFinite(fcd) || fcd <= 0) {
      throw new Error("ConcreteTriangularRectangleLaw requires a positive fcd.");
    }

    if (!Number.isFinite(ec3) || ec3 <= 0) {
      throw new Error("ConcreteTriangularRectangleLaw requires a positive ec3.");
    }

    if (!Number.isFinite(ecu) || ecu <= 0 || ecu < ec3) {
      throw new Error("ConcreteTriangularRectangleLaw requires ecu >= ec3 > 0.");
    }

    this.fcd = fcd;
    this.ec3 = ec3;
    this.ecu = ecu;
    this.tensionPositive = tensionPositive;
  }

  peakCompressionStrain() {
    return this.ec3;
  }

  stress(strain) {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    const compressionStrain = this.tensionPositive ? -strain : strain;

    if (compressionStrain <= 0) {
      return 0;
    }

    const compressionStress =
      compressionStrain <= this.ec3
        ? this.fcd * (compressionStrain / this.ec3)
        : this.fcd;

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
      type: "concrete-triangular-rectangle",
      fcd: this.fcd,
      ec3: this.ec3,
      ecu: this.ecu,
      tensionPositive: this.tensionPositive,
    };
  }
}
