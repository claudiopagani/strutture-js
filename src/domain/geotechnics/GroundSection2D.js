import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";
import { GroundProfile } from "./GroundProfile.js";
import { GEOTECHNICAL_INTERNAL_UNITS } from "./SoilMaterial.js";

export const GROUND_SECTION_2D_SCHEMA_VERSION = "ground-section-2d/v1";

const BASE_TOLERANCE = 1e-10;

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function samePoint(left, right, tolerance) {
  return Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.z - right.z) <= tolerance;
}

function normalizePoint(point, resolver, label) {
  return {
    x: resolver.length(finite(point?.x, `${label}.x`)),
    z: resolver.length(finite(point?.z, `${label}.z`)),
  };
}

function signedPolygonArea(points) {
  let doubledArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    doubledArea += current.x * next.z - next.x * current.z;
  }
  return doubledArea / 2;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) -
    (b.z - a.z) * (c.x - a.x);
}

function pointOnSegment(point, start, end, tolerance) {
  if (Math.abs(orientation(start, end, point)) > tolerance) return false;
  return point.x >= Math.min(start.x, end.x) - tolerance &&
    point.x <= Math.max(start.x, end.x) + tolerance &&
    point.z >= Math.min(start.z, end.z) - tolerance &&
    point.z <= Math.max(start.z, end.z) + tolerance;
}

function segmentsIntersect(startA, endA, startB, endB, tolerance) {
  const values = [
    orientation(startA, endA, startB),
    orientation(startA, endA, endB),
    orientation(startB, endB, startA),
    orientation(startB, endB, endA),
  ];
  const signs = values.map((value) =>
    Math.abs(value) <= tolerance ? 0 : Math.sign(value));

  if (signs[0] * signs[1] < 0 && signs[2] * signs[3] < 0) {
    return "crossing";
  }
  if (
    (signs[0] === 0 && pointOnSegment(startB, startA, endA, tolerance)) ||
    (signs[1] === 0 && pointOnSegment(endB, startA, endA, tolerance)) ||
    (signs[2] === 0 && pointOnSegment(startA, startB, endB, tolerance)) ||
    (signs[3] === 0 && pointOnSegment(endA, startB, endB, tolerance))
  ) {
    return "touching";
  }
  return "none";
}

function collinearOverlapWithSameInteriorSide(
  startA,
  endA,
  startB,
  endB,
  tolerance,
) {
  if (
    Math.abs(orientation(startA, endA, startB)) > tolerance ||
    Math.abs(orientation(startA, endA, endB)) > tolerance
  ) {
    return false;
  }
  const directionA = { x: endA.x - startA.x, z: endA.z - startA.z };
  const directionB = { x: endB.x - startB.x, z: endB.z - startB.z };
  const useX = Math.abs(directionA.x) >= Math.abs(directionA.z);
  const leftMinimum = Math.min(
    useX ? startA.x : startA.z,
    useX ? endA.x : endA.z,
  );
  const leftMaximum = Math.max(
    useX ? startA.x : startA.z,
    useX ? endA.x : endA.z,
  );
  const rightMinimum = Math.min(
    useX ? startB.x : startB.z,
    useX ? endB.x : endB.z,
  );
  const rightMaximum = Math.max(
    useX ? startB.x : startB.z,
    useX ? endB.x : endB.z,
  );
  const overlap = Math.min(leftMaximum, rightMaximum) -
    Math.max(leftMinimum, rightMinimum);
  if (overlap <= tolerance) return false;

  return directionA.x * directionB.x + directionA.z * directionB.z > 0;
}

