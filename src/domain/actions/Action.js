export class Action {
  constructor({
    id,
    name,
    nature,
    family = "generic",
    loadDurationClass = "medium",
    combinationFactors = {},
    partialFactors = {},
    loadCase = null,
    metadata = {},
  }) {
    if (new.target === Action) {
      throw new Error("Action is an abstract class and cannot be instantiated directly.");
    }

    if (!id) {
      throw new Error("An action id is required.");
    }

    if (!nature) {
      throw new Error("An action nature is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.nature = nature;
    this.family = family;
    this.loadDurationClass = loadDurationClass;
    this.combinationFactors = {
      psi0: 0,
      psi1: 0,
      psi2: 0,
      ...combinationFactors,
    };
    this.partialFactors = { ...partialFactors };
    this.loadCase = loadCase;
    this.metadata = { ...metadata };
  }

  assignTo(loadCase) {
    this.loadCase = loadCase;
    return this;
  }

  getCombinationFactor(kind = "psi0") {
    const value = this.combinationFactors[kind];

    if (value === undefined) {
      throw new Error(`Unsupported combination factor '${kind}' for action ${this.id}.`);
    }

    return value;
  }

  getPartialFactor({
    combinationSet = "A1",
    effect = "unfavourable",
  } = {}) {
    const bySet = this.partialFactors[combinationSet];

    if (!bySet) {
      throw new Error(`Unsupported partial-factor set '${combinationSet}' for action ${this.id}.`);
    }

    const value = bySet[effect];

    if (value === undefined) {
      throw new Error(`Unsupported effect '${effect}' for action ${this.id} in set ${combinationSet}.`);
    }

    return value;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      nature: this.nature,
      family: this.family,
      loadDurationClass: this.loadDurationClass,
      loadCaseId: this.loadCase?.id ?? null,
      combinationFactors: { ...this.combinationFactors },
      partialFactors: JSON.parse(JSON.stringify(this.partialFactors)),
      metadata: { ...this.metadata },
    };
  }
}
