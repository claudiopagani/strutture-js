import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });
const STATE_VERSION = 1;
const DIRECTION_TOLERANCE = 1e-14;

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `CyclicMasonryCompressionMaterial requires a positive ${label}.`,
    );
  }
}

function assertNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `CyclicMasonryCompressionMaterial requires a non-negative ${label}.`,
    );
  }
}

function assertRatio(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(
      `CyclicMasonryCompressionMaterial requires ${label} between 0 and 1.`,
    );
  }
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function loadingDirection(increment, fallback = 0) {
  if (Math.abs(increment) <= DIRECTION_TOLERANCE) {
    return fallback;
  }

  return Math.sign(increment);
}

function cloneState(state) {
  return { ...state };
}

/**
 * Cyclic compression/contact law for one masonry fiber.
 *
 * Sign convention: strain and stress are positive in tension and negative in
 * compression. Opening is stress free when tensileStrength is zero. All
 * stresses are stored in kN/m^2; strains and damage variables are dimensionless.
 *
 * The pre-peak envelope is a cubic Hermite curve matching the assigned initial
 * modulus at the origin and zero tangent at the peak. Post-peak response is
 * linear down to the residual strength. Cyclic unloading is secant and fully
 * reversible until damageOnsetStrain; only excursions beyond that threshold can
 * create damage and a residual closure strain.
 */
