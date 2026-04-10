import { Combination } from "./Combination.js";

export class LoadCombination extends Combination {
  constructor({
    id,
    name,
    factors = [],
    combinationType = "ULS",
    metadata = {},
  }) {
    super({
      id,
      name,
      combinationType,
      metadata,
    });

    this.factors = [...factors];
  }

  addFactor(loadCase, factor) {
    this.factors.push({
      loadCase,
      factor,
    });
    return this;
  }

  evaluate(loadResultsByCaseId = {}) {
    return this.factors.reduce((acc, item) => {
      const value = loadResultsByCaseId[item.loadCase.id] ?? 0;
      return acc + item.factor * value;
    }, 0);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      factors: this.factors.map((item) => ({
        loadCaseId: item.loadCase.id,
        factor: item.factor,
      })),
    };
  }
}
