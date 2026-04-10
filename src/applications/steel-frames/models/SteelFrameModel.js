export class SteelFrameModel {
  constructor({
    id,
    frameModel = null,
    members = [],
    loadCombinations = [],
    serviceClass = null,
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A steel frame model id is required.");
    }

    this.id = id;
    this.frameModel = frameModel;
    this.members = [...members];
    this.loadCombinations = [...loadCombinations];
    this.serviceClass = serviceClass;
    this.metadata = { ...metadata };
  }
}
