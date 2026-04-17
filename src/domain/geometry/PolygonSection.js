import { CrossSection } from "./CrossSection.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  convertPointCoordinates,
} from "../units/UnitSystem.js";
import { calculateSectionMassProperties } from "./SectionMassProperties.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

function assertPoint(point, index) {
  if (
    !point ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(point.z)
  ) {
    throw new Error(`Invalid polygon point at index ${index}.`);
  }
}

export class PolygonSection extends CrossSection {
  constructor({
    points,
    id = null,
    name = "Polygon section",
    units = null,
    metadata = {},
  }) {
    if (!Array.isArray(points) || points.length < 3) {
      throw new Error("A polygon section requires at least three points.");
    }

    assertExplicitUnitSystem(units, "PolygonSection");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedPoints = points.map((point) =>
      convertPointCoordinates(point, unitResolver, ["y", "z"]));

    resolvedPoints.forEach(assertPoint);

    let signedDoubleArea = 0;
    let centroidYFactor = 0;
    let centroidZFactor = 0;
    let inertiaYOrigin = 0;
    let inertiaZOrigin = 0;

    for (let index = 0; index < resolvedPoints.length; index += 1) {
      const current = resolvedPoints[index];
      const next = resolvedPoints[(index + 1) % resolvedPoints.length];
      const cross = current.z * next.y - next.z * current.y;

      signedDoubleArea += cross;
      centroidZFactor += (current.z + next.z) * cross;
      centroidYFactor += (current.y + next.y) * cross;
      inertiaYOrigin +=
        (current.y ** 2 + current.y * next.y + next.y ** 2) * cross;
      inertiaZOrigin +=
        (current.z ** 2 + current.z * next.z + next.z ** 2) * cross;
    }

    const signedArea = signedDoubleArea / 2;
    const area = Math.abs(signedArea);

    if (area === 0) {
      throw new Error("Polygon section area must be non-zero.");
    }

    const centroidZ = centroidZFactor / (6 * signedArea);
    const centroidY = centroidYFactor / (6 * signedArea);
    const inertiaY =
      Math.abs(inertiaYOrigin / 12 - signedArea * centroidY ** 2);
    const inertiaZ =
      Math.abs(inertiaZOrigin / 12 - signedArea * centroidZ ** 2);
    const massProperties = calculateSectionMassProperties({
      points: resolvedPoints,
    });
    const ys = resolvedPoints.map((point) => point.y);
    const zs = resolvedPoints.map((point) => point.z);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    super({
      id,
      name,
      area,
      centroidY,
      centroidZ,
      inertiaY,
      inertiaZ,
      productOfInertiaYZ: massProperties.productOfInertiaYZ,
      elasticSectionModulusY:
        inertiaY / Math.max(maxY - centroidY, centroidY - minY),
      elasticSectionModulusZ:
        inertiaZ / Math.max(maxZ - centroidZ, centroidZ - minZ),
      height: maxY - minY,
      width: maxZ - minZ,
      units: INTERNAL_UNITS,
      outlinePoints: resolvedPoints,
      metadata: {
        ...metadata,
        shape: "polygon",
        unitSystem: INTERNAL_UNITS,
      },
    });
  }
}
