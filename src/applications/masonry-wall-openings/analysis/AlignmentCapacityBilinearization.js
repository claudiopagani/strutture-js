const DEFAULT_DROP_RATIO = 0.2;
const EPS = 1e-9;

function normalizePoint(point, index) {
  return {
    id: point.id ?? `point-${index + 1}`,
    displacement:
      Number.isFinite(point.displacement)
        ? point.displacement
        : point.controlDisplacement,
    baseShear:
      Number.isFinite(point.baseShear) ? point.baseShear : point.force,
  };
}

function sortCurvePoints(points = []) {
  return points
    .map(normalizePoint)
    .filter(
      (point) =>
        Number.isFinite(point.displacement) && Number.isFinite(point.baseShear),
    )
    .sort((left, right) => left.displacement - right.displacement);
}

function findPeakPoint(points) {
  return points.reduce(
    (selected, point) =>
      !selected || point.baseShear > selected.baseShear ? point : selected,
    null,
  );
}

function interpolateCrossing(startPoint, endPoint, targetForce) {
  const deltaForce = endPoint.baseShear - startPoint.baseShear;

  if (Math.abs(deltaForce) <= EPS) {
    return endPoint.displacement;
  }

  const ratio = (targetForce - startPoint.baseShear) / deltaForce;

  return (
    startPoint.displacement +
    ratio * (endPoint.displacement - startPoint.displacement)
  );
}

function insertPointAtDisplacement(points, displacement) {
  if (!Number.isFinite(displacement) || points.length === 0) {
    return points;
  }

  const existingPoint = points.find(
    (point) => Math.abs(point.displacement - displacement) <= EPS,
  );

  if (existingPoint) {
    return points;
  }

  if (displacement <= points[0].displacement + EPS) {
    return [
      {
        id: "inserted-start",
        displacement,
        baseShear: points[0].baseShear,
      },
      ...points,
    ];
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];

    if (
      displacement > startPoint.displacement + EPS &&
      displacement < endPoint.displacement - EPS
    ) {
      const ratio =
        (displacement - startPoint.displacement) /
        (endPoint.displacement - startPoint.displacement);
      const baseShear =
        startPoint.baseShear +
        ratio * (endPoint.baseShear - startPoint.baseShear);

      return [
        ...points.slice(0, index + 1),
        {
          id: `inserted-${index + 1}`,
          displacement,
          baseShear,
        },
        ...points.slice(index + 1),
      ];
    }
  }

  return [
    ...points,
    {
      id: "inserted-end",
      displacement,
      baseShear: points.at(-1)?.baseShear ?? 0,
    },
  ];
}

function integrateCurveArea(points, maxDisplacement) {
  const clippedPoints = insertPointAtDisplacement(points, maxDisplacement).filter(
    (point) => point.displacement <= maxDisplacement + EPS,
  );
  let area = 0;

  for (let index = 0; index < clippedPoints.length - 1; index += 1) {
    const startPoint = clippedPoints[index];
    const endPoint = clippedPoints[index + 1];
    const deltaDisplacement = endPoint.displacement - startPoint.displacement;

    if (deltaDisplacement <= EPS) {
      continue;
    }

    area +=
      ((startPoint.baseShear + endPoint.baseShear) / 2) * deltaDisplacement;
  }

  return area;
}

function resolveSecantPoint(points, peakPoint) {
  if (!peakPoint || peakPoint.baseShear <= EPS) {
    return null;
  }

  const targetForce = 0.7 * peakPoint.baseShear;
  const peakIndex = points.findIndex((point) => point.id === peakPoint.id);
  const ascendingBranch = points.slice(0, peakIndex + 1);

  for (let index = 0; index < ascendingBranch.length - 1; index += 1) {
    const startPoint = ascendingBranch[index];
    const endPoint = ascendingBranch[index + 1];

    if (endPoint.baseShear + EPS < targetForce) {
      continue;
    }

    const displacement = interpolateCrossing(
      startPoint,
      endPoint,
      targetForce,
    );

    return {
      displacement,
      baseShear: targetForce,
      sourceSegment: {
        startId: startPoint.id,
        endId: endPoint.id,
      },
    };
  }

  return {
    displacement: peakPoint.displacement,
    baseShear: targetForce,
    sourceSegment: {
      startId: peakPoint.id,
      endId: peakPoint.id,
    },
  };
}

