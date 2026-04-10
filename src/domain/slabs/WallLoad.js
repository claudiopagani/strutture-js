import { SlabLoad } from "./SlabLoad.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class WallLoad extends SlabLoad {
  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    density,
    height,
    thickness,
    spacing,
    units = null,
  }) {
    super({ description, loadGroup, effect, units });

    assertExplicitUnitSystem(units, "WallLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedDensity = unitResolver.volumeLoad(density);
    const resolvedHeight = unitResolver.length(height);
    const resolvedThickness = unitResolver.length(thickness);
    const resolvedSpacing = unitResolver.length(spacing);

    if (
      !Number.isFinite(resolvedDensity)
      || !Number.isFinite(resolvedHeight)
      || !Number.isFinite(resolvedThickness)
      || !Number.isFinite(resolvedSpacing)
      || resolvedSpacing === 0
    ) {
      throw new Error("Finite wall load parameters are required and spacing cannot be zero.");
    }

    this.density = resolvedDensity;
    this.height = resolvedHeight;
    this.thickness = resolvedThickness;
    this.spacing = resolvedSpacing;
    this.intensity = (resolvedDensity * resolvedHeight * resolvedThickness) / resolvedSpacing;
  }

  get value() {
    return this.referenceValue();
  }
}
