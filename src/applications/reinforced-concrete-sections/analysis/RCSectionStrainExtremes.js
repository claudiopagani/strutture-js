export function projectionAt(theta, { y, z }) {
  return y * Math.cos(theta) + z * Math.sin(theta);
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
