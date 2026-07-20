const USACE_LAYERED_WEDGE_REFERENCE =
  "USACE EM 1110-2-2502 (1989), section 3-13c(4)(b), constant-inclination layered wedge approximation";
const FHWA_PSEUDOSTATIC_WEDGE_REFERENCE =
  "FHWA-HRT-05-067 (2006), Part 2, section 6.4.2.1, pseudostatic trial-wedge force polygon";
const CALTRANS_GENERAL_WEDGE_REFERENCE =
  "Caltrans Trenching and Shoring Manual (2025), chapter 4, section 4-5.01, general active trial-wedge equilibrium";

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function clipAtElevation(polygon, elevation, keepAbove) {
  if (polygon.length === 0) return [];
  const output = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = keepAbove
      ? current.z >= elevation
      : current.z <= elevation;
    const previousInside = keepAbove
      ? previous.z >= elevation
      : previous.z <= elevation;

    if (currentInside !== previousInside) {
      const ratio = (elevation - previous.z) / (current.z - previous.z);
      output.push({
        x: previous.x + ratio * (current.x - previous.x),
        z: elevation,
      });
    }
    if (currentInside) output.push(current);
  }

  return output;
}

function clipAtWallNormalCoordinate(
  polygon,
  coordinate,
  keepGreater,
  wallInclination,
  bottomElevation,
) {
  if (polygon.length === 0) return [];
  const output = [];
  const valueAt = ({ x, z }) =>
    x * Math.cos(wallInclination) -
    (z - bottomElevation) * Math.sin(wallInclination);

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentValue = valueAt(current);
    const previousValue = valueAt(previous);
    const currentInside = keepGreater
      ? currentValue >= coordinate
      : currentValue <= coordinate;
    const previousInside = keepGreater
      ? previousValue >= coordinate
      : previousValue <= coordinate;

    if (currentInside !== previousInside) {
      const ratio = (coordinate - previousValue) /
        (currentValue - previousValue);
      output.push({
        x: previous.x + ratio * (current.x - previous.x),
        z: previous.z + ratio * (current.z - previous.z),
      });
    }
    if (currentInside) output.push(current);
  }

  return output;
}

function polygonArea(polygon) {
  if (polygon.length < 3) return 0;
  let doubledArea = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    doubledArea += current.x * next.z - next.x * current.z;
  }

  return Math.abs(doubledArea) / 2;
}

function areaInsideHorizontalBand(polygon, bottomElevation, topElevation) {
  let clipped = clipAtElevation(polygon, bottomElevation, true);
  if (Number.isFinite(topElevation)) {
    clipped = clipAtElevation(clipped, topElevation, false);
  }
  return polygonArea(clipped);
}

function layerAtExtendedElevation(profile, elevation) {
  if (elevation >= profile.groundSurfaceElevation) return profile.layers[0];
  return profile.getLayerAtElevation(elevation);
}

function layerWeightContributions(profile, polygon) {
  return profile.layers.map((layer, index) => {
    const material = profile.getMaterial(layer.materialId);
    const topElevation = index === 0 ? Number.POSITIVE_INFINITY : layer.topElevation;
    const area = areaInsideHorizontalBand(
      polygon,
      layer.bottomElevation,
      topElevation,
    );

    return {
      layerId: layer.id,
      materialId: material.id,
      area,
      unitWeight: material.unitWeight.bulk,
      weight: area * material.unitWeight.bulk,
    };
  }).filter(({ area }) => area > 1e-14);
}

function uniqueSorted(values, tolerance = 1e-12) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.filter((value, index) =>
    index === 0 || Math.abs(value - sorted[index - 1]) > tolerance);
}

