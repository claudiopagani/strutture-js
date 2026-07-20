import { CircularSlipSurface2D } from "./CircularSlipSurface2D.js";
import { GeotechnicalDesignSituation } from "./GeotechnicalDesignSituation.js";
import { GroundModel } from "./GroundModel.js";
import { SlopeSurfaceSurcharge2D } from "./SlopeSurfaceSurcharge2D.js";

const GAUSS_POINTS = Object.freeze([
  [-0.906179845938664, 0.2369268850561891],
  [-0.5384693101056831, 0.4786286704993665],
  [0, 0.5688888888888889],
  [0.5384693101056831, 0.4786286704993665],
  [0.906179845938664, 0.2369268850561891],
]);

export const SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION =
  "slope-slice-discretization-2d/v1";

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function deduplicate(values, tolerance) {
  return [...values]
    .sort((left, right) => left - right)
    .filter((value, index, sorted) =>
      index === 0 || value - sorted[index - 1] > tolerance);
}

function interpolateSegment(start, end, x) {
  return start.z + (x - start.x) * (end.z - start.z) /
    (end.x - start.x);
}

function verticalIntervalsInPolygon(polygon, x, tolerance) {
  const elevations = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (Math.abs(end.x - start.x) <= tolerance) continue;
    const crosses = (start.x <= x && x < end.x) ||
      (end.x <= x && x < start.x);
    if (crosses) elevations.push(interpolateSegment(start, end, x));
  }
  elevations.sort((left, right) => left - right);
  if (elevations.length % 2 !== 0) {
    throw new Error("Material-zone scanline produced an odd intersection count.");
  }
  const intervals = [];
  for (let index = 0; index < elevations.length; index += 2) {
    intervals.push({ minimumZ: elevations[index], maximumZ: elevations[index + 1] });
  }
  return intervals;
}

function clippedZoneIntervals(section, x, minimumZ, maximumZ, tolerance) {
  const intervals = [];
  for (const zone of section.zones) {
    if (
      x <= zone.bounds.minimumX + tolerance ||
      x >= zone.bounds.maximumX - tolerance ||
      maximumZ <= zone.bounds.minimumZ + tolerance ||
      minimumZ >= zone.bounds.maximumZ - tolerance
    ) {
      continue;
    }
    for (const interval of verticalIntervalsInPolygon(
      zone.polygon,
      x,
      tolerance,
    )) {
      const lower = Math.max(minimumZ, interval.minimumZ);
      const upper = Math.min(maximumZ, interval.maximumZ);
      if (upper > lower + tolerance) {
        intervals.push({
          minimumZ: lower,
          maximumZ: upper,
          zone,
        });
      }
    }
  }
  return intervals.sort((left, right) => left.minimumZ - right.minimumZ);
}

function weightedVerticalSegment(unitWeight, minimumZ, maximumZ) {
  return {
    lineWeight: unitWeight * (maximumZ - minimumZ),
    firstMomentZ:
      0.5 * unitWeight * (maximumZ ** 2 - minimumZ ** 2),
  };
}

function unitWeightIntegral(material, field, x, minimumZ, maximumZ) {
  const bulk = material.unitWeight.bulk;
  if (
    !field ||
    !["hydrostatic-horizontal", "phreatic-line"].includes(field.model)
  ) {
    return weightedVerticalSegment(bulk, minimumZ, maximumZ);
  }
  const waterElevation = field.waterElevationAt(x);
  const saturated = material.unitWeight.saturated ?? bulk;
  const split = Math.max(minimumZ, Math.min(maximumZ, waterElevation));
  const lower = weightedVerticalSegment(saturated, minimumZ, split);
  const upper = weightedVerticalSegment(bulk, split, maximumZ);
  return {
    lineWeight: lower.lineWeight + upper.lineWeight,
    firstMomentZ: lower.firstMomentZ + upper.firstMomentZ,
  };
}

