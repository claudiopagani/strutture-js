import { PointLoad } from "./PointLoad.js";

export class NodalLoad extends PointLoad {
  constructor({
    node,
    target = node ?? null,
    ...baseProps
  }) {
    super({
      ...baseProps,
      type: "nodal",
      target,
    });

    this.node = target;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      nodeId: this.node?.id ?? null,
    };
  }
}
