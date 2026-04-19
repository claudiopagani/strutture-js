import { CrossSection } from "./CrossSection.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

export class CircularSection extends CrossSection {
  constructor({
    diameter,
    id = null,
    name = null,
    units = null,
    metadata = {},
  }) {
    assertExplicitUnitSystem(units, "CircularSection");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
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
      units: INTERNAL_UNITS,
      metadata: {
        ...metadata,
        shape: "circular",
        unitSystem: INTERNAL_UNITS,
        sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
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
