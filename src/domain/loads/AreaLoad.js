import { Load } from "./Load.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class AreaLoad extends Load {
  constructor({
    type = "area",
    direction = null,
    intensity,
    area = null,
    referenceSystem = "global",
    units = null,
    ...baseProps
  }) {
    super({
      ...baseProps,
      type,
      dimension: "area",
    });

    assertExplicitUnitSystem(units, "AreaLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedIntensity = unitResolver.areaLoad(intensity);

    if (!Number.isFinite(resolvedIntensity)) {
      throw new Error("A finite area load intensity is required.");
    }

    this.direction = direction;
    this.intensity = resolvedIntensity;
    this.areaOverride = area == null ? area : unitResolver.area(area);
    this.referenceSystem = referenceSystem;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...this.metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: this.metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  resolvedArea() {
    if (Number.isFinite(this.areaOverride)) {
      return this.areaOverride;
    }

    if (typeof this.target?.area === "function") {
      return this.target.area();
    }

    if (Number.isFinite(this.target?.area)) {
      return this.target.area;
    }

    return null;
  }

  referenceValue() {
    return this.intensity;
  }

  resultant() {
    const area = this.resolvedArea();
    return area === null ? null : this.intensity * area;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      direction: this.direction,
      intensity: this.intensity,
      area: this.resolvedArea(),
      referenceSystem: this.referenceSystem,
      resultant: this.resultant(),
    };
  }
}
