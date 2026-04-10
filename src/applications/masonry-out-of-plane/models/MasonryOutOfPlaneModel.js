export class MasonryOutOfPlaneModel {
  constructor({
    id,
    wall = {},
    restraints = {},
    macroBlocks = [],
    actions = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A masonry out-of-plane model id is required.");
    }

    this.id = id;
    this.wall = { ...wall };
    this.restraints = { ...restraints };
    this.macroBlocks = [...macroBlocks];
    this.actions = { ...actions };
    this.metadata = { ...metadata };
  }
}
