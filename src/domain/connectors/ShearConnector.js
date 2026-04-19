import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class ShearConnector {
  constructor({
    id = null,
    name,
    family = null,
    producer = null,
    kser,
    ku,
    fvrk,
    units = null,
    metadata = {},
  }) {
    assertExplicitUnitSystem(units, "ShearConnector");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedKser = unitResolver.translationalStiffness(kser);
    const resolvedKu = unitResolver.translationalStiffness(ku);
    const resolvedFvrk = unitResolver.force(fvrk);

    if (!name) {
      throw new Error("A connector name is required.");
    }

    if (!Number.isFinite(resolvedKser) || resolvedKser <= 0) {
      throw new Error("Connector Kser must be positive.");
    }

    if (!Number.isFinite(resolvedKu) || resolvedKu <= 0) {
      throw new Error("Connector Ku must be positive.");
    }

    if (!Number.isFinite(resolvedFvrk) || resolvedFvrk <= 0) {
      throw new Error("Connector Fvrk must be positive.");
    }

    this.id = id;
    this.name = name;
    this.family = family;
    this.producer = producer;
    this.kser = resolvedKser;
    this.ku = resolvedKu;
    this.fvrk = resolvedFvrk;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      family: this.family,
      producer: this.producer,
      kser: this.kser,
      ku: this.ku,
      fvrk: this.fvrk,
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}
