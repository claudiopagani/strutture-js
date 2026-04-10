export class Support {
  constructor({
    id,
    node,
    restraints = {},
    springStiffness = {},
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A support id is required.");
    }

    this.id = id;
    this.node = node;
    this.restraints = {
      ux: false,
      uy: false,
      uz: false,
      rx: false,
      ry: false,
      rz: false,
      ...restraints,
    };
    this.springStiffness = {
      ux: 0,
      uy: 0,
      uz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      ...springStiffness,
    };
    this.metadata = { ...metadata };
  }

  isRestrained(dof) {
    return Boolean(this.restraints[dof]);
  }

  toJSON() {
    return {
      id: this.id,
      nodeId: this.node?.id ?? null,
      restraints: { ...this.restraints },
      springStiffness: { ...this.springStiffness },
      metadata: { ...this.metadata },
    };
  }
}
