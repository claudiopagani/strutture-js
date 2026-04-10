import { SlabLoad } from "./SlabLoad.js";
import { createUnitResolver } from "../units/UnitSystem.js";

export class LayerLoad extends SlabLoad {
  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    density,
    thickness,
    units = null,
  }) {
    super({ description, loadGroup, effect });

    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedDensity = unitResolver.volumeLoad(density);
    const resolvedThickness = unitResolver.length(thickness);

    if (!Number.isFinite(resolvedDensity) || !Number.isFinite(resolvedThickness)) {
      throw new Error("Finite density and thickness values are required.");
    }

    this.density = resolvedDensity;
    this.thickness = resolvedThickness;
    this.intensity = resolvedDensity * resolvedThickness;
  }

  get value() {
    return this.referenceValue();
  }
}
