import { SlabLoad } from "./SlabLoad.js";
import { createUnitResolver } from "../units/UnitSystem.js";

export class SurfaceLoad extends SlabLoad {
  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    surfaceWeight,
    units = null,
  }) {
    super({ description, loadGroup, effect });

    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedSurfaceWeight = unitResolver.areaLoad(surfaceWeight);

    if (!Number.isFinite(resolvedSurfaceWeight)) {
      throw new Error("A finite surface weight is required.");
    }

    this.surfaceWeight = resolvedSurfaceWeight;
    this.intensity = resolvedSurfaceWeight;
  }

  get value() {
    return this.referenceValue();
  }
}
