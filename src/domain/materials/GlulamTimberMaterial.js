import { TimberMaterial } from "./TimberMaterial.js";

export class GlulamTimberMaterial extends TimberMaterial {
  constructor({
    glulamType = null,
    ...props
  }) {
    super({
      timberType: "glulam",
      ...props,
    });

    this.glulamType = glulamType;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      glulamType: this.glulamType,
    };
  }
}
