import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MohrCoulombModel requires a positive ${label}.`);
  }
}

function assertNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`MohrCoulombModel requires a non-negative ${label}.`);
  }
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Generic Mohr-Coulomb alternative for the diagonal/shear strength slot. */
export class MohrCoulombModel {
  constructor({
    id = null,
    units = null,
    cohesion,
    frictionCoefficient,
    cohesionDamageCoefficient = 1,
    frictionDamageCoefficient = 0,
    metadata = {},
  } = {}) {
    assertExplicitUnitSystem(units, "MohrCoulombModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.type = "mohr-coulomb";
    this.units = resolver.targetUnitSystem;
    this.cohesion = resolver.stress(cohesion);
    this.frictionCoefficient = frictionCoefficient;
    this.cohesionDamageCoefficient = cohesionDamageCoefficient;
    this.frictionDamageCoefficient = frictionDamageCoefficient;
    this.metadata = {
      ...metadata,
      unitSystem: resolver.targetUnitSystem,
      sourceUnitSystem:
        metadata.sourceUnitSystem ?? resolver.sourceUnitSystem,
      calibrationRequired: true,
    };

    assertPositive(this.cohesion, "cohesion");
    assertNonNegative(this.frictionCoefficient, "frictionCoefficient");
    assertNonNegative(
      this.cohesionDamageCoefficient,
      "cohesionDamageCoefficient",
    );
    assertNonNegative(
      this.frictionDamageCoefficient,
      "frictionDamageCoefficient",
    );
  }

  evaluate({
    currentAxialCompression = 0,
    compressedLength = 0,
    thickness,
    shearDamage = 0,
  } = {}) {
    assertPositive(thickness, "context thickness");
    const effectiveLength = Math.max(0, compressedLength);
    const effectiveArea = thickness * effectiveLength;
    const compression = Math.max(0, currentAxialCompression);
    const damage = clamp(shearDamage);
    const cohesionFactor = clamp(1 - this.cohesionDamageCoefficient * damage);
    const frictionFactor = clamp(1 - this.frictionDamageCoefficient * damage);
    const cohesionContribution = this.cohesion * cohesionFactor * effectiveArea;
    const frictionContribution =
      this.frictionCoefficient * frictionFactor * compression;
    const strengthDegradationFloor = frictionContribution;

    return {
      type: this.type,
      capacity: cohesionContribution + frictionContribution,
      cohesionContribution,
      frictionContribution,
      strengthDegradationFloor,
      effectiveArea,
      effectiveLength,
      compression,
      cohesionFactor,
      frictionFactor,
    };
  }

  clone() {
    return new MohrCoulombModel(this.toJSON());
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      units: { ...this.units },
      cohesion: this.cohesion,
      frictionCoefficient: this.frictionCoefficient,
      cohesionDamageCoefficient: this.cohesionDamageCoefficient,
      frictionDamageCoefficient: this.frictionDamageCoefficient,
      metadata: { ...this.metadata },
    };
  }
}