function pointLocationInPolygon(point, polygon, tolerance) {
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (pointOnSegment(point, current, next, tolerance)) return "boundary";

    const crossesRay = (current.z > point.z) !== (next.z > point.z);
    if (!crossesRay) continue;
    const intersectionX = current.x +
      (point.z - current.z) * (next.x - current.x) /
      (next.z - current.z);
    if (intersectionX > point.x + tolerance) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

function assertSimplePolygon(points, label, tolerance) {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      const adjacent = first === second || firstNext === second ||
        secondNext === first;
      if (adjacent) continue;
      const intersection = segmentsIntersect(
        points[first],
        points[firstNext],
        points[second],
        points[secondNext],
        tolerance,
      );
      if (intersection !== "none") {
        throw new Error(`${label} must be a simple non-self-intersecting polygon.`);
      }
    }
  }
}

function normalizePolygon(points, resolver, label, tolerance) {
  if (!Array.isArray(points) || points.length < 3) {
    throw new Error(`${label} requires at least three points.`);
  }
  const normalized = points.map((point, index) =>
    normalizePoint(point, resolver, `${label}[${index}]`));
  if (
    normalized.length > 3 &&
    samePoint(normalized[0], normalized.at(-1), tolerance)
  ) {
    normalized.pop();
  }
  if (normalized.length < 3) {
    throw new Error(`${label} requires at least three distinct points.`);
  }
  for (let index = 0; index < normalized.length; index += 1) {
    const next = normalized[(index + 1) % normalized.length];
    if (samePoint(normalized[index], next, tolerance)) {
      throw new Error(`${label} contains consecutive duplicate points.`);
    }
  }

  assertSimplePolygon(normalized, label, tolerance);
  const area = signedPolygonArea(normalized);
  if (Math.abs(area) <= tolerance ** 2) {
    throw new Error(`${label} must have positive area.`);
  }
  return area > 0 ? normalized : normalized.reverse();
}

function polygonBounds(polygon) {
  return {
    minimumX: Math.min(...polygon.map(({ x }) => x)),
    maximumX: Math.max(...polygon.map(({ x }) => x)),
    minimumZ: Math.min(...polygon.map(({ z }) => z)),
    maximumZ: Math.max(...polygon.map(({ z }) => z)),
  };
}

function polygonsHaveInteriorOverlap(left, right, tolerance) {
  for (let first = 0; first < left.length; first += 1) {
    for (let second = 0; second < right.length; second += 1) {
      const firstNext = (first + 1) % left.length;
      const secondNext = (second + 1) % right.length;
      const intersection = segmentsIntersect(
        left[first],
        left[firstNext],
        right[second],
        right[secondNext],
        tolerance,
      );
      if (intersection === "crossing") return true;
      if (
        intersection === "touching" &&
        collinearOverlapWithSameInteriorSide(
          left[first],
          left[firstNext],
          right[second],
          right[secondNext],
          tolerance,
        )
      ) {
        return true;
      }
    }
  }

  if (left.some((point) =>
    pointLocationInPolygon(point, right, tolerance) === "inside")) return true;
  if (right.some((point) =>
    pointLocationInPolygon(point, left, tolerance) === "inside")) return true;

  const leftOnRight = left.every((point) =>
    pointLocationInPolygon(point, right, tolerance) === "boundary");
  const rightOnLeft = right.every((point) =>
    pointLocationInPolygon(point, left, tolerance) === "boundary");
  return leftOnRight && rightOnLeft;
}

function assertPolygonBelowSurface(polygon, surfacePoints, zoneId, tolerance) {
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const minimumX = Math.min(start.x, end.x);
    const maximumX = Math.max(start.x, end.x);
    if (maximumX - minimumX <= tolerance) continue;

    for (const surfacePoint of surfacePoints) {
      if (
        surfacePoint.x <= minimumX + tolerance ||
        surfacePoint.x >= maximumX - tolerance
      ) {
        continue;
      }
      const ratio = (surfacePoint.x - start.x) / (end.x - start.x);
      const edgeElevation = start.z + ratio * (end.z - start.z);
      if (edgeElevation > surfacePoint.z + tolerance) {
        throw new Error(
          `GroundSection2D zone ${zoneId} extends above the ground surface between its vertices.`,
        );
      }
    }
  }
}

