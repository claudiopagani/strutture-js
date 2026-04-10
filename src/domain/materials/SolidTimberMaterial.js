import { TimberMaterial } from "./TimberMaterial.js";

export class SolidTimberMaterial extends TimberMaterial {
  constructor({
    gradingMethod = null,
    ...props
  }) {
    super({
      timberType: "solid-timber",
      ...props,
    });

    this.gradingMethod = gradingMethod;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      gradingMethod: this.gradingMethod,
    };
  }
}
