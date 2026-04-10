import { SlabLoad } from "./SlabLoad.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class LinearLoadFromLineWeight extends SlabLoad {
  constructor({
    description,
    loadGroup,
    effect = "unfavourable",
    lineWeight,
    spacing,
    units = null,
  }) {
    super({ description, loadGroup, effect, units });

    assertExplicitUnitSystem(units, "LinearLoadFromLineWeight");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedLineWeight = unitResolver.lineLoad(lineWeight);
    const resolvedSpacing = unitResolver.length(spacing);

    if (!Number.isFinite(resolvedLineWeight) || !Number.isFinite(resolvedSpacing) || resolvedSpacing === 0) {
      throw new Error("Finite line weight and spacing values are required.");
    }

    this.lineWeight = resolvedLineWeight;
    this.spacing = resolvedSpacing;
    this.intensity = resolvedLineWeight / resolvedSpacing;
  }

  get value() {
    return this.referenceValue();
  }
}
