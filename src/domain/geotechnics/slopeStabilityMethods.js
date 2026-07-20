export const SLOPE_STABILITY_METHODS = Object.freeze([
  "spencer",
  "bishop-simplified",
  "ordinary-method-of-slices",
]);

const REFERENCE =
  "USACE EM 1110-2-1902 (2003), Appendix C, equations C-12, C-15 and C-16";

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function normalizeSlices(slices) {
  if (!Array.isArray(slices) || slices.length < 2) {
    throw new Error("Slope-stability analysis requires at least two slices.");
  }
  return slices.map((slice, index) => {
    const label = `slices[${index}]`;
    const width = finite(slice.width, `${label}.width`);
    const baseLength = finite(slice.baseLength, `${label}.baseLength`);
    const weight = finite(slice.totalVerticalLoad ?? slice.weight, `${label}.weight`);
    const alpha = finite(slice.baseInclination, `${label}.baseInclination`);
    const cohesion = finite(slice.cohesion, `${label}.cohesion`);
    const frictionAngle = finite(slice.frictionAngle, `${label}.frictionAngle`);
    const porePressure = finite(slice.porePressure ?? 0, `${label}.porePressure`);
    const horizontalLoad = finite(
      slice.horizontalSeismicLoad ?? 0,
      `${label}.horizontalSeismicLoad`,
    );
    if (width <= 0 || baseLength <= 0 || weight < 0 || cohesion < 0) {
      throw new Error(`${label} has invalid non-positive geometry, weight or cohesion.`);
    }
    if (Math.abs(alpha) >= Math.PI / 2 || frictionAngle < 0 || frictionAngle >= Math.PI / 2) {
      throw new Error(`${label} has an angle outside the supported range.`);
    }
    if (!['effective', 'total'].includes(slice.stressBasis)) {
      throw new Error(`${label}.stressBasis must be effective or total.`);
    }
    if (Math.abs(horizontalLoad) > 1e-12) {
      throw new Error(
        `${label} has horizontal inertia; use Spencer's Method for pseudostatic analysis.`,
      );
    }
    return {
      ...slice,
      width,
      baseLength,
      weight,
      baseInclination: alpha,
      cohesion,
      frictionAngle,
      porePressure: slice.stressBasis === "total" ? 0 : porePressure,
    };
  });
}

function drivingTerm(slice) {
  return slice.weight * Math.sin(slice.baseInclination);
}

function assertDrivingSum(value) {
  if (!Number.isFinite(value) || value <= 1e-12) {
    throw new Error(
      "The selected movement direction produces no positive driving moment.",
    );
  }
}

export function ordinaryMethodOfSlices(inputSlices) {
  const slices = normalizeSlices(inputSlices);
  const details = slices.map((slice) => {
    const cosine = Math.cos(slice.baseInclination);
    const effectiveNormal = slice.stressBasis === "effective"
      ? slice.weight * cosine -
        slice.porePressure * slice.baseLength * cosine ** 2
      : slice.weight * cosine;
    if (effectiveNormal < -1e-10) {
      throw new Error(
        `Slice ${slice.id ?? "unknown"} develops tensile effective normal force in the Ordinary Method of Slices.`,
      );
    }
    const cohesionResistance = slice.cohesion * slice.baseLength;
    const frictionResistance = effectiveNormal * Math.tan(slice.frictionAngle);
    return {
      id: slice.id ?? null,
      driving: drivingTerm(slice),
      effectiveNormal,
      cohesionResistance,
      frictionResistance,
      availableResistance: cohesionResistance + frictionResistance,
    };
  });
  const driving = details.reduce((sum, item) => sum + item.driving, 0);
  assertDrivingSum(driving);
  const resisting = details.reduce(
    (sum, item) => sum + item.availableResistance,
    0,
  );
  const factorOfSafety = resisting / driving;
  if (!Number.isFinite(factorOfSafety) || factorOfSafety <= 0) {
    throw new Error("The Ordinary Method of Slices produced an invalid factor of safety.");
  }
  return {
    method: "ordinary-method-of-slices",
    factorOfSafety,
    converged: true,
    iterations: 0,
    drivingSum: driving,
    resistingSum: resisting,
    sliceContributions: details,
    metadata: {
      reference: REFERENCE,
      equilibrium: ["overall-moment"],
      porePressureEquation: "USACE-C-12-effective-weight-form",
    },
  };
}