export class CyclicMasonryCompressionMaterial {
  constructor({
    id = null,
    units = null,
    elasticModulus,
    compressiveStrength,
    peakStrain,
    prePeakCurve = "cubic",
    ultimateStrain = null,
    residualStrengthRatio = 0,
    damageOnsetStrain = peakStrain,
    unloadingStiffnessDegradation = 0,
    strengthDegradation = 0,
    energyDamageCoefficient = 0,
    energyCapacity = null,
    tensileStrength = 0,
    tensionElasticModulus = elasticModulus,
    tensionFractureEnergy = null,
    compressionFractureEnergy = null,
    hingeLength,
    numericalTangentRatio = 0,
    metadata = {},
  } = {}) {
    assertExplicitUnitSystem(units, "CyclicMasonryCompressionMaterial");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.type = "cyclic-masonry-compression";
    this.units = resolver.targetUnitSystem;
    this.elasticModulus = resolver.stress(elasticModulus);
    this.compressiveStrength = resolver.stress(compressiveStrength);
    this.peakStrain = peakStrain;
    this.prePeakCurve = String(prePeakCurve).trim().toLowerCase();
    this.residualStrengthRatio = residualStrengthRatio;
    this.damageOnsetStrain = damageOnsetStrain;
    this.unloadingStiffnessDegradation = unloadingStiffnessDegradation;
    this.strengthDegradation = strengthDegradation;
    this.energyDamageCoefficient = energyDamageCoefficient;
    this.tensileStrength = resolver.stress(tensileStrength);
    this.tensionElasticModulus = resolver.stress(tensionElasticModulus);
    this.tensionFractureEnergy = resolver.convert(tensionFractureEnergy, {
      forceExponent: 1,
      lengthExponent: -1,
    });
    this.compressionFractureEnergy = resolver.convert(
      compressionFractureEnergy,
      { forceExponent: 1, lengthExponent: -1 },
    );
    this.hingeLength = resolver.length(hingeLength);
    this.numericalTangentRatio = numericalTangentRatio;
    this.metadata = {
      ...metadata,
      unitSystem: resolver.targetUnitSystem,
      sourceUnitSystem:
        metadata.sourceUnitSystem ?? resolver.sourceUnitSystem,
      parameterStatus: metadata.parameterStatus ?? "user-calibrated",
    };

    assertPositive(this.elasticModulus, "elasticModulus");
    assertPositive(this.compressiveStrength, "compressiveStrength");
    assertPositive(this.peakStrain, "peakStrain");
    assertPositive(this.hingeLength, "hingeLength");
    assertRatio(this.residualStrengthRatio, "residualStrengthRatio");
    assertRatio(
      this.unloadingStiffnessDegradation,
      "unloadingStiffnessDegradation",
    );
    assertRatio(this.strengthDegradation, "strengthDegradation");
    assertNonNegative(this.energyDamageCoefficient, "energyDamageCoefficient");
    assertNonNegative(this.tensileStrength, "tensileStrength");
    assertPositive(this.tensionElasticModulus, "tensionElasticModulus");
    assertNonNegative(this.numericalTangentRatio, "numericalTangentRatio");

    if (!new Set(["linear", "cubic"]).has(this.prePeakCurve)) {
      throw new Error(
        'CyclicMasonryCompressionMaterial prePeakCurve must be "linear" or "cubic".',
      );
    }

    if (
      !Number.isFinite(this.damageOnsetStrain) ||
      this.damageOnsetStrain < this.peakStrain
    ) {
      throw new Error(
        "CyclicMasonryCompressionMaterial requires damageOnsetStrain >= peakStrain.",
      );
    }

    if (
      Number.isFinite(this.compressionFractureEnergy) &&
      this.compressionFractureEnergy <= 0
    ) {
      throw new Error(
        "CyclicMasonryCompressionMaterial compressionFractureEnergy must be positive.",
      );
    }

    if (
      Number.isFinite(this.tensionFractureEnergy) &&
      this.tensionFractureEnergy <= 0
    ) {
      throw new Error(
        "CyclicMasonryCompressionMaterial tensionFractureEnergy must be positive.",
      );
    }

    const derivedUltimateStrain = this.deriveUltimateStrainFromEnergy();
    this.ultimateStrain = ultimateStrain ?? derivedUltimateStrain;

    if (
      !Number.isFinite(this.ultimateStrain) ||
      this.ultimateStrain <= this.damageOnsetStrain
    ) {
      throw new Error(
        "CyclicMasonryCompressionMaterial requires ultimateStrain > damageOnsetStrain, or compressionFractureEnergy from which it can be derived.",
      );
    }

    this.energyCapacity =
      resolver.stress(energyCapacity) ??
      this.compressiveStrength * this.ultimateStrain;
    assertPositive(this.energyCapacity, "energyCapacity");

    const normalizedInitialSlope =
      (this.elasticModulus * this.peakStrain) / this.compressiveStrength;

    if (
      this.prePeakCurve === "linear" &&
      Math.abs(normalizedInitialSlope - 1) > 1e-9
    ) {
      throw new Error(
        'CyclicMasonryCompressionMaterial with prePeakCurve "linear" requires elasticModulus * peakStrain = compressiveStrength.',
      );
    }

    if (this.prePeakCurve === "cubic" && normalizedInitialSlope > 3 + 1e-12) {
      throw new Error(
        "CyclicMasonryCompressionMaterial requires elasticModulus * peakStrain / compressiveStrength <= 3 so that the cubic pre-peak envelope remains monotonic.",
      );
    }

    this._configuration = this.configuration();
    this.revertToStart();
  }

  deriveUltimateStrainFromEnergy() {
    if (!Number.isFinite(this.compressionFractureEnergy)) {
      return null;
    }

    const strengthDrop =
      this.compressiveStrength * (1 - this.residualStrengthRatio);

    if (strengthDrop <= 0) {
      throw new Error(
        "CyclicMasonryCompressionMaterial cannot derive ultimateStrain from compressionFractureEnergy when residualStrengthRatio is 1.",
      );
    }

    return (
      this.peakStrain +
      (2 * this.compressionFractureEnergy) /
        (this.hingeLength * strengthDrop)
    );
  }

