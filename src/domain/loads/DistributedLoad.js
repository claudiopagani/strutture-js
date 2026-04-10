import { LineLoad } from "./LineLoad.js";

export class DistributedLoad extends LineLoad {
  constructor({
    element,
    target = element ?? null,
    ...baseProps
  }) {
    super({
      ...baseProps,
      type: "distributed",
      target,
    });

    this.element = target;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      elementId: this.element?.id ?? null,
    };
  }
}
