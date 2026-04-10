export class StructuralModel {
  constructor({
    id,
    name,
    materials = [],
    nodes = [],
    elements = [],
    supports = [],
    loadCases = [],
    loadCombinations = [],
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A model id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.materials = [...materials];
    this.nodes = [...nodes];
    this.elements = [...elements];
    this.supports = [...supports];
    this.loadCases = [...loadCases];
    this.loadCombinations = [...loadCombinations];
    this.metadata = { ...metadata };
  }

  addMaterial(material) {
    this.materials.push(material);
    return this;
  }

  addNode(node) {
    this.nodes.push(node);
    return this;
  }

  addElement(element) {
    this.elements.push(element);
    return this;
  }

  addSupport(support) {
    this.supports.push(support);
    return this;
  }

  addLoadCase(loadCase) {
    this.loadCases.push(loadCase);
    return this;
  }

  addLoadCombination(loadCombination) {
    this.loadCombinations.push(loadCombination);
    return this;
  }

  summary() {
    return {
      id: this.id,
      name: this.name,
      materials: this.materials.length,
      nodes: this.nodes.length,
      elements: this.elements.length,
      supports: this.supports.length,
      loadCases: this.loadCases.length,
      loadCombinations: this.loadCombinations.length,
    };
  }
}
