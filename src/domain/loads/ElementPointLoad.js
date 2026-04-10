import { PointLoad } from "./PointLoad.js";

export class ElementPointLoad extends PointLoad {
  constructor({
    element,
    target = element ?? null,
    position = 0,
    referenceSystem = "local",
    ...baseProps
  }) {
    super({
      ...baseProps,
      type: "element_point",
      target,
    });

    this.element = target;
    this.position = position;
    this.referenceSystem = referenceSystem;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      elementId: this.element?.id ?? null,
      position: this.position,
      referenceSystem: this.referenceSystem,
    };
  }
}