function resolveUltimatePoint(points, peakPoint, dropRatio) {
  if (!peakPoint) {
    return null;
  }

  const targetForce = peakPoint.baseShear * (1 - dropRatio);
  const peakIndex = points.findIndex((point) => point.id === peakPoint.id);

  for (let index = peakIndex; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];

    if (endPoint.baseShear > targetForce + EPS) {
      continue;
    }

    return {
      displacement: interpolateCrossing(startPoint, endPoint, targetForce),
      baseShear: targetForce,
      sourceSegment: {
        startId: startPoint.id,
        endId: endPoint.id,
      },
      fallbackToLastPoint: false,
    };
  }

  const lastPoint = points.at(-1);

  return {
    displacement: lastPoint?.displacement ?? peakPoint.displacement,
    baseShear: lastPoint?.baseShear ?? peakPoint.baseShear,
    sourceSegment: {
      startId: lastPoint?.id ?? peakPoint.id,
      endId: lastPoint?.id ?? peakPoint.id,
    },
    fallbackToLastPoint: true,
  };
}

export function bilinearizeCapacityCurve({
  curve,
  points = curve?.points ?? [],
  options = {},
} = {}) {
  const warnings = [];
  const normalizedPoints = sortCurvePoints(points);

  if (normalizedPoints.length < 2) {
    return {
      status: "not-verified",
      warnings: ["At least two capacity-curve points are required for bilinearization."],
      ks: 0,
      Vy: 0,
      du: 0,
      yieldDisplacement: 0,
      peakPoint: null,
      secantPoint: null,
      ultimatePoint: null,
      actualEnergy: 0,
      bilinearEnergy: 0,
      points: normalizedPoints,
    };
  }

  const peakPoint = findPeakPoint(normalizedPoints);
  const secantPoint = resolveSecantPoint(normalizedPoints, peakPoint);
  const dropRatio = Number.isFinite(options.dropRatio)
    ? options.dropRatio
    : DEFAULT_DROP_RATIO;
  const ultimatePoint = resolveUltimatePoint(
    normalizedPoints,
    peakPoint,
    dropRatio,
  );
  const ks =
    secantPoint && secantPoint.displacement > EPS
      ? secantPoint.baseShear / secantPoint.displacement
      : 0;
  const actualEnergy = integrateCurveArea(
    normalizedPoints,
    ultimatePoint?.displacement ?? 0,
  );

  if (ultimatePoint?.fallbackToLastPoint) {
    warnings.push(
      "The capacity curve never dropped by the requested 20% from peak resistance, so the last available point was used as ultimate displacement.",
    );
  }

  if (ks <= EPS || !ultimatePoint || ultimatePoint.displacement <= EPS) {
    return {
      status: "not-verified",
      warnings: [
        ...warnings,
        "The capacity curve does not provide a finite elastic secant stiffness or a positive ultimate displacement.",
      ],
      ks: ks > EPS ? ks : 0,
      Vy: 0,
      du: ultimatePoint?.displacement ?? 0,
      yieldDisplacement: 0,
      peakPoint,
      secantPoint,
      ultimatePoint,
      actualEnergy,
      bilinearEnergy: 0,
      points: normalizedPoints,
    };
  }

  const radicand =
    ultimatePoint.displacement ** 2 - (2 * actualEnergy) / ks;
  const clampedRadicand = Math.max(radicand, 0);

  if (radicand < -EPS) {
    warnings.push(
      "Equivalent-energy bilinearization reached a negative quadratic radicand; the solution was clamped to preserve a valid bilinear curve.",
    );
  }

  const yieldDisplacement =
    ultimatePoint.displacement - Math.sqrt(clampedRadicand);
  const limitedYieldDisplacement = Math.min(
    Math.max(yieldDisplacement, 0),
    ultimatePoint.displacement,
  );
  const Vy = ks * limitedYieldDisplacement;
  const bilinearEnergy =
    Vy * ultimatePoint.displacement - (Vy * limitedYieldDisplacement) / 2;

  return {
    status: "ok",
    warnings,
    ks,
    Vy,
    du: ultimatePoint.displacement,
    yieldDisplacement: limitedYieldDisplacement,
    peakPoint,
    secantPoint,
    ultimatePoint,
    actualEnergy,
    bilinearEnergy,
    points: normalizedPoints,
  };
}
