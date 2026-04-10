export class StructuralElement {
  constructor({
    id,
    type,
    nodes = [],
    material = null,
    crossSection = null,
    metadata = {},
  }) {
    if (!id) {
      throw new Error("An element id is required.");
    }

    if (!type) {
      throw new Error("An element type is required.");
    }

    this.id = id;
    this.type = type;
    this.nodes = [...nodes];
    this.material = material;
    this.crossSection = crossSection;
    this.metadata = { ...metadata };
  }

  addNode(node) {
    this.nodes.push(node);
    return this;
  }

  nodeIds() {
    return this.nodes.map((node) => node.id);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      nodeIds: this.nodeIds(),
      material: this.material?.toJSON?.() ?? this.material,
      crossSection: this.crossSection?.toJSON?.() ?? this.crossSection,
      metadata: { ...this.metadata },
    };
  }
}
