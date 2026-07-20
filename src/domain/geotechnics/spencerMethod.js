const REFERENCE =
  "Spencer (1967), doi:10.1680/geot.1967.17.1.11; USBR Design Standards No. 13, Chapter 4 (2011), Appendix B";

const DEFAULT_THETA_LIMIT = 75 * Math.PI / 180;

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function normalizeSlices(inputSlices) {
  if (!Array.isArray(inputSlices) || inputSlices.length < 2) {
    throw new Error("Spencer analysis requires at least two slices.");
  }
  return inputSlices.map((slice, index) => {
    const label = `slices[${index}]`;
    const width = positive(slice.width, `${label}.width`);
    const baseLength = positive(slice.baseLength, `${label}.baseLength`);
    const verticalLoad = finite(
      slice.totalVerticalLoad ?? slice.weight,
      `${label}.totalVerticalLoad`,
    );
    const horizontalLoad = finite(
      slice.horizontalSeismicLoad ?? 0,
      `${label}.horizontalSeismicLoad`,
    );
    const alpha = finite(slice.baseInclination, `${label}.baseInclination`);
    const cohesion = finite(slice.cohesion, `${label}.cohesion`);
    const frictionAngle = finite(
      slice.frictionAngle,
      `${label}.frictionAngle`,
    );
    const porePressure = finite(
      slice.porePressure ?? 0,
      `${label}.porePressure`,
    );
    const baseMomentArm = positive(
      slice.baseMomentArm,
      `${label}.baseMomentArm`,
    );
    const drivingMoment = finite(
      slice.drivingMoment,
      `${label}.drivingMoment`,
    );
    if (verticalLoad < 0 || horizontalLoad < 0 || cohesion < 0) {
      throw new Error(`${label} has a negative load or cohesion.`);
    }
    if (
      Math.abs(alpha) >= Math.PI / 2 ||
      frictionAngle < 0 ||
      frictionAngle >= Math.PI / 2
    ) {
      throw new Error(`${label} has an angle outside the supported range.`);
    }
    if (!["effective", "total"].includes(slice.stressBasis)) {
      throw new Error(`${label}.stressBasis must be effective or total.`);
    }
    return {
      ...slice,
      width,
      baseLength,
      verticalLoad,
      horizontalLoad,
      baseInclination: alpha,
      cohesion,
      frictionAngle,
      porePressure: slice.stressBasis === "total" ? 0 : porePressure,
      baseMomentArm,
      drivingMoment,
    };
  });
}

function evaluateState(slices, factorOfSafety, theta) {
  if (!Number.isFinite(factorOfSafety) || factorOfSafety <= 0) {
    throw new Error("Spencer factor-of-safety trial must be positive.");
  }
  if (!Number.isFinite(theta) || Math.abs(theta) >= Math.PI / 2) {
    throw new Error("Spencer interslice-force inclination is invalid.");
  }

  let leftIntersliceForce = 0;
  let resistingMoment = 0;
  let drivingMoment = 0;
  let forceScale = 0;
  const contributions = [];

  for (const slice of slices) {
    const alpha = slice.baseInclination;
    const tangentPhi = Math.tan(slice.frictionAngle);
    const relativeInclination = theta - alpha;
    const cosineRelative = Math.cos(relativeInclination);
    const sineRelative = Math.sin(relativeInclination);
    const denominator = cosineRelative -
      sineRelative * tangentPhi / factorOfSafety;
    if (!Number.isFinite(denominator) || Math.abs(denominator) <= 1e-10) {
      throw new Error(
        `Slice ${slice.id ?? "unknown"} has a singular Spencer force denominator.`,
      );
    }

    const poreForce = slice.porePressure * slice.baseLength;
    const drivingTangent =
      slice.verticalLoad * Math.sin(alpha) +
      slice.horizontalLoad * Math.cos(alpha);
    const baseNormalFromExternalLoads =
      slice.verticalLoad * Math.cos(alpha) -
      slice.horizontalLoad * Math.sin(alpha);
    const rightMinusLeft = (
      slice.cohesion * slice.baseLength / factorOfSafety -
      drivingTangent +
      (baseNormalFromExternalLoads - poreForce) * tangentPhi /
        factorOfSafety
    ) / denominator;
    const rightIntersliceForce = leftIntersliceForce + rightMinusLeft;
    const totalBaseNormal = baseNormalFromExternalLoads +
      rightMinusLeft * sineRelative;
    const effectiveBaseNormal = totalBaseNormal - poreForce;
    const availableResistance = slice.cohesion * slice.baseLength +
      effectiveBaseNormal * tangentPhi;
    const mobilizedShear = availableResistance / factorOfSafety;
    const forceDerivedShear = drivingTangent +
      rightMinusLeft * cosineRelative;

    resistingMoment += mobilizedShear * slice.baseMomentArm;
    drivingMoment += slice.drivingMoment;
    forceScale += Math.hypot(slice.verticalLoad, slice.horizontalLoad) +
      slice.cohesion * slice.baseLength;
    contributions.push({
      id: slice.id ?? null,
      leftIntersliceForce,
      rightIntersliceForce,
      intersliceForceIncrement: rightMinusLeft,
      relativeInclination,
      denominator,
      poreForce,
      drivingTangent,
      baseNormalFromExternalLoads,
      totalBaseNormal,
      effectiveBaseNormal,
      availableResistance,
      mobilizedShear,
      forceDerivedShear,
      localShearEquilibriumResidual: mobilizedShear - forceDerivedShear,
      baseMomentArm: slice.baseMomentArm,
      resistingMoment: mobilizedShear * slice.baseMomentArm,
      drivingMoment: slice.drivingMoment,
    });
    leftIntersliceForce = rightIntersliceForce;
  }

  const forceResidual = leftIntersliceForce;
  const momentResidual = resistingMoment - drivingMoment;
  const normalizedForceResidual = forceResidual / Math.max(1, forceScale);
  const normalizedMomentResidual = momentResidual / Math.max(
    1,
    Math.abs(drivingMoment),
    Math.abs(resistingMoment),
  );
  return {
    factorOfSafety,
    theta,
    forceResidual,
    momentResidual,
    normalizedForceResidual,
    normalizedMomentResidual,
    residualNorm: Math.hypot(
      normalizedForceResidual,
      normalizedMomentResidual,
    ),
    resistingMoment,
    drivingMoment,
    contributions,
  };
}

