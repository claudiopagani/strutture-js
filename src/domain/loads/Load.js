export class Load {
  static DIMENSIONS = ["point", "line", "area", "volume"];
  static nextAutoId = 1;

  constructor({
    id = null,
    name = null,
    type,
    dimension,
    action = null,
    loadCase = null,
    target = null,
    metadata = {},
  }) {
    if (new.target === Load) {
      throw new Error("Load is an abstract class and cannot be instantiated directly.");
    }

    if (!type) {
      throw new Error("A load type is required.");
    }

    if (!Load.DIMENSIONS.includes(dimension)) {
      throw new Error(`Unsupported load dimension: ${dimension}.`);
    }

    this.id = id ?? `LOAD-${Load.nextAutoId++}`;
    this.name = name ?? this.id;
    this.type = type;
    this.dimension = dimension;
    this.action = action;
    this.loadCase = loadCase;
    this.target = target;
    this.metadata = { ...metadata };
  }

  assignAction(action) {
    this.action = action;
    return this;
  }

  assignTo(loadCase) {
    this.loadCase = loadCase;

    if (loadCase?.action && !this.action) {
      this.assignAction(loadCase.action);
    }

    return this;
  }

  bindTo(target) {
    this.target = target;
    return this;
  }

  get magnitude() {
    return this.referenceValue();
  }

  referenceValue() {
    throw new Error("referenceValue() must be implemented by concrete load classes.");
  }

  resultant() {
    return this.referenceValue();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      dimension: this.dimension,
      actionId: this.action?.id ?? null,
      loadCaseId: this.loadCase?.id ?? null,
      targetId: this.target?.id ?? null,
      magnitude: this.magnitude,
      metadata: { ...this.metadata },
    };
  }
}