  configuration() {
    return {
      id: this.id,
      units: { ...this.units },
      elasticModulus: this.elasticModulus,
      compressiveStrength: this.compressiveStrength,
      peakStrain: this.peakStrain,
      prePeakCurve: this.prePeakCurve,
      ultimateStrain: this.ultimateStrain,
      residualStrengthRatio: this.residualStrengthRatio,
      damageOnsetStrain: this.damageOnsetStrain,
      unloadingStiffnessDegradation: this.unloadingStiffnessDegradation,
      strengthDegradation: this.strengthDegradation,
      energyDamageCoefficient: this.energyDamageCoefficient,
      energyCapacity: this.energyCapacity,
      tensileStrength: this.tensileStrength,
      tensionElasticModulus: this.tensionElasticModulus,
      tensionFractureEnergy: this.tensionFractureEnergy,
      compressionFractureEnergy: this.compressionFractureEnergy,
      hingeLength: this.hingeLength,
      numericalTangentRatio: this.numericalTangentRatio,
      metadata: { ...this.metadata },
    };
  }

  initialState() {
    return {
      version: STATE_VERSION,
      strain: 0,
      stress: 0,
      tangent: this.elasticModulus,
      elasticStrain: 0,
      plasticStrain: 0,
      contactOpeningStrain: 0,
      damage: 0,
      stiffnessDamage: 0,
      strengthDamage: 0,
      maxCompressionStrain: 0,
      maxCompressionStress: 0,
      unloadingStiffness: this.elasticModulus,
      zeroStressStrain: 0,
      loadingDirection: 0,
      reversalCount: 0,
      cumulativeWork: 0,
      dissipatedEnergy: 0,
      crushingActivated: false,
      failed: false,
      branch: "initial",
    };
  }

  compressionEnvelope(compressionStrain, strengthDamage = 0) {
    const x = Math.max(0, compressionStrain);
    const residualStrength =
      this.residualStrengthRatio * this.compressiveStrength;
    let baseStress;
    let baseTangent;

    if (x <= this.peakStrain) {
      if (this.prePeakCurve === "linear") {
        baseStress = this.elasticModulus * x;
        baseTangent = this.elasticModulus;
      } else {
        const ratio = x / this.peakStrain;
        const slopeRatio =
          (this.elasticModulus * this.peakStrain) /
          this.compressiveStrength;
        const a = slopeRatio - 2;
        const b = 3 - 2 * slopeRatio;

        baseStress =
          this.compressiveStrength *
          (a * ratio ** 3 + b * ratio ** 2 + slopeRatio * ratio);
        baseTangent =
          (this.compressiveStrength / this.peakStrain) *
          (3 * a * ratio ** 2 + 2 * b * ratio + slopeRatio);
      }
    } else if (x < this.ultimateStrain) {
      const postPeakRatio =
        (x - this.peakStrain) /
        (this.ultimateStrain - this.peakStrain);
      baseStress =
        this.compressiveStrength -
        postPeakRatio * (this.compressiveStrength - residualStrength);
      baseTangent =
        -(this.compressiveStrength - residualStrength) /
        (this.ultimateStrain - this.peakStrain);
    } else {
      baseStress = residualStrength;
      baseTangent = 0;
    }

    const degradedStress =
      x <= this.peakStrain
        ? (1 - strengthDamage) * baseStress
        : Math.max(
            residualStrength,
            (1 - strengthDamage) * baseStress,
          );
    const tangentScale = degradedStress === residualStrength && baseStress > 0
      ? 0
      : 1 - strengthDamage;

    return {
      stress: degradedStress,
      tangent: tangentScale * baseTangent,
    };
  }

  damageFor(compressionStrain, dissipatedEnergy) {
    const crushingRange = this.ultimateStrain - this.damageOnsetStrain;
    const crushingProgress = clamp(
      (compressionStrain - this.damageOnsetStrain) / crushingRange,
    );
    const energyProgress = Math.max(0, dissipatedEnergy / this.energyCapacity);
    const strengthDamage = clamp(
      this.strengthDegradation * crushingProgress +
        this.energyDamageCoefficient * energyProgress,
      0,
      1 - this.residualStrengthRatio,
    );
    const stiffnessDamage = clamp(
      this.unloadingStiffnessDegradation * crushingProgress +
        this.energyDamageCoefficient * energyProgress,
    );

    return {
      crushingProgress,
      strengthDamage,
      stiffnessDamage,
      damage: Math.max(strengthDamage, stiffnessDamage),
    };
  }