function numericalJacobian(slices, state) {
  const factorStep = 1e-6 * Math.max(1, state.factorOfSafety);
  const thetaStep = 1e-6;
  const factorState = evaluateState(
    slices,
    state.factorOfSafety + factorStep,
    state.theta,
  );
  const thetaState = evaluateState(
    slices,
    state.factorOfSafety,
    state.theta + thetaStep,
  );
  return {
    forceByFactor:
      (factorState.normalizedForceResidual -
        state.normalizedForceResidual) / factorStep,
    forceByTheta:
      (thetaState.normalizedForceResidual -
        state.normalizedForceResidual) / thetaStep,
    momentByFactor:
      (factorState.normalizedMomentResidual -
        state.normalizedMomentResidual) / factorStep,
    momentByTheta:
      (thetaState.normalizedMomentResidual -
        state.normalizedMomentResidual) / thetaStep,
  };
}

function newtonIncrement(state, jacobian) {
  const determinant = jacobian.forceByFactor * jacobian.momentByTheta -
    jacobian.forceByTheta * jacobian.momentByFactor;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-14) {
    throw new Error("Spencer Newton Jacobian is singular.");
  }
  return {
    factor: (
      -state.normalizedForceResidual * jacobian.momentByTheta +
      jacobian.forceByTheta * state.normalizedMomentResidual
    ) / determinant,
    theta: (
      jacobian.momentByFactor * state.normalizedForceResidual -
      jacobian.forceByFactor * state.normalizedMomentResidual
    ) / determinant,
  };
}

function solveFromSeed(slices, seed, {
  tolerance,
  maximumIterations,
  thetaLimit,
}) {
  let state;
  try {
    state = evaluateState(slices, seed.factorOfSafety, seed.theta);
  } catch (error) {
    return { converged: false, iterations: 0, error: error.message };
  }

  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    if (state.residualNorm <= tolerance) {
      return { converged: true, iterations: iteration - 1, state };
    }
    let increment;
    try {
      increment = newtonIncrement(state, numericalJacobian(slices, state));
    } catch (error) {
      return { converged: false, iterations: iteration, error: error.message };
    }
    const maximumFactorStep = 0.75 * state.factorOfSafety;
    const maximumThetaStep = 20 * Math.PI / 180;
    increment.factor = Math.max(
      -maximumFactorStep,
      Math.min(maximumFactorStep, increment.factor),
    );
    increment.theta = Math.max(
      -maximumThetaStep,
      Math.min(maximumThetaStep, increment.theta),
    );

    let accepted = null;
    for (let lineSearch = 0; lineSearch < 14; lineSearch += 1) {
      const scale = 2 ** -lineSearch;
      const factor = state.factorOfSafety + scale * increment.factor;
      const theta = Math.max(
        -thetaLimit,
        Math.min(thetaLimit, state.theta + scale * increment.theta),
      );
      if (factor <= 0.01) continue;
      try {
        const candidate = evaluateState(slices, factor, theta);
        if (candidate.residualNorm < state.residualNorm) {
          accepted = candidate;
          break;
        }
      } catch {
        // Continue the damped line search around singular trial states.
      }
    }
    if (!accepted) {
      return {
        converged: false,
        iterations: iteration,
        error: "Spencer damped Newton search did not reduce the residual.",
      };
    }
    state = accepted;
  }
  return {
    converged: false,
    iterations: maximumIterations,
    state,
    error: `Spencer iteration did not converge in ${maximumIterations} iterations.`,
  };
}