function integrateSliceMass({
  section,
  field,
  groundModel,
  slipSurface,
  minimumX,
  maximumX,
  tolerance,
}) {
  const midpoint = (minimumX + maximumX) / 2;
  const halfWidth = (maximumX - minimumX) / 2;
  let area = 0;
  let weight = 0;
  let firstMomentX = 0;
  let firstMomentZ = 0;
  const weightByMaterial = new Map();

  for (const [coordinate, gaussWeight] of GAUSS_POINTS) {
    const x = midpoint + halfWidth * coordinate;
    const bottom = slipSurface.lowerElevationAt(x);
    const top = section.surfaceElevationAt(x);
    const height = top - bottom;
    if (height <= tolerance) {
      throw new Error("A slope slice has non-positive height inside the sliding mass.");
    }
    const intervals = clippedZoneIntervals(
      section,
      x,
      bottom,
      top,
      tolerance,
    );
    const coveredHeight = intervals.reduce(
      (sum, interval) => sum + interval.maximumZ - interval.minimumZ,
      0,
    );
    if (Math.abs(coveredHeight - height) > 1e-7 * Math.max(1, height)) {
      throw new Error(
        `GroundSection2D contains an unassigned gap inside the sliding mass at x=${x}.`,
      );
    }

    area += gaussWeight * height * halfWidth;
    for (const interval of intervals) {
      const material = groundModel.getMaterial(interval.zone.materialId);
      const weightedLine = unitWeightIntegral(
        material,
        field,
        x,
        interval.minimumZ,
        interval.maximumZ,
      );
      const contribution =
        gaussWeight * weightedLine.lineWeight * halfWidth;
      weight += contribution;
      firstMomentX += x * contribution;
      firstMomentZ +=
        gaussWeight * weightedLine.firstMomentZ * halfWidth;
      weightByMaterial.set(
        material.id,
        (weightByMaterial.get(material.id) ?? 0) + contribution,
      );
    }
  }

  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error("A slope slice has non-positive integrated self-weight.");
  }
  return {
    area,
    weight,
    weightCentroid: {
      x: firstMomentX / weight,
      z: firstMomentZ / weight,
    },
    weightByMaterial: Object.fromEntries(weightByMaterial),
  };
}

function resolveSpan(section, slipSurface, tolerance) {
  const intersections = slipSurface.intersectionsWithPolyline(
    section.surface.points,
  );
  let entryX;
  let exitX;
  if (slipSurface.entryX != null) {
    entryX = slipSurface.entryX;
    exitX = slipSurface.exitX;
    for (const target of [entryX, exitX]) {
      if (!intersections.some(({ x }) => Math.abs(x - target) <= tolerance)) {
        throw new Error(
          `Circular slip-surface endpoint x=${target} does not lie on the ground surface.`,
        );
      }
    }
  } else {
    if (intersections.length !== 2) {
      throw new Error(
        `A circular slip surface requires exactly two ground-surface intersections; found ${intersections.length}.`,
      );
    }
    [entryX, exitX] = intersections.map(({ x }) => x);
  }
  if (
    entryX < section.bounds.minimumX - tolerance ||
    exitX > section.bounds.maximumX + tolerance ||
    exitX - entryX <= tolerance
  ) {
    throw new Error("Circular slip-surface endpoints lie outside the section domain.");
  }
  const internalIntersection = intersections.find(({ x }) =>
    x > entryX + tolerance && x < exitX - tolerance);
  if (internalIntersection) {
    throw new Error(
      "The circular slip surface intersects the ground surface inside the selected sliding mass.",
    );
  }

  const checkpoints = [entryX, exitX];
  for (const surfacePoint of section.surface.points) {
    if (surfacePoint.x > entryX && surfacePoint.x < exitX) {
      checkpoints.push(surfacePoint.x);
    }
  }
  const ordered = deduplicate(checkpoints, tolerance);
  for (let index = 0; index < ordered.length; index += 1) {
    const x = ordered[index];
    const height = section.surfaceElevationAt(x) - slipSurface.lowerElevationAt(x);
    const endpoint = index === 0 || index === ordered.length - 1;
    if (height < -tolerance || (!endpoint && height <= tolerance)) {
      throw new Error("The circular arc does not remain strictly below the ground surface.");
    }
    if (index < ordered.length - 1) {
      const middle = (x + ordered[index + 1]) / 2;
      if (
        section.surfaceElevationAt(middle) -
          slipSurface.lowerElevationAt(middle) <= tolerance
      ) {
        throw new Error("The circular arc does not define a positive sliding mass.");
      }
    }
  }
  return { entryX, exitX, intersections };
}

