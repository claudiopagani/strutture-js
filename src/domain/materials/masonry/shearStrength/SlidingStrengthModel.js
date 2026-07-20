import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SlidingStrengthModel requires a positive ${label}.`);
  }
}

function assertNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`SlidingStrengthModel requires a non-negative ${label}.`);
  }
}

function assertRatio(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`SlidingStrengthModel requires ${label} between 0 and 1.`);
  }
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** V_SL = c_d*t*l_c + mu_d*max(N_c, 0). */
export class SlidingStrengthModel {
  constructor({
    id = null,
    units = null,
    cohesion,
    frictionCoefficient,
    residualCohesionRatio = 0,
    cohesionDamageCoefficient = 1,
    frictionDamageCoefficient = 0,
    metadata = {},
  } = {}) {
    assertExplicitUnitSystem(units, "SlidingStrengthModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.type = "bed-joint-sliding";
    this.units = resolver.targetUnitSystem;
    this.cohesion = resolver.stress(cohesion);
    this.frictionCoefficient = frictionCoefficient;
    this.residualCohesionRatio = residualCohesionRatio;
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
    assertRatio(this.residualCohesionRatio, "residualCohesionRatio");
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
    const residualCohesion = this.residualCohesionRatio * this.cohesion;
    const degradedCohesion = Math.max(
      residualCohesion,
      this.cohesion * (1 - this.cohesionDamageCoefficient * damage),
    );
    const degradedFriction =
      this.frictionCoefficient *
      clamp(1 - this.frictionDamageCoefficient * damage);
    const cohesionContribution = degradedCohesion * effectiveArea;
    const frictionContribution = degradedFriction * compression;
    const residualCohesionContribution = residualCohesion * effectiveArea;
    const strengthDegradationFloor =
      residualCohesionContribution + frictionContribution;

    return {
      type: this.type,
      capacity: cohesionContribution + frictionContribution,
      cohesionContribution,
      frictionContribution,
      residualCohesionContribution,
      strengthDegradationFloor,
      effectiveArea,
      effectiveLength,
      compression,
      degradedCohesion,
      degradedFriction,
    };
  }

  clone() {
    return new SlidingStrengthModel(this.toJSON());
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      units: { ...this.units },
      cohesion: this.cohesion,
      frictionCoefficient: this.frictionCoefficient,
      residualCohesionRatio: this.residualCohesionRatio,
      cohesionDamageCoefficient: this.cohesionDamageCoefficient,
      frictionDamageCoefficient: this.frictionDamageCoefficient,
      metadata: { ...this.metadata },
    };
  }
}
