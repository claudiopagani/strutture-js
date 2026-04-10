export class MicropileBromsModel {
  constructor({
    id,
    pile = {},
    soil = {},
    boundaryConditions = {},
    actions = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A micropile Broms model id is required.");
    }

    this.id = id;
    this.pile = { ...pile };
    this.soil = { ...soil };
    this.boundaryConditions = { ...boundaryConditions };
    this.actions = { ...actions };
    this.metadata = { ...metadata };
  }
}