export function evaluateLayeredPseudostaticTrialWedge({
  profile,
  layerStates,
  topElevation,
  bottomElevation,
  backfillInclination,
  wallInclinationFromVertical = 0,
  interfaceFrictionAngle = 0,
  surcharge,
  horizontalSeismicCoefficient,
  verticalSeismicCoefficient,
  slipPlaneAngle,
} = {}) {
  const alpha = finite(Number(slipPlaneAngle), "slipPlaneAngle");
  const beta = finite(Number(backfillInclination), "backfillInclination");
  const wallInclination = finite(
    Number(wallInclinationFromVertical),
    "wallInclinationFromVertical",
  );
  const delta = finite(
    Number(interfaceFrictionAngle),
    "interfaceFrictionAngle",
  );
  const kh = finite(
    Number(horizontalSeismicCoefficient),
    "horizontalSeismicCoefficient",
  );
  const kv = finite(
    Number(verticalSeismicCoefficient),
    "verticalSeismicCoefficient",
  );
  const height = topElevation - bottomElevation;
  const denominator = Math.tan(alpha) - Math.tan(beta);
  const wallTopX = height * Math.tan(wallInclination);
  const surfaceNormalProjection =
    Math.cos(wallInclination) -
    Math.sin(wallInclination) * Math.tan(beta);

  if (
    height <= 0 ||
    denominator <= 0 ||
    alpha <= 0 ||
    alpha >= Math.PI / 2 ||
    alpha + wallInclination >= Math.PI / 2 ||
    surfaceNormalProjection <= 1e-12 ||
    delta < 0 ||
    delta >= Math.PI / 2
  ) {
    return null;
  }

  const intersectionX =
    (height - wallTopX * Math.tan(beta)) / denominator;
  const intersectionElevation = bottomElevation + intersectionX * Math.tan(alpha);
  const baseNormalProjection = Math.cos(alpha + wallInclination);
  const intersectionNormalCoordinate =
    intersectionX * baseNormalProjection / Math.cos(alpha);
  if (
    intersectionX <= wallTopX + 1e-12 ||
    intersectionNormalCoordinate <= 1e-12 ||
    baseNormalProjection <= 1e-12
  ) {
    return null;
  }

  const boundaryCoordinates = [0, intersectionNormalCoordinate];

  for (const layer of profile.layers) {
    for (const elevation of [layer.topElevation, layer.bottomElevation]) {
      const x = (elevation - bottomElevation) / Math.tan(alpha);
      const coordinate = x * baseNormalProjection / Math.cos(alpha);
      if (
        coordinate > 1e-12 &&
        coordinate < intersectionNormalCoordinate - 1e-12
      ) {
        boundaryCoordinates.push(coordinate);
      }
    }
  }

  const partitions = uniqueSorted(boundaryCoordinates);
  const wedgePolygon = [
    { x: 0, z: bottomElevation },
    { x: wallTopX, z: topElevation },
    { x: intersectionX, z: intersectionElevation },
  ];
  const contributions = [];
  let totalArea = 0;
  let totalWeight = 0;
  let horizontalBoundaryForce = 0;

  for (let index = 0; index < partitions.length - 1; index += 1) {
    const left = partitions[index];
    const right = partitions[index + 1];
    const midpointCoordinate = (left + right) / 2;
    const midpointX = midpointCoordinate * Math.cos(alpha) /
      baseNormalProjection;
    const baseElevation = bottomElevation + midpointX * Math.tan(alpha);
    const baseLayer = layerAtExtendedElevation(profile, baseElevation);
    const state = layerStates.get(baseLayer.id);
    if (!state) throw new Error(`Missing trial-wedge state for layer ${baseLayer.id}.`);
    const relativeAngle =
      alpha + wallInclination - state.frictionAngle;
    if (relativeAngle <= 1e-12) return null;

    let polygon = index === 0
      ? wedgePolygon
      : clipAtWallNormalCoordinate(
          wedgePolygon,
          left,
          true,
          wallInclination,
          bottomElevation,
        );
    polygon = clipAtWallNormalCoordinate(
      polygon,
      right,
      false,
      wallInclination,
      bottomElevation,
    );
    const weightContributions = layerWeightContributions(profile, polygon);
    const area = weightContributions.reduce(
      (sum, contribution) => sum + contribution.area,
      0,
    );
    const weight = weightContributions.reduce(
      (sum, contribution) => sum + contribution.weight,
      0,
    );
    const surfaceHorizontalWidth = (right - left) / surfaceNormalProjection;
    const surchargeForce = surcharge * surfaceHorizontalWidth;
    const baseLength = (right - left) / baseNormalProjection;
    const relativeCosine = Math.cos(relativeAngle);
    if (relativeCosine <= 1e-12) return null;

    const globalVerticalGravityForce =
      (1 - kv) * weight + surchargeForce;
    const globalHorizontalInertiaForce = kh * weight;
    const downwardWallTangentForce =
      globalVerticalGravityForce * Math.cos(wallInclination) +
      globalHorizontalInertiaForce * Math.sin(wallInclination);
    const adverseWallNormalForce =
      globalHorizontalInertiaForce * Math.cos(wallInclination) -
      globalVerticalGravityForce * Math.sin(wallInclination);
    const cohesionResistance = state.cohesion * baseLength *
      Math.cos(state.frictionAngle) / relativeCosine;
    const thrustContribution =
      downwardWallTangentForce * Math.tan(relativeAngle) +
      adverseWallNormalForce - cohesionResistance;

    totalArea += area;
    totalWeight += weight;
    horizontalBoundaryForce += thrustContribution;
    contributions.push({
      id: `wedge-segment-${index + 1}`,
      baseLayerId: baseLayer.id,
      baseMaterialId: baseLayer.materialId,
      parameterSetId: state.parameterSetId,
      stressBasis: state.stressBasis,
      leftWallNormalCoordinate: left,
      rightWallNormalCoordinate: right,
      baseLength,
      area,
      weight,
      weightContributions,
      surfaceHorizontalWidth,
      surchargeForce,
      frictionAngle: state.frictionAngle,
      cohesion: state.cohesion,
      globalVerticalGravityForce,
      globalHorizontalInertiaForce,
      downwardWallTangentForce,
      adverseWallNormalForce,
      cohesionResistance,
      thrustContribution,
    });
  }

  const firstRelativeAngle =
    alpha + wallInclination - contributions[0].frictionAngle;
  const wallForceDenominator = Math.cos(firstRelativeAngle - delta);
  if (wallForceDenominator <= 1e-12) return null;
  const wallForceTransformationFactor =
    Math.cos(firstRelativeAngle) / wallForceDenominator;
  const rawThrust =
    horizontalBoundaryForce * wallForceTransformationFactor;

  return {
    slipPlaneAngle: alpha,
    wallInclinationFromVertical: wallInclination,
    interfaceFrictionAngle: delta,
    wallForceAngleFromHorizontal: delta - wallInclination,
    intersectionPoint: { x: intersectionX, elevation: intersectionElevation },
    area: totalArea,
    weight: totalWeight,
    horizontalBoundaryForce,
    wallForceTransformationFactor,
    rawThrust,
    thrust: Math.max(0, rawThrust),
    segments: contributions,
  };
}

