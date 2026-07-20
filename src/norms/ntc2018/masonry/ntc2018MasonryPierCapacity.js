const EPS = 1e-12;

export const NTC2018_MASONRY_PIER_CAPACITY_REFERENCES = Object.freeze({
  flexural: "NTC 2018, §7.8.2.2.1, eq. [7.8.2]",
  sliding: "NTC 2018, §7.8.2.2.2, eq. [7.8.3]; Circolare 2019, §C8.7.1.3.1.1, eq. [C8.7.1.14]",
  irregularDiagonal: "Circolare 2019, §C8.7.1.3.1.1, eq. [C8.7.1.16]",
  regularDiagonal: "Circolare 2019, §C8.7.1.3.1.1, eqs. [C8.7.1.17]-[C8.7.1.18]",
});

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive value.`);
  }
}

function compression(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function unavailable(mechanism, missing, reference) {
  return {
    mechanism,
    available: false,
    capacity: null,
    missing: [...missing],
    reference,
  };
}

function aspectFactor(height, length) {
  return Math.min(1.5, Math.max(1, height / length));
}

/**
 * In-plane flexural resistance of an unreinforced rectangular masonry pier.
 * Compression is positive; tension gives zero flexural resistance, as required
 * by NTC 2018 §7.8.2.2.1. Inputs must use one coherent force-length system.
 */
export function calculateNTC2018MasonryPierFlexuralCapacity({
  axialCompression,
  compressiveStrength,
  length,
  thickness,
  shearSpan,
}) {
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(shearSpan, "shearSpan");

  if (!Number.isFinite(compressiveStrength) || compressiveStrength <= 0) {
    return unavailable(
      "flexural",
      ["compressiveStrength"],
      NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.flexural,
    );
  }

  const N = compression(axialCompression);
  const area = length * thickness;
  const normalStress = N / area;
  const compressionRatio = normalStress / compressiveStrength;
  const reductionFactor = Math.max(
    0,
    1 - normalStress / (0.85 * compressiveStrength),
  );
  const momentCapacity =
    N <= EPS ? 0 : (length ** 2 * thickness * normalStress * reductionFactor) / 2;

  return {
    mechanism: "flexural",
    available: true,
    capacity: momentCapacity / shearSpan,
    momentCapacity,
    axialCompression: N,
    normalStress,
    compressionRatio,
    reductionFactor,
    shearSpan,
    reference: NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.flexural,
  };
}

/**
 * Bed-joint sliding resistance on the compressed section. The compressed
 * length follows the no-tension linear stress block: l' = l for e <= l/6 and
 * l' = 3(l/2-e) otherwise. The implicit relation is solved in closed form.
 * Friction never grows under tensile axial force; 0.4 is prescribed by NTC.
 */
export function calculateNTC2018MasonryPierSlidingCapacity({
  axialCompression,
  cohesion,
  shearStrengthLimit,
  length,
  thickness,
  shearSpan,
}) {
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(shearSpan, "shearSpan");

  const missing = [];

  if (!Number.isFinite(cohesion) || cohesion < 0) {
    missing.push("cohesion");
  }

  if (!Number.isFinite(shearStrengthLimit) || shearStrengthLimit <= 0) {
    missing.push("shearStrengthLimit");
  }

  if (missing.length > 0) {
    return unavailable(
      "bed-joint-sliding",
      missing,
      NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.sliding,
    );
  }

  const N = compression(axialCompression);
  const fullArea = length * thickness;
  let cohesionCandidate;
  let blockLimitCandidate;

  const compressedLengthFromCapacity = (capacity) => {
    if (N <= EPS) return length;

    const eccentricity = (capacity * shearSpan) / N;

    if (eccentricity <= length / 6) return length;

    return Math.max(0, Math.min(length, 3 * (length / 2 - eccentricity)));
  };

  const resolveCohesionCandidate = () => {
    const fullSectionCapacity = cohesion * fullArea + 0.4 * N;

    if (
      N <= EPS ||
      (fullSectionCapacity * shearSpan) / N <= length / 6
    ) {
      return fullSectionCapacity;
    }

    return (
      (1.5 * cohesion * fullArea + 0.4 * N) /
      (1 + (3 * cohesion * thickness * shearSpan) / N)
    );
  };

  const resolveBlockLimitCandidate = () => {
    const fullSectionCapacity = shearStrengthLimit * fullArea;

    if (
      N <= EPS ||
      (fullSectionCapacity * shearSpan) / N <= length / 6
    ) {
      return fullSectionCapacity;
    }

    return (
      (1.5 * shearStrengthLimit * fullArea) /
      (1 + (3 * shearStrengthLimit * thickness * shearSpan) / N)
    );
  };

  if (N <= EPS) {
    cohesionCandidate = cohesion * fullArea;
    blockLimitCandidate = shearStrengthLimit * fullArea;
  } else {
    cohesionCandidate = resolveCohesionCandidate();
    blockLimitCandidate = resolveBlockLimitCandidate();
  }

  const capacity = Math.max(0, Math.min(cohesionCandidate, blockLimitCandidate));
  const eccentricity = N > EPS ? (capacity * shearSpan) / N : 0;
  const compressedLength = compressedLengthFromCapacity(capacity);
  const compressedArea = compressedLength * thickness;
  const normalStress = compressedArea > EPS ? N / compressedArea : 0;
  const uncappedStrength = cohesion + 0.4 * normalStress;

  return {
    mechanism: "bed-joint-sliding",
    available: true,
    capacity,
    axialCompression: N,
    cohesion,
    frictionCoefficient: 0.4,
    shearStrengthLimit,
    cohesionCandidate,
    blockLimitCandidate,
    governingLimit:
      blockLimitCandidate < cohesionCandidate
        ? "block-shear-limit"
        : "cohesion-friction",
    eccentricity,
    compressedLength,
    normalStress,
    effectiveShearStrength: Math.min(uncappedStrength, shearStrengthLimit),
    shearSpan,
    reference: NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.sliding,
  };
}

export function calculateNTC2018MasonryPierIrregularDiagonalCapacity({
  axialCompression,
  referenceShearStrength,
  diagonalTensileStrength = null,
  length,
  thickness,
  height,
}) {
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(height, "height");

  const tensileStrength = Number.isFinite(diagonalTensileStrength)
    ? diagonalTensileStrength
    : Number.isFinite(referenceShearStrength)
      ? 1.5 * referenceShearStrength
      : null;

  if (!Number.isFinite(tensileStrength) || tensileStrength <= 0) {
    return unavailable(
      "diagonal-cracking-irregular",
      ["referenceShearStrength or diagonalTensileStrength"],
      NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.irregularDiagonal,
    );
  }

  const N = compression(axialCompression);
  const area = length * thickness;
  const normalStress = N / area;
  const b = aspectFactor(height, length);
  const capacity =
    (area * tensileStrength * Math.sqrt(1 + normalStress / tensileStrength)) / b;

  return {
    mechanism: "diagonal-cracking-irregular",
    available: true,
    capacity,
    axialCompression: N,
    normalStress,
    diagonalTensileStrength: tensileStrength,
    aspectFactor: b,
    reference: NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.irregularDiagonal,
  };
}

export function calculateNTC2018MasonryPierRegularDiagonalCapacity({
  axialCompression,
  cohesion,
  interlockingCoefficient,
  localFrictionCoefficient = 0.577,
  blockTensileStrength,
  length,
  thickness,
  height,
}) {
  assertPositive(length, "length");
  assertPositive(thickness, "thickness");
  assertPositive(height, "height");

  const missing = [];

  if (!Number.isFinite(cohesion) || cohesion < 0) missing.push("cohesion");
  if (!Number.isFinite(interlockingCoefficient) || interlockingCoefficient <= 0) {
    missing.push("interlockingCoefficient");
  }
  if (!Number.isFinite(localFrictionCoefficient) || localFrictionCoefficient <= 0) {
    missing.push("localFrictionCoefficient");
  }
  if (!Number.isFinite(blockTensileStrength) || blockTensileStrength <= 0) {
    missing.push("blockTensileStrength");
  }

  if (missing.length > 0) {
    return unavailable(
      "diagonal-cracking-regular",
      missing,
      NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.regularDiagonal,
    );
  }

  const N = compression(axialCompression);
  const area = length * thickness;
  const normalStress = N / area;
  const b = aspectFactor(height, length);
  const denominator = 1 + localFrictionCoefficient * interlockingCoefficient;
  const equivalentCohesion = cohesion / denominator;
  const equivalentFrictionCoefficient = localFrictionCoefficient / denominator;
  const jointCandidate =
    (area / b) *
    (equivalentCohesion + equivalentFrictionCoefficient * normalStress);
  const blockCandidate =
    (area / b) *
    (blockTensileStrength / 2.3) *
    Math.sqrt(1 + normalStress / blockTensileStrength);

  return {
    mechanism: "diagonal-cracking-regular",
    available: true,
    capacity: Math.min(jointCandidate, blockCandidate),
    axialCompression: N,
    normalStress,
    aspectFactor: b,
    localFrictionCoefficient,
    interlockingCoefficient,
    equivalentCohesion,
    equivalentFrictionCoefficient,
    jointCandidate,
    blockCandidate,
    governingLimit:
      blockCandidate < jointCandidate ? "block-tension" : "stepped-joints",
    reference: NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.regularDiagonal,
  };
}

/** Exact minimum, including a valid zero resistance. */
export function selectNTC2018MasonryPierGoverningCapacity(capacities = []) {
  const available = capacities.filter(
    (item) => item?.available && Number.isFinite(item.capacity) && item.capacity >= 0,
  );

  if (available.length === 0) {
    return null;
  }

  return available.reduce((governing, candidate) =>
    candidate.capacity < governing.capacity ? candidate : governing,
  );
}
