export class MasonryRingBeamModel {
  constructor({
    id,
    opening = null,
    wall = null,
    reinforcementScheme = null,
    loadPath = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A masonry ring beam model id is required.");
    }

    this.id = id;
    this.opening = opening;
    this.wall = wall;
    this.reinforcementScheme = reinforcementScheme;
    this.loadPath = { ...loadPath };
    this.metadata = { ...metadata };
  }
}
