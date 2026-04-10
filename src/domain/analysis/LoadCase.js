export class LoadCase {
  constructor({
    id,
    name,
    category = "generic",
    action = null,
    loads = [],
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A load case id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.category = category;
    this.action = action;
    this.loads = [];
    this.metadata = { ...metadata };

    if (this.action?.assignTo) {
      this.action.assignTo(this);
    }

    loads.forEach((load) => this.addLoad(load));
  }

  addLoad(load) {
    load.assignTo(this);
    this.loads.push(load);
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      actionId: this.action?.id ?? null,
      loadIds: this.loads.map((load) => load.id),
      metadata: { ...this.metadata },
    };
  }
}
