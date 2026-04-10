import { CrossSection } from "./CrossSection.js";
import { createUnitResolver } from "../units/UnitSystem.js";

export class CircularSection extends CrossSection {
  constructor({
    diameter,
    id = null,
    name = null,
    units = null,
    metadata = {},
  }) {
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedDiameter = unitResolver.length(diameter);

    if (!Number.isFinite(resolvedDiameter) || resolvedDiameter <= 0) {
      throw new Error("A positive circular section diameter is required.");
    }

    const radius = resolvedDiameter / 2;
    const area = Math.PI * radius ** 2;
    const inertia = (Math.PI * radius ** 4) / 4;

    super({
      id,
      name: name ?? `Circular d=${resolvedDiameter}`,
      area,
      centroidY: radius,
      centroidZ: radius,
      inertiaY: inertia,
      inertiaZ: inertia,
      elasticSectionModulusY: inertia / radius,
      elasticSectionModulusZ: inertia / radius,
      height: resolvedDiameter,
      width: resolvedDiameter,
      metadata: {
        ...metadata,
        shape: "circular",
        unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
      },
    });

    this.diameter = resolvedDiameter;
    this.radius = radius;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      diameter: this.diameter,
      radius: this.radius,
    };
  }
}