  tensionResponse(openingStrain) {
    if (this.tensileStrength === 0 || openingStrain <= 0) {
      return {
        stress: 0,
        tangent: this.numericalTangentRatio * this.elasticModulus,
        branch: "open",
      };
    }

    const crackingStrain =
      this.tensileStrength / this.tensionElasticModulus;

    if (openingStrain <= crackingStrain) {
      return {
        stress: this.tensionElasticModulus * openingStrain,
        tangent: this.tensionElasticModulus,
        branch: "tension-elastic",
      };
    }

    if (!Number.isFinite(this.tensionFractureEnergy)) {
      return {
        stress: 0,
        tangent: this.numericalTangentRatio * this.elasticModulus,
        branch: "tension-cracked",
      };
    }

    const softeningRange =
      (2 * this.tensionFractureEnergy) /
      (this.tensileStrength * this.hingeLength);
    const softeningProgress =
      (openingStrain - crackingStrain) / softeningRange;

    if (softeningProgress >= 1) {
      return {
        stress: 0,
        tangent: this.numericalTangentRatio * this.elasticModulus,
        branch: "tension-cracked",
      };
    }

    return {
      stress: this.tensileStrength * (1 - softeningProgress),
      tangent: -this.tensileStrength / softeningRange,
      branch: "tension-softening",
    };
  }

  setTrialStrain(strain) {
    if (!Number.isFinite(strain)) {
      throw new Error(
        "CyclicMasonryCompressionMaterial setTrialStrain requires a finite strain.",
      );
    }

    const committed = this._committedState;
    const increment = strain - committed.strain;
    const direction = loadingDirection(increment, committed.loadingDirection);
    const reversed =
      committed.loadingDirection !== 0 &&
      direction !== 0 &&
      direction !== committed.loadingDirection;
    const reversalCount = committed.reversalCount + Number(reversed);
    const compressionStrain = Math.max(0, -strain);
    const newMaximum =
      compressionStrain >
      committed.maxCompressionStrain + DIRECTION_TOLERANCE;
    let response;
    let maxCompressionStrain = committed.maxCompressionStrain;
    let maxCompressionStress = committed.maxCompressionStress;
    let zeroStressStrain = committed.zeroStressStrain;
    let unloadingStiffness = committed.unloadingStiffness;
    let strengthDamage = committed.strengthDamage;
    let stiffnessDamage = committed.stiffnessDamage;
    let damage = committed.damage;
    let crushingActivated = committed.crushingActivated;

    if (newMaximum) {
      maxCompressionStrain = compressionStrain;
      crushingActivated =
        crushingActivated || compressionStrain > this.damageOnsetStrain;
      const nextDamage = this.damageFor(
        compressionStrain,
        committed.dissipatedEnergy,
      );

      strengthDamage = Math.max(strengthDamage, nextDamage.strengthDamage);
      stiffnessDamage = Math.max(stiffnessDamage, nextDamage.stiffnessDamage);
      damage = Math.max(damage, nextDamage.damage);
      response = this.compressionEnvelope(
        compressionStrain,
        strengthDamage,
      );
      maxCompressionStress = response.stress;

      if (!crushingActivated) {
        unloadingStiffness =
          compressionStrain > 0
            ? response.stress / compressionStrain
            : this.elasticModulus;
        zeroStressStrain = 0;
      } else {
        unloadingStiffness = Math.max(
          this.elasticModulus * this.numericalTangentRatio,
          this.elasticModulus * (1 - stiffnessDamage),
        );
        zeroStressStrain = strain + response.stress / unloadingStiffness;
      }

      response = {
        stress: -response.stress,
        tangent: response.tangent,
        branch:
          compressionStrain <= this.peakStrain
            ? "compression-envelope-pre-peak"
            : compressionStrain < this.ultimateStrain
              ? "compression-envelope-post-peak"
              : "compression-residual",
      };
    } else {
      const openingStrain = strain - zeroStressStrain;

      if (openingStrain >= 0) {
        response = this.tensionResponse(openingStrain);
      } else if (maxCompressionStrain > 0) {
        const lineStress = unloadingStiffness * openingStrain;
        const envelope = this.compressionEnvelope(
          compressionStrain,
          strengthDamage,
        );
        const boundedStress = Math.max(-envelope.stress, lineStress);

        response = {
          stress: boundedStress,
          tangent:
            boundedStress === lineStress
              ? unloadingStiffness
              : envelope.tangent,
          branch:
            direction < 0
              ? "compression-reloading"
              : "compression-unloading",
        };
      } else if (compressionStrain > 0) {
        const envelope = this.compressionEnvelope(compressionStrain, 0);
        response = {
          stress: -envelope.stress,
          tangent: envelope.tangent,
          branch: "compression-envelope-pre-peak",
        };
      } else {
        response = this.tensionResponse(strain);
      }
    }

    const workIncrement =
      0.5 * (committed.stress + response.stress) * increment;
    const cumulativeWork = committed.cumulativeWork + workIncrement;
    const recoverableEnergy =
      response.stress < 0 && unloadingStiffness > 0
        ? response.stress ** 2 / (2 * unloadingStiffness)
        : response.stress > 0 && this.tensionElasticModulus > 0
          ? response.stress ** 2 / (2 * this.tensionElasticModulus)
          : 0;
    const dissipatedEnergy = Math.max(
      committed.dissipatedEnergy,
      cumulativeWork - recoverableEnergy,
      0,
    );
    const contactOpeningStrain = Math.max(0, strain - zeroStressStrain);
    const plasticStrain = crushingActivated ? zeroStressStrain : 0;
    const elasticStrain =
      response.stress === 0
        ? 0
        : response.stress /
          (response.stress < 0 ? unloadingStiffness : this.tensionElasticModulus);

    this._trialState = {
      version: STATE_VERSION,
      strain,
      stress: response.stress,
      tangent: response.tangent,
      elasticStrain,
      plasticStrain,
      contactOpeningStrain,
      damage,
      stiffnessDamage,
      strengthDamage,
      maxCompressionStrain,
      maxCompressionStress,
      unloadingStiffness,
      zeroStressStrain,
      loadingDirection: direction,
      reversalCount,
      cumulativeWork,
      dissipatedEnergy,
      crushingActivated,
      failed: committed.failed || compressionStrain >= this.ultimateStrain,
      branch: response.branch,
    };

    return this._trialState.stress;
  }

