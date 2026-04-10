import { Load } from "./Load.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class PointLoad extends Load {
  constructor({
    type = "point",
    direction = null,
    components = {},
    units = null,
    ...baseProps
  }) {
    super({
      ...baseProps,
      type,
      dimension: "point",
    });

    assertExplicitUnitSystem(units, "PointLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });

    this.direction = direction;
    this.components = {
      fx: unitResolver.force(components.fx ?? 0),
      fy: unitResolver.force(components.fy ?? 0),
      fz: unitResolver.force(components.fz ?? 0),
      mx: unitResolver.moment(components.mx ?? 0),
      my: unitResolver.moment(components.my ?? 0),
      mz: unitResolver.moment(components.mz ?? 0),
    };
  }

  forceResultant() {
    const { fx, fy, fz } = this.components;
    return Math.sqrt((fx ** 2) + (fy ** 2) + (fz ** 2));
  }

  momentResultant() {
    const { mx, my, mz } = this.components;
    return Math.sqrt((mx ** 2) + (my ** 2) + (mz ** 2));
  }

  referenceValue() {
    return this.forceResultant();
  }

  resultant() {
    return {
      force: this.forceResultant(),
      moment: this.momentResultant(),
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      direction: this.direction,
      components: { ...this.components },
      resultant: this.resultant(),
    };
  }
}