function normalizeSurface(surface, resolver, tolerance) {
  if (!Array.isArray(surface?.points) || surface.points.length < 2) {
    throw new Error("GroundSection2D surface.points requires at least two points.");
  }
  const points = surface.points.map((point, index) =>
    normalizePoint(point, resolver, `surface.points[${index}]`));
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].x <= points[index - 1].x + tolerance) {
      throw new Error("GroundSection2D surface x coordinates must be strictly increasing.");
    }
  }
  return {
    points,
    metadata: structuredClone(surface.metadata ?? {}),
  };
}

function interpolatePolyline(points, x, tolerance) {
  if (x < points[0].x - tolerance || x > points.at(-1).x + tolerance) {
    throw new Error(`x=${x} lies outside the GroundSection2D surface domain.`);
  }
  if (Math.abs(x - points[0].x) <= tolerance) return points[0].z;
  if (Math.abs(x - points.at(-1).x) <= tolerance) return points.at(-1).z;

  const segment = points.findIndex((point, index) =>
    index < points.length - 1 &&
    x >= point.x - tolerance && x <= points[index + 1].x + tolerance);
  const left = points[segment];
  const right = points[segment + 1];
  const ratio = (x - left.x) / (right.x - left.x);
  return left.z + ratio * (right.z - left.z);
}