function assertNoExternalWater(field, section, entryX, exitX, tolerance) {
  if (!field || !["hydrostatic-horizontal", "phreatic-line"].includes(field.model)) {
    return;
  }
  const checkpoints = [entryX, exitX];
  for (const point of section.surface.points) {
    if (point.x > entryX && point.x < exitX) checkpoints.push(point.x);
  }
  const ordered = deduplicate(checkpoints, tolerance);
  for (let index = 0; index < ordered.length; index += 1) {
    const x = ordered[index];
    if (field.waterElevationAt(x) > section.surfaceElevationAt(x) + tolerance) {
      throw new Error(
        "External water above the ground surface is not implemented in the first slope-stability model.",
      );
    }
    if (index < ordered.length - 1) {
      const middle = (x + ordered[index + 1]) / 2;
      if (
        field.waterElevationAt(middle) >
        section.surfaceElevationAt(middle) + tolerance
      ) {
        throw new Error(
          "External water above the ground surface is not implemented in the first slope-stability model.",
        );
      }
    }
  }
}

function materialBoundaryIntersections(section, slipSurface, entryX, exitX) {
  const values = [];
  for (const zone of section.zones) {
    for (let index = 0; index < zone.polygon.length; index += 1) {
      const start = zone.polygon[index];
      const end = zone.polygon[(index + 1) % zone.polygon.length];
      for (const intersection of slipSurface.intersectionsWithSegment(start, end)) {
        if (intersection.x > entryX && intersection.x < exitX) {
          values.push(intersection.x);
        }
      }
    }
  }
  return values;
}

function resolveBaseZone(section, x, bottom, top, tolerance) {
  const height = top - bottom;
  const scale = Math.max(1, section.bounds.maximumX - section.bounds.minimumX);
  const offsets = [
    Math.min(height * 0.1, scale * 1e-8),
    Math.min(height * 0.25, scale * 1e-6),
    height * 0.5,
  ].filter((offset) => offset > tolerance);
  for (const offset of offsets) {
    const matches = section.getZonesAtPoint(
      { x, z: bottom + offset },
      { includeBoundary: false },
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new Error("The slip surface lies on an ambiguous material-zone boundary.");
    }
  }
  throw new Error("No material zone is assigned immediately above the slip surface.");
}