  getStrain() {
    return this._trialState.strain;
  }

  getStress() {
    return this._trialState.stress;
  }

  getTangent() {
    return this._trialState.tangent;
  }

  getState() {
    return cloneState(this._trialState);
  }

  getCommittedState() {
    return cloneState(this._committedState);
  }

  commitState() {
    this._committedState = cloneState(this._trialState);
    return 0;
  }

  revertToLastCommit() {
    this._trialState = cloneState(this._committedState);
    return 0;
  }

  revertToStart() {
    this._committedState = this.initialState();
    this._trialState = cloneState(this._committedState);
    return 0;
  }

  importState(state, { committed = true } = {}) {
    if (!state || state.version !== STATE_VERSION) {
      throw new Error(
        `CyclicMasonryCompressionMaterial requires state version ${STATE_VERSION}.`,
      );
    }

    this._trialState = cloneState(state);

    if (committed) {
      this._committedState = cloneState(state);
    }

    return this;
  }

  clone() {
    const cloned = new CyclicMasonryCompressionMaterial(this._configuration);
    cloned._committedState = cloneState(this._committedState);
    cloned._trialState = cloneState(this._trialState);
    return cloned;
  }

  toJSON() {
    return {
      type: this.type,
      configuration: this.configuration(),
      committedState: this.getCommittedState(),
      trialState: this.getState(),
    };
  }
}

export { INTERNAL_UNITS as CYCLIC_MASONRY_INTERNAL_UNITS };