export class GroundSection2D {
  constructor({
    id,
    name = null,
    surface,
    zones = [],
    units = null,
    metadata = {},
  } = {}) {
    if (!id) throw new Error("A GroundSection2D id is required.");
    assertExplicitUnitSystem(units, "GroundSection2D");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const normalizedSurface = normalizeSurface(surface, resolver, BASE_TOLERANCE);
    if (!Array.isArray(zones) || zones.length === 0) {
      throw new Error("GroundSection2D requires at least one material zone.");
    }

    const normalizedZones = zones.map((zone, index) => {
      if (!zone?.id) throw new Error(`zones[${index}].id is required.`);
      if (!zone.materialId) {
        throw new Error(`zones[${index}].materialId is required.`);
      }
      const polygon = normalizePolygon(
        zone.polygon,
        resolver,
        `zones[${index}].polygon`,
        BASE_TOLERANCE,
      );
      return {
        id: zone.id,
        materialId: zone.materialId,
        polygon,
        bounds: polygonBounds(polygon),
        metadata: structuredClone(zone.metadata ?? {}),
      };
    });
    const ids = normalizedZones.map(({ id: zoneId }) => zoneId);
    if (new Set(ids).size !== ids.length) {
      throw new Error("GroundSection2D zone ids must be unique.");
    }

    const minimumX = normalizedSurface.points[0].x;
    const maximumX = normalizedSurface.points.at(-1).x;
    for (const zone of normalizedZones) {
      if (
        zone.bounds.minimumX < minimumX - BASE_TOLERANCE ||
        zone.bounds.maximumX > maximumX + BASE_TOLERANCE
      ) {
        throw new Error(`GroundSection2D zone ${zone.id} lies outside the surface x domain.`);
      }
      for (const point of zone.polygon) {
        const surfaceElevation = interpolatePolyline(
          normalizedSurface.points,
          point.x,
          BASE_TOLERANCE,
        );
        if (point.z > surfaceElevation + BASE_TOLERANCE) {
          throw new Error(`GroundSection2D zone ${zone.id} extends above the ground surface.`);
        }
      }
      assertPolygonBelowSurface(
        zone.polygon,
        normalizedSurface.points,
        zone.id,
        BASE_TOLERANCE,
      );
    }
    for (let left = 0; left < normalizedZones.length; left += 1) {
      for (let right = left + 1; right < normalizedZones.length; right += 1) {
        if (polygonsHaveInteriorOverlap(
          normalizedZones[left].polygon,
          normalizedZones[right].polygon,
          BASE_TOLERANCE,
        )) {
          throw new Error(
            `GroundSection2D zones ${normalizedZones[left].id} and ${normalizedZones[right].id} overlap internally.`,
          );
        }
      }
    }

    this.schemaVersion = GROUND_SECTION_2D_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.coordinateSystem = {
      horizontalAxis: "x",
      horizontalPositiveDirection: "right",
      verticalAxis: "z",
      verticalPositiveDirection: "up",
      datum: metadata.datum ?? null,
    };
    this.surface = normalizedSurface;
    this.zones = normalizedZones;
    this.bounds = {
      minimumX,
      maximumX,
      minimumZ: Math.min(...normalizedZones.map(({ bounds }) => bounds.minimumZ)),
      maximumZ: Math.max(...normalizedSurface.points.map(({ z }) => z)),
    };
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata ?? {}),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  static fromGroundProfile({
    profile,
    id = null,
    name = null,
    minimumX = 0,
    maximumX = 1,
    metadata = {},
  } = {}) {
    if (!(profile instanceof GroundProfile)) {
      throw new Error("GroundSection2D.fromGroundProfile requires a GroundProfile.");
    }
    const left = finite(minimumX, "minimumX");
    const right = finite(maximumX, "maximumX");
    if (right <= left) throw new Error("maximumX must be greater than minimumX.");

    return new GroundSection2D({
      id: id ?? `${profile.id}-section-2d`,
      name: name ?? `${profile.name} section`,
      surface: {
        points: [
          { x: left, z: profile.groundSurfaceElevation },
          { x: right, z: profile.groundSurfaceElevation },
        ],
      },
      zones: profile.layers.map((layer) => ({
        id: layer.id,
        materialId: layer.materialId,
        polygon: [
          { x: left, z: layer.bottomElevation },
          { x: right, z: layer.bottomElevation },
          { x: right, z: layer.topElevation },
          { x: left, z: layer.topElevation },
        ],
        metadata: {
          ...structuredClone(layer.metadata ?? {}),
          sourceLayerId: layer.id,
        },
      })),
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        ...structuredClone(metadata ?? {}),
        sourceProfileId: profile.id,
        conversion: "horizontal-extrusion-of-ground-profile",
      },
    });
  }

  surfaceElevationAt(x) {
    return interpolatePolyline(
      this.surface.points,
      finite(x, "x"),
      BASE_TOLERANCE,
    );
  }

  getZonesAtPoint({ x, z } = {}, { includeBoundary = true } = {}) {
    const point = { x: finite(x, "point.x"), z: finite(z, "point.z") };
    return this.zones.filter((zone) => {
      if (
        point.x < zone.bounds.minimumX - BASE_TOLERANCE ||
        point.x > zone.bounds.maximumX + BASE_TOLERANCE ||
        point.z < zone.bounds.minimumZ - BASE_TOLERANCE ||
        point.z > zone.bounds.maximumZ + BASE_TOLERANCE
      ) {
        return false;
      }
      const location = pointLocationInPolygon(
        point,
        zone.polygon,
        BASE_TOLERANCE,
      );
      return location === "inside" || (includeBoundary && location === "boundary");
    }).map((zone) => structuredClone(zone));
  }

  getZoneAtPoint(point, options = {}) {
    const matches = this.getZonesAtPoint(point, options);
    if (matches.length === 0) return null;
    if (matches.length > 1 && options.requireUnique !== false) {
      throw new Error(
        `Point belongs to multiple GroundSection2D zone boundaries: ${matches.map(({ id }) => id).join(", ")}.`,
      );
    }
    return matches[0];
  }

  getMaterialIdAtPoint(point, options = {}) {
    return this.getZoneAtPoint(point, options)?.materialId ?? null;
  }

  isBelowGroundSurface({ x, z } = {}) {
    return finite(z, "point.z") <= this.surfaceElevationAt(x) + BASE_TOLERANCE;
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      coordinateSystem: structuredClone(this.coordinateSystem),
      surface: structuredClone(this.surface),
      zones: this.zones.map(({ bounds, ...zone }) => structuredClone(zone)),
      bounds: { ...this.bounds },
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
