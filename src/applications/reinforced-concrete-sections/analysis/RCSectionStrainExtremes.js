const TWO_PI = 2 * Math.PI;
const ANGLE_TOLERANCE = 1e-14;

export function normalizeNeutralAxisAngle(theta) {
  if (!Number.isFinite(theta)) {
    throw new Error("Neutral-axis theta must be finite.");
  }

  let normalized = theta % TWO_PI;

  if (normalized < 0) {
    normalized += TWO_PI;
  }

  if (
    Math.abs(normalized) <= ANGLE_TOLERANCE ||
    Math.abs(normalized - TWO_PI) <= ANGLE_TOLERANCE
  ) {
    return 0;
  }

  for (const cardinal of [Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    if (Math.abs(normalized - cardinal) <= ANGLE_TOLERANCE) {
      return cardinal;
    }
  }

  return Number(normalized.toPrecision(15));
}

export function neutralAxisDirection(theta) {
  const normalizedTheta = normalizeNeutralAxisAngle(theta);
  const cos = Math.cos(normalizedTheta);
  const sin = Math.sin(normalizedTheta);

  return {
    theta: normalizedTheta,
    cos: Math.abs(cos) <= ANGLE_TOLERANCE ? 0 : cos,
    sin: Math.abs(sin) <= ANGLE_TOLERANCE ? 0 : sin,
  };
}

/**
 * Signed coordinate normal to the neutral axis.
 * theta is counterclockwise from +z toward +y.
 */
export function projectionAt(theta, { y, z }) {
  const direction = neutralAxisDirection(theta);
  return y * direction.cos - z * direction.sin;
}

export function getConcreteProjectedBounds(section, theta) {
  if (!section?.concreteSection) {
    throw new Error(
      "getConcreteProjectedBounds requires a reinforced concrete section.",
    );
  }

  if (!Number.isFinite(theta)) {
    throw new Error("getConcreteProjectedBounds requires a finite theta.");
  }

  const outlinePoints = section.getConcreteOutlinePoints();

  if (!Array.isArray(outlinePoints) || outlinePoints.length < 3) {
    throw new Error(
      "getConcreteProjectedBounds requires at least three concrete outline points.",
    );
  }

  const projectedPoints = outlinePoints.map((point) => ({
    ...point,
    projection: projectionAt(theta, point),
  }));

  return {
    minimum: projectedPoints.reduce((current, point) =>
      current == null || point.projection < current.projection
        ? point
        : current,
    null),
    maximum: projectedPoints.reduce((current, point) =>
      current == null || point.projection > current.projection
        ? point
        : current,
    null),
    points: projectedPoints,
  };
}

export function resolveConcreteStrainExtremes({ section, strainField }) {
  if (!strainField || typeof strainField.strainAt !== "function") {
    throw new Error(
      "resolveConcreteStrainExtremes requires a strain field.",
    );
  }

  const outlinePoints = section.getConcreteOutlinePoints();

  if (!Array.isArray(outlinePoints) || outlinePoints.length < 3) {
    throw new Error(
      "resolveConcreteStrainExtremes requires at least three concrete outline points.",
    );
  }

  const strainedPoints = outlinePoints.map((point) => ({
    ...point,
    strain: strainField.strainAt(point),
  }));
  const minimum = strainedPoints.reduce((current, point) =>
    current == null || point.strain < current.strain ? point : current,
  null);
  const maximum = strainedPoints.reduce((current, point) =>
    current == null || point.strain > current.strain ? point : current,
  null);

  return {
    minimum,
    maximum,
    compression: {
      ...minimum,
      demand: Math.max(0, -(minimum?.strain ?? 0)),
    },
    tension: {
      ...maximum,
      demand: Math.max(0, maximum?.strain ?? 0),
    },
    points: strainedPoints,
  };
}