export function simplifiedBishop(inputSlices, {
  initialFactorOfSafety = null,
  tolerance = 1e-10,
  maximumIterations = 100,
} = {}) {
  const slices = normalizeSlices(inputSlices);
  const driving = slices.reduce((sum, slice) => sum + drivingTerm(slice), 0);
  assertDrivingSum(driving);
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error("Bishop iteration tolerance must be positive.");
  }
  if (!Number.isInteger(maximumIterations) || maximumIterations < 1) {
    throw new Error("Bishop maximumIterations must be a positive integer.");
  }

  let factor = initialFactorOfSafety == null
    ? ordinaryMethodOfSlices(slices).factorOfSafety
    : finite(initialFactorOfSafety, "initialFactorOfSafety");
  if (factor <= 0) throw new Error("initialFactorOfSafety must be positive.");
  let converged = false;
  let iterations = 0;

  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    let resisting = 0;
    for (const slice of slices) {
      const alpha = slice.baseInclination;
      const tangentPhi = Math.tan(slice.frictionAngle);
      const mAlpha = Math.cos(alpha) +
        Math.sin(alpha) * tangentPhi / factor;
      if (!Number.isFinite(mAlpha) || mAlpha <= 1e-12) {
        throw new Error(
          `Slice ${slice.id ?? "unknown"} has non-positive Bishop mAlpha.`,
        );
      }
      const poreForce = slice.stressBasis === "effective"
        ? slice.porePressure * slice.baseLength
        : 0;
      const effectiveVerticalTerm = slice.weight - poreForce;
      if (effectiveVerticalTerm < -1e-10) {
        throw new Error(
          `Slice ${slice.id ?? "unknown"} develops tensile effective normal force in the Simplified Bishop Method.`,
        );
      }
      resisting += (
        slice.cohesion * slice.width + effectiveVerticalTerm * tangentPhi
      ) / mAlpha;
    }
    const next = resisting / driving;
    if (!Number.isFinite(next) || next <= 0) {
      throw new Error("The Simplified Bishop iteration produced an invalid factor of safety.");
    }
    iterations = iteration;
    if (Math.abs(next - factor) <= tolerance * Math.max(1, Math.abs(next))) {
      factor = next;
      converged = true;
      break;
    }
    factor = next;
  }
  if (!converged) {
    throw new Error(
      `The Simplified Bishop iteration did not converge in ${maximumIterations} iterations.`,
    );
  }

  const details = slices.map((slice) => {
    const tangentPhi = Math.tan(slice.frictionAngle);
    const mAlpha = Math.cos(slice.baseInclination) +
      Math.sin(slice.baseInclination) * tangentPhi / factor;
    const poreForce = slice.stressBasis === "effective"
      ? slice.porePressure * slice.baseLength
      : 0;
    const effectiveVerticalTerm = slice.weight - poreForce;
    const cohesionTerm = slice.cohesion * slice.width;
    const frictionTerm = effectiveVerticalTerm * tangentPhi;
    return {
      id: slice.id ?? null,
      driving: drivingTerm(slice),
      mAlpha,
      poreForce,
      effectiveVerticalTerm,
      cohesionTerm,
      frictionTerm,
      correctedResistance: (cohesionTerm + frictionTerm) / mAlpha,
    };
  });

  return {
    method: "bishop-simplified",
    factorOfSafety: factor,
    converged,
    iterations,
    drivingSum: driving,
    resistingSum: details.reduce(
      (sum, item) => sum + item.correctedResistance,
      0,
    ),
    sliceContributions: details,
    metadata: {
      reference: REFERENCE,
      equilibrium: ["vertical-force", "overall-moment"],
      unsatisfiedEquilibrium: ["horizontal-force"],
      tolerance,
      maximumIterations,
    },
  };
}
