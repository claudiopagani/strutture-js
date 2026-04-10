export class Combination {
  constructor({
    id,
    name,
    combinationType = "GENERIC",
    metadata = {},
  }) {
    if (new.target === Combination) {
      throw new Error("Combination is an abstract class and cannot be instantiated directly.");
    }

    if (!id) {
      throw new Error("A combination id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.combinationType = combinationType;
    this.metadata = { ...metadata };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      combinationType: this.combinationType,
      metadata: { ...this.metadata },
    };
  }
}
