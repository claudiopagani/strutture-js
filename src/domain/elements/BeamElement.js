import { StructuralElement } from "./StructuralElement.js";

export class BeamElement extends StructuralElement {
  constructor({
    startNode,
    endNode,
    releases = {},
    localAxis = null,
    ...baseProps
  }) {
    super({
      type: "beam",
      nodes: [startNode, endNode],
      ...baseProps,
    });

    this.startNode = startNode;
    this.endNode = endNode;
    this.releases = { ...releases };
    this.localAxis = localAxis;
  }

  length() {
    return this.startNode.distanceTo(this.endNode);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      startNode: this.startNode.toJSON(),
      endNode: this.endNode.toJSON(),
      releases: { ...this.releases },
      localAxis: this.localAxis,
      length: this.length(),
    };
  }
}