export class SlopeSliceDiscretizer2D {
  discretize({
    groundModel,
    designSituation,
    slipSurface,
    sectionId = null,
    porePressureFieldId = null,
    sliceCount = 30,
    surfaceSurcharges = [],
  } = {}) {
    if (!(groundModel instanceof GroundModel)) {
      throw new Error("SlopeSliceDiscretizer2D requires a GroundModel.");
    }
    if (!(designSituation instanceof GeotechnicalDesignSituation)) {
      throw new Error(
        "SlopeSliceDiscretizer2D requires a GeotechnicalDesignSituation.",
      );
    }
    if (!(slipSurface instanceof CircularSlipSurface2D)) {
      throw new Error("SlopeSliceDiscretizer2D requires a CircularSlipSurface2D.");
    }
    if (!Number.isInteger(sliceCount) || sliceCount < 4 || sliceCount > 500) {
      throw new Error("sliceCount must be an integer from 4 to 500.");
    }
    if (!surfaceSurcharges.every((load) => load instanceof SlopeSurfaceSurcharge2D)) {
      throw new Error("surfaceSurcharges must contain SlopeSurfaceSurcharge2D objects.");
    }
    designSituation.validateAgainst(groundModel);
    const resolvedSectionId = sectionId ?? designSituation.spatialSelection.sectionId;
    const resolvedFieldId = porePressureFieldId ??
      designSituation.spatialSelection.porePressureFieldId;
    const section = groundModel.getSection(resolvedSectionId);
    if (!section) throw new Error("Slope stability requires a GroundSection2D.");
    const situationSection = designSituation.spatialSelection.sectionId ??
      groundModel.defaultSectionId;
    if (situationSection !== section.id) {
      throw new Error(
        "The analysis section must match the GeotechnicalDesignSituation section selection.",
      );
    }
    const field = groundModel.getPorePressureField(resolvedFieldId);
    const scale = Math.max(
      1,
      section.bounds.maximumX - section.bounds.minimumX,
      slipSurface.radius,
    );
    const tolerance = 1e-10 * scale;
    const span = resolveSpan(section, slipSurface, tolerance);
    assertNoExternalWater(
      field,
      section,
      span.entryX,
      span.exitX,
      tolerance,
    );

    const boundaries = [];
    for (let index = 0; index <= sliceCount; index += 1) {
      boundaries.push(
        span.entryX + (span.exitX - span.entryX) * index / sliceCount,
      );
    }
    for (const pointValue of section.surface.points) {
      if (pointValue.x > span.entryX && pointValue.x < span.exitX) {
        boundaries.push(pointValue.x);
      }
    }
    for (const zone of section.zones) {
      for (const pointValue of zone.polygon) {
        if (pointValue.x > span.entryX && pointValue.x < span.exitX) {
          boundaries.push(pointValue.x);
        }
      }
    }
    for (const load of surfaceSurcharges) {
      for (const breakpoint of [load.minimumX, load.maximumX]) {
        if (breakpoint > span.entryX && breakpoint < span.exitX) {
          boundaries.push(breakpoint);
        }
      }
    }
    boundaries.push(...materialBoundaryIntersections(
      section,
      slipSurface,
      span.entryX,
      span.exitX,
    ));
    const orderedBoundaries = deduplicate(boundaries, tolerance);
    const slices = [];
    const warnings = new Set();
    const parameterSets = new Map();
    const seismic = designSituation.seismic;
    const pseudostatic = seismic.model === "pseudostatic";
    const supportedVerticalConvention =
      "positive-kv-reduces-effective-gravity-through-factor-1-minus-kv";
    if (
      pseudostatic &&
      seismic.verticalConvention !== supportedVerticalConvention
    ) {
      throw new Error(
        `Unsupported pseudostatic vertical convention: ${seismic.verticalConvention}.`,
      );
    }
    const gravityFactor = pseudostatic ? 1 - seismic.kv : 1;
    const movementSign = slipSurface.movementDirection === "left-to-right"
      ? 1
      : -1;

    for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
      const minimumX = orderedBoundaries[index];
      const maximumX = orderedBoundaries[index + 1];
      const width = maximumX - minimumX;
      if (width <= tolerance) continue;
      const x = (minimumX + maximumX) / 2;
      const base = {
        left: slipSurface.lowerElevationAt(minimumX),
        middle: slipSurface.lowerElevationAt(x),
        right: slipSurface.lowerElevationAt(maximumX),
      };
      const surface = {
        left: section.surfaceElevationAt(minimumX),
        middle: section.surfaceElevationAt(x),
        right: section.surfaceElevationAt(maximumX),
      };
      const mass = integrateSliceMass({
        section,
        field,
        groundModel,
        slipSurface,
        minimumX,
        maximumX,
        tolerance,
      });
      const surfaceLoad = surfaceSurcharges.reduce(
        (sum, load) => sum + load.forcePerUnitWidthBetween(minimumX, maximumX),
        0,
      );
      const verticalSelfWeight = gravityFactor * mass.weight;
      const horizontalSeismicLoad = pseudostatic
        ? seismic.kh * mass.weight
        : 0;
      const totalVerticalLoad = verticalSelfWeight + surfaceLoad;
      const mathematicalInclination = Math.atan2(base.right - base.left, width);
      const baseInclination = slipSurface.movementDirection === "left-to-right"
        ? -mathematicalInclination
        : mathematicalInclination;
      const baseLength = Math.hypot(width, base.right - base.left);
      const baseChordMidpoint = {
        x,
        z: (base.left + base.right) / 2,
      };
      const baseMomentArm = Math.hypot(
        baseChordMidpoint.x - slipSurface.center.x,
        baseChordMidpoint.z - slipSurface.center.z,
      );
      const drivingMoment =
        movementSign * (slipSurface.center.x - mass.weightCentroid.x) *
          verticalSelfWeight +
        movementSign * (slipSurface.center.x - x) * surfaceLoad +
        (slipSurface.center.z - mass.weightCentroid.z) *
          horizontalSeismicLoad;
      const zone = resolveBaseZone(
        section,
        x,
        base.middle,
        surface.middle,
        tolerance,
      );
      const resolution = designSituation.resolveParameterSet({
        groundModel,
        materialId: zone.materialId,
        zoneId: zone.id,
      });
      const parameterSet = resolution.parameterSet;
      const strength = parameterSet.strength;
      let stressBasis;
      let cohesion;
      let frictionAngle;
      let porePressure;
      if (strength.model === "mohr-coulomb-effective") {
        stressBasis = "effective";
        cohesion = strength.cohesion;
        frictionAngle = strength.frictionAngle;
        porePressure = field?.porePressureAt({ x, z: base.middle }) ?? 0;
        if (porePressure < -tolerance) {
          throw new Error(
            "Negative pore pressure and suction strength are outside the first slope-stability model.",
          );
        }
      } else if (strength.model === "total-stress-undrained") {
        stressBasis = "total";
        cohesion = strength.undrainedShearStrength;
        frictionAngle = 0;
        porePressure = 0;
      } else {
        throw new Error(`Unsupported slope strength model: ${strength.model}.`);
      }
      if (parameterSet.basis === "indicative") {
        warnings.add(
          `Indicative parameter set ${parameterSet.id} was explicitly authorized.`,
        );
      }
      if (Object.keys(parameterSet.provenance ?? {}).length === 0) {
        warnings.add(
          `Parameter set ${parameterSet.id} for zone ${zone.id} has no provenance metadata.`,
        );
      }
      parameterSets.set(`${zone.id}:${parameterSet.id}`, {
        zoneId: zone.id,
        materialId: zone.materialId,
        parameterSetId: parameterSet.id,
        basis: parameterSet.basis,
        drainage: parameterSet.drainage,
        stressBasis,
        selectionSource: resolution.selectionSource,
      });

      slices.push({
        id: `slice-${slices.length + 1}`,
        minimumX,
        maximumX,
        midpointX: x,
        width,
        area: mass.area,
        baseLength,
        baseInclination,
        baseElevations: base,
        surfaceElevations: surface,
        selfWeight: mass.weight,
        selfWeightCentroid: mass.weightCentroid,
        weightByMaterial: mass.weightByMaterial,
        surfaceLoad,
        verticalSelfWeight,
        horizontalSeismicLoad,
        totalVerticalLoad,
        baseMomentArm,
        drivingMoment,
        zoneId: zone.id,
        materialId: zone.materialId,
        parameterSetId: parameterSet.id,
        selectionSource: resolution.selectionSource,
        stressBasis,
        cohesion,
        frictionAngle,
        porePressure,
      });
    }
    if (slices.length < 2) {
      throw new Error("Slip-surface discretization produced fewer than two slices.");
    }

