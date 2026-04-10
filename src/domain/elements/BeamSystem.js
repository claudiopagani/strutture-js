export class BeamSystem {
  constructor({
    id,
    name,
    beams = [],
    nodes = [],
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A beam system id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.beams = [...beams];
    this.nodes = [...nodes];
    this.metadata = { ...metadata };
  }

  addBeam(beam) {
    this.beams.push(beam);
    this.#addDistinctNodes([beam.startNode, beam.endNode]);
    return this;
  }

  addNode(node) {
    this.#addDistinctNodes([node]);
    return this;
  }

  totalLength() {
    return this.beams.reduce((acc, beam) => acc + beam.length(), 0);
  }

  #addDistinctNodes(nodes) {
    for (const node of nodes) {
      if (!this.nodes.some((item) => item.id === node.id)) {
        this.nodes.push(node);
      }
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      beamIds: this.beams.map((beam) => beam.id),
      nodeIds: this.nodes.map((node) => node.id),
      totalLength: this.totalLength(),
      metadata: { ...this.metadata },
    };
  }
}
