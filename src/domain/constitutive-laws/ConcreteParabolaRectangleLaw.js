export class ConcreteParabolaRectangleLaw {
  constructor({
    fcd,
    ec2,
    ecu,
    tensionPositive = true,
  }) {
    if (!Number.isFinite(fcd) || fcd <= 0) {
      throw new Error("ConcreteParabolaRectangleLaw requires a positive fcd.");
    }

    if (!Number.isFinite(ec2) || ec2 <= 0) {
      throw new Error("ConcreteParabolaRectangleLaw requires a positive ec2.");
    }

    if (!Number.isFinite(ecu) || ecu <= 0 || ecu < ec2) {
      throw new Error("ConcreteParabolaRectangleLaw requires ecu >= ec2 > 0.");
    }

    this.fcd = fcd;
    this.ec2 = ec2;
    this.ecu = ecu;
    this.tensionPositive = tensionPositive;
  }

  stress(strain) {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    const compressionStrain = this.tensionPositive ? -strain : strain;

    if (compressionStrain <= 0) {
      return 0;
    }

    if (compressionStrain <= this.ec2) {
      const ratio = compressionStrain / this.ec2;
      const compressionStress = this.fcd * (2 * ratio - ratio ** 2);
      return this.tensionPositive ? -compressionStress : compressionStress;
    }

    const compressionStress = this.fcd;
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
      type: "concrete-parabola-rectangle",
      fcd: this.fcd,
      ec2: this.ec2,
      ecu: this.ecu,
      tensionPositive: this.tensionPositive,
    };
  }
}
