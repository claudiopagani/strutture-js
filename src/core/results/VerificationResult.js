import { CalculationResult } from "./CalculationResult.js";

export class VerificationResult extends CalculationResult {
  constructor({
    utilizationRatio = null,
    demand = null,
    capacity = null,
    checks = [],
    ...result
  }) {
    super(result);

    this.utilizationRatio = utilizationRatio;
    this.demand = demand;
    this.capacity = capacity;
    this.checks = [...checks];
  }

  isVerified() {
    if (this.status !== "ok") {
      return false;
    }

    if (this.checks.length > 0) {
      return this.checks.every((check) => check.ok === true);
    }

    return this.utilizationRatio === null || this.utilizationRatio <= 1;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      utilizationRatio: this.utilizationRatio,
      demand: this.demand,
      capacity: this.capacity,
      checks: [...this.checks],
    };
  }
}
