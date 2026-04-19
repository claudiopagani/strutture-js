import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

const REINFORCEMENT_GRADES = new Set(["B450A", "B450C"]);

export class ReinforcementBar {
  constructor({
    id = null,
    name = null,
    diameter = null,
    area = null,
    grade = "B450C",
    material = null,
    y = null,
    z = null,
    units = null,
    metadata = {},
  }) {
    if (!REINFORCEMENT_GRADES.has(grade)) {
      throw new Error(`Unsupported reinforcement grade: ${grade}.`);
    }

    assertExplicitUnitSystem(units, "ReinforcementBar");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    if (diameter == null && area == null) {
      throw new Error("ReinforcementBar requires either a diameter or an area.");
    }

    const resolvedDiameter =
      diameter == null ? null : unitResolver.length(Number(diameter));
    const resolvedArea =
      area == null ? (Math.PI * Number(resolvedDiameter) ** 2) / 4 : unitResolver.area(Number(area));
    const normalizedDiameter =
      diameter == null ? Math.sqrt((4 * Number(resolvedArea)) / Math.PI) : resolvedDiameter;

    if (!Number.isFinite(resolvedArea) || resolvedArea <= 0) {
      throw new Error("ReinforcementBar area must be positive.");
    }

    if (!Number.isFinite(normalizedDiameter) || normalizedDiameter <= 0) {
      throw new Error("ReinforcementBar diameter must be positive.");
    }

    this.id = id;
    this.name = name ?? `Rebar ${grade} d${normalizedDiameter}`;
    this.diameter = normalizedDiameter;
    this.area = resolvedArea;
    this.grade = grade;
    this.material = material;
    this.y = unitResolver.length(y);
    this.z = unitResolver.length(z);
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  areaPerSpacing(spacing) {
    if (!Number.isFinite(spacing) || spacing <= 0) {
      throw new Error("A positive spacing is required.");
    }

    return this.area / spacing;
  }

  distributedArea(width, spacing) {
    if (!Number.isFinite(width) || width <= 0) {
      throw new Error("A positive width is required.");
    }

    return this.areaPerSpacing(spacing) * width;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      diameter: this.diameter,
      area: this.area,
      grade: this.grade,
      material: this.material?.toJSON ? this.material.toJSON() : this.material,
      y: this.y,
      z: this.z,
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}
