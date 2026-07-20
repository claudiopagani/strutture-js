import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });
const STATE_VERSION = 1;

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryFiberInterface2D requires a positive ${label}.`);
  }
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`MasonryFiberInterface2D requires a finite ${label}.`);
  }
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function cloneResponse(response) {
  return {
    ...response,
    forces: [...response.forces],
    tangent: cloneMatrix(response.tangent),
    fibers: response.fibers.map((fiber) => ({ ...fiber })),
    mechanismsActivated: [...response.mechanismsActivated],
  };
}

function solveTwoByTwo(matrix, vector, pivotTolerance) {
  const [[a, b], [c, d]] = matrix;
  const determinant = a * d - b * c;
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), 1);

  if (Math.abs(determinant) <= pivotTolerance * scale ** 2) {
    throw new Error(
      "MasonryFiberInterface2D local Newton iteration encountered a singular interface tangent.",
    );
  }

  return [
    (d * vector[0] - b * vector[1]) / determinant,
    (-c * vector[0] + a * vector[1]) / determinant,
  ];
}

function compressedFraction(leftGap, rightGap) {
  if (leftGap < 0 && rightGap < 0) {
    return 1;
  }

  if (leftGap >= 0 && rightGap >= 0) {
    return 0;
  }

  const denominator = rightGap - leftGap;

  if (Math.abs(denominator) < 1e-18) {
    return leftGap < 0 ? 1 : 0;
  }

  const zeroPosition = -leftGap / denominator;
  return leftGap < 0 ? zeroPosition : 1 - zeroPosition;
}

/**
 * Zero-thickness N-M masonry interface discretized into independent axial
 * fibers. The generalized deformation is [delta0, theta], with
 * delta_i = delta0 + theta*x_i and epsilon_i = delta_i/hingeLength.
 */
export class MasonryFiberInterface2D {
  constructor({
    id = null,
    units = null,
    width,
    thickness,
    hingeLength,
    fiberCount = 20,
    compressionMaterial,
    contactStressTolerance = 0,
    localTolerance = 1e-8,
    maxLocalIterations = 40,
    pivotTolerance = 1e-12,
    metadata = {},
  } = {}) {
    assertExplicitUnitSystem(units, "MasonryFiberInterface2D");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.type = "masonry-fiber-interface-2d";
    this.units = resolver.targetUnitSystem;
    this.width = resolver.length(width);
    this.thickness = resolver.length(thickness);
    this.hingeLength = resolver.length(hingeLength);
    this.fiberCount = fiberCount;
    this.contactStressTolerance = resolver.stress(contactStressTolerance);
    this.localTolerance = localTolerance;
    this.maxLocalIterations = maxLocalIterations;
    this.pivotTolerance = pivotTolerance;
    this.metadata = {
      ...metadata,
      unitSystem: resolver.targetUnitSystem,
      sourceUnitSystem:
        metadata.sourceUnitSystem ?? resolver.sourceUnitSystem,
    };

    assertPositive(this.width, "width");
    assertPositive(this.thickness, "thickness");
    assertPositive(this.hingeLength, "hingeLength");
    assertPositive(this.localTolerance, "localTolerance");
    assertPositive(this.maxLocalIterations, "maxLocalIterations");
    assertPositive(this.pivotTolerance, "pivotTolerance");

    if (!Number.isInteger(this.fiberCount) || this.fiberCount < 2) {
      throw new Error(
        "MasonryFiberInterface2D requires an integer fiberCount >= 2.",
      );
    }

    if (
      !compressionMaterial ||
      typeof compressionMaterial.clone !== "function" ||
      typeof compressionMaterial.setTrialStrain !== "function"
    ) {
      throw new Error(
        "MasonryFiberInterface2D requires a cloneable trial-state compressionMaterial.",
      );
    }

    if (
      compressionMaterial.units?.force !== INTERNAL_UNITS.force ||
      compressionMaterial.units?.length !== INTERNAL_UNITS.length
    ) {
      throw new Error(
        "MasonryFiberInterface2D compressionMaterial must use the masonry FEM internal units { force: 'kN', length: 'm' }.",
      );
    }

    this._prototypeMaterial = compressionMaterial.clone();
    this.fibers = this.createFibers(compressionMaterial);
    this.revertToStart();
  }

  createFibers(compressionMaterial) {
    const fiberWidth = this.width / this.fiberCount;
    const area = fiberWidth * this.thickness;

    return Array.from({ length: this.fiberCount }, (_, index) => ({
      id: `${this.id ?? "interface"}-fiber-${index + 1}`,
      index,
      x: -this.width / 2 + (index + 0.5) * fiberWidth,
      width: fiberWidth,
      area,
      material: compressionMaterial.clone(),
    }));
  }

  initialResponse() {
    return {
      version: STATE_VERSION,
      axialDisplacement: 0,
      rotation: 0,
      axialForce: 0,
      moment: 0,
      forces: [0, 0],
      tangent: [[0, 0], [0, 0]],
      compressedLength: 0,
      contactRatio: 0,
      compressionResultant: 0,
      maxFiberStrain: 0,
      minFiberStrain: 0,
      maxCompressionStrain: 0,
      maxCompressionDamage: 0,
      averageCompressionDamage: 0,
      rockingIndex: 1,
      crushingIndex: 0,
      energyDissipated: 0,
      mechanismsActivated: [],
      fibers: this.fibers.map((fiber) => ({
        id: fiber.id,
        index: fiber.index,
        x: fiber.x,
        width: fiber.width,
        area: fiber.area,
        strain: 0,
        stress: 0,
        tangent: fiber.material.getTangent(),
        contactActive: false,
        damage: 0,
        crushingActivated: false,
        dissipatedEnergy: 0,
      })),
      localIterations: 0,
      localConverged: true,
      localResidualNorm: 0,
    };
  }

  setTrialDeformation(deformation, rotationArgument = undefined) {
    const axialDisplacement =
      typeof deformation === "object"
        ? deformation.axialDisplacement ?? deformation.delta0 ?? 0
        : deformation;
    const rotation =
      typeof deformation === "object"
        ? deformation.rotation ?? deformation.theta ?? 0
        : rotationArgument ?? 0;

    assertFinite(axialDisplacement, "axialDisplacement");
    assertFinite(rotation, "rotation");

    let axialForce = 0;
    let moment = 0;
    let k00 = 0;
    let k01 = 0;
    let k11 = 0;
    let compressedLength = 0;
    let compressionResultant = 0;
    let maxCompressionDamage = 0;
    let damageWeightedLength = 0;
    let energyDissipated = 0;
    const fiberResponses = [];

    for (const fiber of this.fibers) {
      const displacement = axialDisplacement + rotation * fiber.x;
      const strain = displacement / this.hingeLength;

      fiber.material.setTrialStrain(strain);
      const stress = fiber.material.getStress();
      const tangent = fiber.material.getTangent();
      const materialState = fiber.material.getState();
      const force = stress * fiber.area;
      const axialStiffness = (tangent * fiber.area) / this.hingeLength;
      const closureStrain = materialState.zeroStressStrain ?? 0;
      const halfFiberRotationStrain =
        (rotation * fiber.width) / (2 * this.hingeLength);
      const leftGap = strain - halfFiberRotationStrain - closureStrain;
      const rightGap = strain + halfFiberRotationStrain - closureStrain;
      const contactFraction = compressedFraction(leftGap, rightGap);
      const contactActive = contactFraction > 0;

      axialForce += force;
      moment += force * fiber.x;
      k00 += axialStiffness;
      k01 += axialStiffness * fiber.x;
      k11 += axialStiffness * fiber.x ** 2;

      if (contactActive) {
        compressedLength += contactFraction * fiber.width;
        compressionResultant += -force;
        damageWeightedLength +=
          materialState.damage * contactFraction * fiber.width;
      }

      maxCompressionDamage = Math.max(
        maxCompressionDamage,
        materialState.damage,
      );
      energyDissipated += materialState.dissipatedEnergy * fiber.area * this.hingeLength;
      fiberResponses.push({
        id: fiber.id,
        index: fiber.index,
        x: fiber.x,
        width: fiber.width,
        area: fiber.area,
        strain,
        stress,
        tangent,
        contactActive,
        contactFraction,
        damage: materialState.damage,
        crushingActivated: materialState.crushingActivated,
        dissipatedEnergy: materialState.dissipatedEnergy,
      });
    }

    const strains = fiberResponses.map((fiber) => fiber.strain);
    const maxFiberStrain = Math.max(...strains);
    const minFiberStrain = Math.min(...strains);
    const maxCompressionStrain = Math.max(0, -minFiberStrain);
    const peakStrain = this._prototypeMaterial.peakStrain;
    const mechanismsActivated = [];

    if (compressedLength < this.width - this.width / (2 * this.fiberCount)) {
      mechanismsActivated.push("rocking");
    }

    if (fiberResponses.some((fiber) => fiber.crushingActivated)) {
      mechanismsActivated.push("crushing");
    }

    this._trialResponse = {
      version: STATE_VERSION,
      axialDisplacement,
      rotation,
      axialForce,
      moment,
      forces: [axialForce, moment],
      tangent: [[k00, k01], [k01, k11]],
      compressedLength,
      contactRatio: compressedLength / this.width,
      compressionResultant,
      maxFiberStrain,
      minFiberStrain,
      maxCompressionStrain,
      maxCompressionDamage,
      averageCompressionDamage:
        compressedLength > 0 ? damageWeightedLength / compressedLength : 0,
      rockingIndex: 1 - compressedLength / this.width,
      crushingIndex: peakStrain > 0 ? maxCompressionStrain / peakStrain : 0,
      energyDissipated,
      mechanismsActivated,
      fibers: fiberResponses,
      localIterations: 0,
      localConverged: true,
      localResidualNorm: 0,
    };

    return [...this._trialResponse.forces];
  }

  solveForResultants(
    target,
    {
      initialDeformation = null,
      tolerance = this.localTolerance,
      maxIterations = this.maxLocalIterations,
    } = {},
  ) {
    const targetAxialForce = target?.axialForce ?? target?.N ?? target?.[0];
    const targetMoment = target?.moment ?? target?.M ?? target?.[1];

    assertFinite(targetAxialForce, "target axial force");
    assertFinite(targetMoment, "target moment");
    assertPositive(tolerance, "solveForResultants tolerance");

    let deformation = initialDeformation
      ? [
          initialDeformation.axialDisplacement ?? initialDeformation[0] ?? 0,
          initialDeformation.rotation ?? initialDeformation[1] ?? 0,
        ]
      : [
          this._committedResponse.axialDisplacement,
          this._committedResponse.rotation,
        ];
    let residualNorm = Infinity;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const forces = this.setTrialDeformation(deformation[0], deformation[1]);
      const residual = [
        targetAxialForce - forces[0],
        targetMoment - forces[1],
      ];
      const forceScale = Math.max(Math.abs(targetAxialForce), 1);
      const momentScale = Math.max(
        Math.abs(targetMoment),
        forceScale * this.width,
        1,
      );
      residualNorm = Math.sqrt(
        (residual[0] / forceScale) ** 2 +
        (residual[1] / momentScale) ** 2,
      );

      if (residualNorm <= tolerance) {
        this._trialResponse.localIterations = iteration;
        this._trialResponse.localConverged = true;
        this._trialResponse.localResidualNorm = residualNorm;
        return this.getResponse();
      }

      const correction = solveTwoByTwo(
        this._trialResponse.tangent,
        residual,
        this.pivotTolerance,
      );
      deformation = [
        deformation[0] + correction[0],
        deformation[1] + correction[1],
      ];
    }

    this._trialResponse.localIterations = maxIterations;
    this._trialResponse.localConverged = false;
    this._trialResponse.localResidualNorm = residualNorm;
    throw new Error(
      `MasonryFiberInterface2D local Newton iteration did not converge in ${maxIterations} iterations (normalized residual ${residualNorm}).`,
    );
  }

  getForces() {
    return [...this._trialResponse.forces];
  }

  getTangent() {
    return cloneMatrix(this._trialResponse.tangent);
  }

  getResponse() {
    return cloneResponse(this._trialResponse);
  }

  getCommittedResponse() {
    return cloneResponse(this._committedResponse);
  }

  commitState() {
    for (const fiber of this.fibers) {
      fiber.material.commitState();
    }

    this._committedResponse = cloneResponse(this._trialResponse);
    return 0;
  }

  revertToLastCommit() {
    for (const fiber of this.fibers) {
      fiber.material.revertToLastCommit();
    }

    this._trialResponse = cloneResponse(this._committedResponse);
    return 0;
  }

  revertToStart() {
    for (const fiber of this.fibers) {
      fiber.material.revertToStart();
    }

    this._committedResponse = this.initialResponse();
    this._trialResponse = cloneResponse(this._committedResponse);
    return 0;
  }

  exportState({ committed = true } = {}) {
    const response = committed
      ? this.getCommittedResponse()
      : this.getResponse();

    return {
      version: STATE_VERSION,
      response,
      fiberStates: this.fibers.map((fiber) =>
        committed
          ? fiber.material.getCommittedState()
          : fiber.material.getState(),
      ),
    };
  }

  importState(state, { committed = true } = {}) {
    if (
      !state ||
      state.version !== STATE_VERSION ||
      !Array.isArray(state.fiberStates) ||
      state.fiberStates.length !== this.fibers.length
    ) {
      throw new Error(
        `MasonryFiberInterface2D requires state version ${STATE_VERSION} with ${this.fibers.length} fiber states.`,
      );
    }

    this.fibers.forEach((fiber, index) => {
      fiber.material.importState(state.fiberStates[index], { committed });
    });
    this._trialResponse = cloneResponse(state.response);

    if (committed) {
      this._committedResponse = cloneResponse(state.response);
    }

    return this;
  }

  clone() {
    const cloned = new MasonryFiberInterface2D({
      id: this.id,
      units: this.units,
      width: this.width,
      thickness: this.thickness,
      hingeLength: this.hingeLength,
      fiberCount: this.fiberCount,
      compressionMaterial: this._prototypeMaterial,
      contactStressTolerance: this.contactStressTolerance,
      localTolerance: this.localTolerance,
      maxLocalIterations: this.maxLocalIterations,
      pivotTolerance: this.pivotTolerance,
      metadata: { ...this.metadata },
    });

    cloned.importState(this.exportState(), { committed: true });
    return cloned;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      units: { ...this.units },
      width: this.width,
      thickness: this.thickness,
      hingeLength: this.hingeLength,
      fiberCount: this.fiberCount,
      fiberWidth: this.width / this.fiberCount,
      fiberArea: (this.width * this.thickness) / this.fiberCount,
      compressionMaterial: this._prototypeMaterial.toJSON(),
      state: this.exportState(),
      metadata: { ...this.metadata },
    };
  }
}