    return {
      schemaVersion: SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION,
      sectionId: section.id,
      porePressureFieldId: field?.id ?? null,
      slipSurfaceId: slipSurface.id,
      movementDirection: slipSurface.movementDirection,
      span: {
        entryX: span.entryX,
        entryElevation: section.surfaceElevationAt(span.entryX),
        exitX: span.exitX,
        exitElevation: section.surfaceElevationAt(span.exitX),
      },
      requestedSliceCount: sliceCount,
      actualSliceCount: slices.length,
      slices,
      parameterSets: [...parameterSets.values()],
      warnings: [...warnings],
      metadata: {
        areaIntegration: "five-point-gauss-legendre-per-slice",
        baseGeometry: "straight-chord-between-slice-boundaries",
        strengthSampling: "material-immediately-above-base-midpoint",
        saturatedWeightSelection:
          "saturated-below-hydrostatic-or-phreatic-line-when-available",
        seismicLoading: pseudostatic
          ? {
              model: "pseudostatic",
              kh: seismic.kh,
              kv: seismic.kv,
              gravityFactor,
              horizontalInertia:
                "kh-times-self-weight-in-the-selected-movement-direction",
              verticalInertia:
                "self-weight-times-one-minus-kv",
              surfaceLoadInertia: "not-included",
            }
          : { model: "none", gravityFactor: 1 },
      },
    };
  }
}
