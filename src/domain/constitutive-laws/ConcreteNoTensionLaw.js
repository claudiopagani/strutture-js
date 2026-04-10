export class ConcreteNoTensionLaw {
  constructor({
    ecm,
    fcd = null,
    compressionCap = null,
    tensionPositive = true,
  }) {
    if (!Number.isFinite(ecm) || ecm <= 0) {
      throw new Error("ConcreteNoTensionLaw requires a positive ecm.");
    }

    const resolvedCompressionCap = compressionCap ?? fcd;

    if (
      resolvedCompressionCap != null &&
      (!Number.isFinite(resolvedCompressionCap) || resolvedCompressionCap <= 0)
    ) {
      throw new Error("ConcreteNoTensionLaw compressionCap must be positive.");
    }

    this.ecm = ecm;
    this.fcd = fcd;
    this.compressionCap = resolvedCompressionCap;
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

    let compressionStress = this.ecm * compressionStrain;

    if (this.compressionCap != null) {
      compressionStress = Math.min(compressionStress, this.compressionCap);
    }

    return this.tensionPositive ? -compressionStress : compressionStress;
  }

  strainLimits() {
    return {
      tension: Number.POSITIVE_INFINITY,
      compression:
        this.compressionCap == null
          ? Number.NEGATIVE_INFINITY
          : this.tensionPositive
            ? -(this.compressionCap / this.ecm)
            : this.compressionCap / this.ecm,
    };
  }

  toJSON() {
    return {
      type: "concrete-no-tension",
      ecm: this.ecm,
      fcd: this.fcd,
      compressionCap: this.compressionCap,
      tensionPositive: this.tensionPositive,
    };
  }
}
