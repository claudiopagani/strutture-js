export class TimberBeamModel {
  constructor({
    id,
    span = null,
    section = null,
    material = null,
    restraints = {},
    loadCases = [],
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A timber beam model id is required.");
    }

    this.id = id;
    this.span = span;
    this.section = section;
    this.material = material;
    this.restraints = { ...restraints };
    this.loadCases = [...loadCases];
    this.metadata = { ...metadata };
  }
}