function maximizeGoldenSection(evaluate, left, right, tolerance, maxIterations) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = left;
  let b = right;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = evaluate(c);
  let fd = evaluate(d);
  let iterations = 0;

  const value = (candidate) => candidate?.rawThrust ?? Number.NEGATIVE_INFINITY;
  while (b - a > tolerance && iterations < maxIterations) {
    if (value(fc) > value(fd)) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = evaluate(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = evaluate(d);
    }
    iterations += 1;
  }

  const candidates = [fc, fd, evaluate((a + b) / 2)].filter(Boolean);
  return {
    candidate: candidates.reduce((best, candidate) =>
      best == null || candidate.rawThrust > best.rawThrust ? candidate : best, null),
    iterations,
    bracket: { minimum: a, maximum: b },
  };
}

export function optimizeLayeredPseudostaticTrialWedge({
  profile,
  layerStates,
  topElevation,
  bottomElevation,
  backfillInclination = 0,
  wallInclinationFromVertical = 0,
  interfaceFrictionAngle = 0,
  surcharge = 0,
  horizontalSeismicCoefficient = 0,
  verticalSeismicCoefficient = 0,
  search = {},
} = {}) {
  const kh = finite(
    Number(horizontalSeismicCoefficient),
    "horizontalSeismicCoefficient",
  );
  const kv = finite(
    Number(verticalSeismicCoefficient),
    "verticalSeismicCoefficient",
  );
  const wallInclination = finite(
    Number(wallInclinationFromVertical),
    "wallInclinationFromVertical",
  );
  const delta = finite(
    Number(interfaceFrictionAngle),
    "interfaceFrictionAngle",
  );
  const beta = finite(Number(backfillInclination), "backfillInclination");
  if (kh < 0) throw new Error("horizontalSeismicCoefficient must be non-negative.");
  if (kv <= -1 || kv >= 1) {
    throw new Error("verticalSeismicCoefficient must satisfy -1 < kv < 1.");
  }
  if (Math.abs(wallInclination) >= Math.PI / 2) {
    throw new Error("wallInclinationFromVertical must satisfy |i| < pi/2.");
  }
  if (delta < 0 || delta >= Math.PI / 2) {
    throw new Error("interfaceFrictionAngle must satisfy 0 <= delta < pi/2.");
  }
  if (Math.abs(beta) >= Math.PI / 2) {
    throw new Error("backfillInclination must satisfy |beta| < pi/2.");
  }

  const sampleCount = Number(search.sampleCount ?? 721);
  const tolerance = Number(search.angleTolerance ?? 1e-10);
  const maxRefinementIterations = Number(search.maxRefinementIterations ?? 100);
  if (!Number.isInteger(sampleCount) || sampleCount < 41 || sampleCount > 5001) {
    throw new Error("trial-wedge search.sampleCount must be an integer from 41 to 5001.");
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error("trial-wedge search.angleTolerance must be positive.");
  }

  const maximumFrictionAngle = Math.max(
    0,
    ...[...layerStates.values()].map(({ frictionAngle }) => frictionAngle),
  );
  const minimumAngle = Math.max(
    0,
    beta,
    maximumFrictionAngle - wallInclination,
  ) + 1e-7;
  const maximumAngle = Math.min(
    Math.PI / 2,
    Math.PI / 2 - wallInclination,
  ) - 1e-7;
  if (minimumAngle >= maximumAngle) {
    throw new Error("No admissible trial-wedge slip-plane angle exists.");
  }

  const evaluate = (slipPlaneAngle) => evaluateLayeredPseudostaticTrialWedge({
    profile,
    layerStates,
    topElevation,
    bottomElevation,
    backfillInclination: beta,
    wallInclinationFromVertical: wallInclination,
    interfaceFrictionAngle: delta,
    surcharge,
    horizontalSeismicCoefficient: kh,
    verticalSeismicCoefficient: kv,
    slipPlaneAngle,
  });
  const sampled = [];
  let bestIndex = -1;

  for (let index = 0; index < sampleCount; index += 1) {
    const angle = minimumAngle +
      (maximumAngle - minimumAngle) * index / (sampleCount - 1);
    const candidate = evaluate(angle);
    sampled.push(candidate);
    if (
      candidate &&
      (bestIndex < 0 || candidate.rawThrust > sampled[bestIndex].rawThrust)
    ) {
      bestIndex = index;
    }
  }

  if (bestIndex < 0) throw new Error("Trial-wedge search found no valid candidate.");
  const leftIndex = Math.max(0, bestIndex - 1);
  const rightIndex = Math.min(sampleCount - 1, bestIndex + 1);
  const leftAngle = minimumAngle +
    (maximumAngle - minimumAngle) * leftIndex / (sampleCount - 1);
  const rightAngle = minimumAngle +
    (maximumAngle - minimumAngle) * rightIndex / (sampleCount - 1);
  const refined = maximizeGoldenSection(
    evaluate,
    leftAngle,
    rightAngle,
    tolerance,
    maxRefinementIterations,
  );
  const sampledBest = sampled[bestIndex];
  const critical = refined.candidate?.rawThrust > sampledBest.rawThrust
    ? refined.candidate
    : sampledBest;
  const envelopeStride = Math.max(1, Math.floor(sampleCount / 72));

  return {
    critical,
    search: {
      sampleCount,
      validCandidateCount: sampled.filter(Boolean).length,
      minimumAngle,
      maximumAngle,
      angleTolerance: tolerance,
      refinementIterations: refined.iterations,
      refinedBracket: refined.bracket,
      envelope: sampled.flatMap((candidate, index) =>
        candidate && (index % envelopeStride === 0 || index === bestIndex)
          ? [{
              slipPlaneAngle: candidate.slipPlaneAngle,
              rawThrust: candidate.rawThrust,
              thrust: candidate.thrust,
            }]
          : []),
    },
    metadata: {
      method: "constant-inclination-layered-trial-wedge",
      references: [
        USACE_LAYERED_WEDGE_REFERENCE,
        FHWA_PSEUDOSTATIC_WEDGE_REFERENCE,
        CALTRANS_GENERAL_WEDGE_REFERENCE,
      ],
    },
  };
}

export const LAYERED_PSEUDOSTATIC_TRIAL_WEDGE_REFERENCES = Object.freeze([
  USACE_LAYERED_WEDGE_REFERENCE,
  FHWA_PSEUDOSTATIC_WEDGE_REFERENCE,
  CALTRANS_GENERAL_WEDGE_REFERENCE,
]);
