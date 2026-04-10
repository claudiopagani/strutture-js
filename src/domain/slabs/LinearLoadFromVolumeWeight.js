import { SlabLoad } from "./SlabLoad.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class LinearLoadFromVolumeWeight extends SlabLoad {
  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    density,
    area,
    spacing,
    units = null,
  }) {
    super({ description, loadGroup, effect, units });

    assertExplicitUnitSystem(units, "LinearLoadFromVolumeWeight");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedDensity = unitResolver.volumeLoad(density);
    const resolvedArea = unitResolver.area(area);
    const resolvedSpacing = unitResolver.length(spacing);

    if (!Number.isFinite(resolvedDensity) || !Number.isFinite(resolvedArea) || !Number.isFinite(resolvedSpacing) || resolvedSpacing === 0) {
      throw new Error("Finite density, area and spacing values are required.");
    }

    this.density = resolvedDensity;
    this.area = resolvedArea;
    this.spacing = resolvedSpacing;
    this.intensity = (resolvedDensity * resolvedArea) / resolvedSpacing;
  }

  get value() {
    return this.referenceValue();
  }
}
