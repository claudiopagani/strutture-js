function isPointOnSegment(point, start, end, tolerance = 1e-9) {
  const cross =
    (point.y - start.y) * (end.z - start.z) -
    (point.z - start.z) * (end.y - start.y);

  if (Math.abs(cross) > tolerance) {
    return false;
  }

  const dot =
    (point.y - start.y) * (end.y - start.y) +
    (point.z - start.z) * (end.z - start.z);

  if (dot < -tolerance) {
    return false;
  }

  const squaredLength =
    (end.y - start.y) ** 2 + (end.z - start.z) ** 2;

  return dot <= squaredLength + tolerance;
}

function isPointInsidePolygon(point, polygon) {
  let inside = false;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];

    if (isPointOnSegment(point, current, next)) {
      return true;
    }

    const intersects =
      (current.z > point.z) !== (next.z > point.z) &&
      point.y <
        ((next.y - current.y) * (point.z - current.z)) /
          (next.z - current.z) +
          current.y;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export class SectionFiberDiscretizer {
  discretize(section, { targetCount = 100, method = "grid" } = {}) {
    if (!section?.concreteSection) {
      throw new Error("SectionFiberDiscretizer requires a reinforced concrete section.");
    }

    if (!Number.isInteger(targetCount) || targetCount <= 0) {
      throw new Error("SectionFiberDiscretizer targetCount must be a positive integer.");
    }

    if (method !== "grid") {
      throw new Error(`Unsupported discretization method: ${method}.`);
    }

    const polygon = section.getConcreteOutlinePoints();

    if (polygon.length < 3) {
      throw new Error("SectionFiberDiscretizer requires at least three outline points.");
    }

    const bounds = section.getBoundingBox();
    const spanY = bounds.maxY - bounds.minY;
    const spanZ = bounds.maxZ - bounds.minZ;
    const aspectRatio = spanY > 0 && spanZ > 0 ? spanY / spanZ : 1;
    const rows = Math.max(1, Math.round(Math.sqrt(targetCount * aspectRatio)));
    const cols = Math.max(1, Math.round(targetCount / rows));
    const fiberHeight = spanY / rows;
    const fiberWidth = spanZ / cols;
    const fibers = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const y = bounds.minY + (row + 0.5) * fiberHeight;
        const z = bounds.minZ + (col + 0.5) * fiberWidth;

        if (!isPointInsidePolygon({ y, z }, polygon)) {
          continue;
        }

        fibers.push({
          id: `concrete-fiber-${row + 1}-${col + 1}`,
          area: fiberHeight * fiberWidth,
          y,
          z,
          height: fiberHeight,
          width: fiberWidth,
          materialRole: "concrete",
        });
      }
    }

    return {
      method,
      targetCount,
      generatedCount: fibers.length,
      grid: {
        rows,
        cols,
        fiberHeight,
        fiberWidth,
      },
      bounds,
      fibers,
    };
  }
}