function seedValues(initialFactorOfSafety, thetaLimit) {
  const factors = [
    initialFactorOfSafety,
    0.8 * initialFactorOfSafety,
    1.2 * initialFactorOfSafety,
    1,
    1.5,
  ].filter((value, index, values) =>
    value > 0.01 && values.findIndex((candidate) =>
      Math.abs(candidate - value) <= 1e-12) === index);
  const angles = [0, 15, -15, 30, -30, 45, -45]
    .map((degrees) => degrees * Math.PI / 180)
    .filter((theta) => Math.abs(theta) < thetaLimit);
  return factors.flatMap((factorOfSafety) =>
    angles.map((theta) => ({ factorOfSafety, theta })));
}

export function spencerMethod(inputSlices, {
  initialFactorOfSafety = 1.5,
  tolerance = 1e-9,
  maximumIterations = 100,
  thetaLimit = DEFAULT_THETA_LIMIT,
} = {}) {
  const slices = normalizeSlices(inputSlices);
  const initialFactor = positive(
    initialFactorOfSafety,
    "initialFactorOfSafety",
  );
  const normalizedTolerance = positive(tolerance, "Spencer tolerance");
  if (!Number.isInteger(maximumIterations) || maximumIterations < 1) {
    throw new Error("Spencer maximumIterations must be a positive integer.");
  }
  const normalizedThetaLimit = positive(thetaLimit, "Spencer thetaLimit");
  if (normalizedThetaLimit >= Math.PI / 2) {
    throw new Error("Spencer thetaLimit must be smaller than pi/2.");
  }
  const totalDrivingMoment = slices.reduce(
    (sum, slice) => sum + slice.drivingMoment,
    0,
  );
  if (!Number.isFinite(totalDrivingMoment) || totalDrivingMoment <= 1e-12) {
    throw new Error(
      "The selected movement direction produces no positive driving moment.",
    );
  }

  const attempts = [];
  let solution = null;
  for (const seed of seedValues(initialFactor, normalizedThetaLimit)) {
    const attempt = {
      seed,
      ...solveFromSeed(slices, seed, {
        tolerance: normalizedTolerance,
        maximumIterations,
        thetaLimit: normalizedThetaLimit,
      }),
    };
    attempts.push(attempt);
    if (!attempt.converged) continue;
    const tensile = attempt.state.contributions.find((item) =>
      item.effectiveBaseNormal < -1e-8);
    if (tensile) {
      throw new Error(
        `Slice ${tensile.id ?? "unknown"} develops tensile effective normal force ${tensile.effectiveBaseNormal} in Spencer's Method.`,
      );
    }
    solution = attempt;
    break;
  }
  if (!solution) {
    const best = attempts
      .filter((attempt) => attempt.state)
      .sort((left, right) =>
        left.state.residualNorm - right.state.residualNorm)[0];
    throw new Error(
      best
        ? `Spencer method did not converge; best normalized residual was ${best.state.residualNorm}.`
        : "Spencer method did not converge from any initial seed.",
    );
  }
  const maximumLocalResidual = Math.max(
    ...solution.state.contributions.map((item) =>
      Math.abs(item.localShearEquilibriumResidual)),
  );
  return {
    method: "spencer",
    factorOfSafety: solution.state.factorOfSafety,
    intersliceForceInclination: solution.state.theta,
    converged: true,
    iterations: solution.iterations,
    startsAttempted: attempts.length,
    equilibrium: {
      forceResidual: solution.state.forceResidual,
      momentResidual: solution.state.momentResidual,
      normalizedForceResidual: solution.state.normalizedForceResidual,
      normalizedMomentResidual: solution.state.normalizedMomentResidual,
      residualNorm: solution.state.residualNorm,
      maximumLocalShearResidual: maximumLocalResidual,
    },
    drivingMoment: solution.state.drivingMoment,
    resistingMoment: solution.state.resistingMoment,
    sliceContributions: solution.state.contributions,
    metadata: {
      reference: REFERENCE,
      equilibrium: ["horizontal-force", "vertical-force", "overall-moment"],
      intersliceForceAssumption: "parallel-resultants-at-constant-inclination",
      baseForceLocation: "center-of-straight-slice-base",
      tolerance: normalizedTolerance,
      maximumIterations,
      thetaLimit: normalizedThetaLimit,
    },
  };
}
