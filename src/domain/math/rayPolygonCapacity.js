const DEFAULT_TOLERANCE = 1e-9;

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

/**
 * Finds the first intersection between a demand ray and a closed polygon.
 * Coordinates and demand components must use the same units.
 *
 * The polygon is expected to describe a resistance boundary containing the
 * origin. Its last point is implicitly connected to its first point.
 */
export function rayPolygonCapacity(
  points,
  demandX,
  demandY,
  { tolerance = DEFAULT_TOLERANCE } = {},
) {
  if (!Number.isFinite(demandX) || !Number.isFinite(demandY)) {
    throw new Error("Ray-polygon demand components must be finite.");
  }

  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error("Ray-polygon tolerance must be positive and finite.");
  }

  const demandNorm = Math.hypot(demandX, demandY);

  if (demandNorm <= tolerance) {
    return {
      demandNorm: 0,
      capacityNorm: Number.POSITIVE_INFINITY,
      utilizationRatio: 0,
      intersection: null,
    };
  }

  const direction = { x: demandX / demandNorm, y: demandY / demandNorm };
  const intersections = [];

  for (let index = 0; index < (points?.length ?? 0); index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];

    if (
      !Number.isFinite(start?.x) ||
      !Number.isFinite(start?.y) ||
      !Number.isFinite(end?.x) ||
      !Number.isFinite(end?.y)
    ) {
      continue;
    }

    const segment = {
      x: end.x - start.x,
      y: end.y - start.y,
    };
    const denominator = cross(direction, segment);

    if (Math.abs(denominator) <= tolerance) {
      continue;
    }

    const distance = cross(start, segment) / denominator;
    const segmentParameter = cross(start, direction) / denominator;

    if (
      distance >= -tolerance &&
      segmentParameter >= -tolerance &&
      segmentParameter <= 1 + tolerance
    ) {
      const nonNegativeDistance = Math.max(0, distance);
      intersections.push({
        distance: nonNegativeDistance,
        x: direction.x * nonNegativeDistance,
        y: direction.y * nonNegativeDistance,
        segmentIndex: index,
        segmentParameter: Math.min(1, Math.max(0, segmentParameter)),
      });
    }
  }

  const selected = intersections
    .filter((item) => item.distance > tolerance)
    .sort((a, b) => a.distance - b.distance)[0] ?? null;

  return {
    demandNorm,
    capacityNorm: selected?.distance ?? null,
    utilizationRatio: selected
      ? demandNorm / selected.distance
      : Number.POSITIVE_INFINITY,
    intersection: selected,
  };
}
