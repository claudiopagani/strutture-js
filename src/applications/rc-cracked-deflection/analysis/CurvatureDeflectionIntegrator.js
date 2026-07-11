function interpolateRawDeflection(points, rawDeflections, x) {
  if (points.length === 0) return 0;
  if (x <= points[0].x) return rawDeflections[0];
  if (x >= points[points.length - 1].x) {
    return rawDeflections[rawDeflections.length - 1];
  }

  let lower = 0;
  let upper = points.length - 1;
  while (upper - lower > 1) {
    const middle = (lower + upper) >>> 1;
    if (points[middle].x <= x) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  const ratio =
    (x - points[lower].x) / (points[upper].x - points[lower].x);
  return (
    rawDeflections[lower] +
    ratio * (rawDeflections[upper] - rawDeflections[lower])
  );
}

function interpolateCompatibleDisplacements(points, samples) {
  const sorted = (samples ?? [])
    .filter(
      (sample) =>
        Number.isFinite(sample.x) && Number.isFinite(sample.deflection),
    )
    .sort((first, second) => first.x - second.x);

  if (sorted.length < 2) {
    return null;
  }

  return points.map((point) => {
    if (point.x <= sorted[0].x) {
      return {
        deflection: sorted[0].deflection,
        rotation: sorted[0].rotation,
      };
    }

    const last = sorted[sorted.length - 1];
    if (point.x >= last.x) {
      return { deflection: last.deflection, rotation: last.rotation };
    }

    let lower = 0;
    let upper = sorted.length - 1;
    while (upper - lower > 1) {
      const middle = (lower + upper) >>> 1;
      if (sorted[middle].x <= point.x) {
        lower = middle;
      } else {
        upper = middle;
      }
    }

    const left = sorted[lower];
    const right = sorted[upper];
    const span = right.x - left.x;
    const ratio = span > 0 ? (point.x - left.x) / span : 0;
    const rotation =
      Number.isFinite(left.rotation) && Number.isFinite(right.rotation)
        ? left.rotation + ratio * (right.rotation - left.rotation)
        : null;

    return {
      deflection:
        left.deflection + ratio * (right.deflection - left.deflection),
      rotation,
    };
  });
}

export function createNaturalCubicSpline(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) {
    throw new Error("Natural cubic spline requires matching x/y arrays.");
  }

  if (xs.length === 2) {
    const span = xs[1] - xs[0];
    const slope = span > 0 ? (ys[1] - ys[0]) / span : 0;

    return {
      evaluate(x) {
        return { value: ys[0] + slope * (x - xs[0]), slope };
      },
    };
  }

  const size = xs.length;
  const intervals = [];
  for (let index = 0; index < size - 1; index += 1) {
    intervals.push(xs[index + 1] - xs[index]);
    if (intervals[index] <= 0) {
      throw new Error("Natural cubic spline requires increasing x values.");
    }
  }

  const lower = new Array(size - 2).fill(0);
  const diagonal = new Array(size - 2).fill(0);
  const upper = new Array(size - 2).fill(0);
  const rhs = new Array(size - 2).fill(0);

  for (let index = 1; index <= size - 2; index += 1) {
    const row = index - 1;
    lower[row] = intervals[index - 1];
    diagonal[row] = 2 * (intervals[index - 1] + intervals[index]);
    upper[row] = intervals[index];
    rhs[row] =
      6 *
      ((ys[index + 1] - ys[index]) / intervals[index] -
        (ys[index] - ys[index - 1]) / intervals[index - 1]);
  }

  for (let index = 1; index < size - 2; index += 1) {
    const factor = lower[index] / diagonal[index - 1];
    diagonal[index] -= factor * upper[index - 1];
    rhs[index] -= factor * rhs[index - 1];
  }

  const secondDerivatives = new Array(size).fill(0);
  secondDerivatives[size - 2] = rhs[size - 3] / diagonal[size - 3];
  for (let index = size - 4; index >= 0; index -= 1) {
    secondDerivatives[index + 1] =
      (rhs[index] - upper[index] * secondDerivatives[index + 2]) /
      diagonal[index];
  }

  const intervalIndex = (x) => {
    if (x <= xs[0]) return 0;
    if (x >= xs[size - 1]) return size - 2;

    let lowerIndex = 0;
    let upperIndex = size - 1;
    while (upperIndex - lowerIndex > 1) {
      const middle = (lowerIndex + upperIndex) >>> 1;
      if (xs[middle] <= x) {
        lowerIndex = middle;
      } else {
        upperIndex = middle;
      }
    }

    return lowerIndex;
  };

  return {
    evaluate(x) {
      const index = intervalIndex(x);
      const span = xs[index + 1] - xs[index];
      const a = (xs[index + 1] - x) / span;
      const b = (x - xs[index]) / span;
      const value =
        a * ys[index] +
        b * ys[index + 1] +
        (((a ** 3 - a) * secondDerivatives[index] +
          (b ** 3 - b) * secondDerivatives[index + 1]) *
          span ** 2) /
          6;
      const slope =
        (ys[index + 1] - ys[index]) / span +
        (span *
          ((-3 * a ** 2 + 1) * secondDerivatives[index] +
            (3 * b ** 2 - 1) * secondDerivatives[index + 1])) /
          6;

      return { value, slope };
    },
  };
}

function linearSupportCorrection(points, rotations, rawDeflections, x0, x1) {
  const spanLength = x1 - x0;
  if (spanLength <= 0) {
    return points.map((point, index) => ({
      ...point,
      rotation: rotations[index],
      deflection: rawDeflections[index],
    }));
  }

  const rawV0 = interpolateRawDeflection(points, rawDeflections, x0);
  const rawV1 = interpolateRawDeflection(points, rawDeflections, x1);
  const correctionSlope = (rawV1 - rawV0) / spanLength;

  return points.map((point, index) => {
    const ratio = (point.x - x0) / spanLength;
    const correction = -(rawV0 * (1 - ratio) + rawV1 * ratio);

    return {
      ...point,
      rotation: rotations[index] - correctionSlope,
      deflection: rawDeflections[index] + correction,
    };
  });
}

function smoothSupportCorrection(
  points,
  rotations,
  rawDeflections,
  supportStations,
) {
  const correctionValues = supportStations.map(
    (station) =>
      -interpolateRawDeflection(points, rawDeflections, station),
  );
  const correctionSpline = createNaturalCubicSpline(
    supportStations,
    correctionValues,
  );

  return points.map((point, index) => {
    const correction = correctionSpline.evaluate(point.x);

    return {
      ...point,
      rotation: rotations[index] + correction.slope,
      deflection: rawDeflections[index] + correction.value,
    };
  });
}

export function integrateCurvature(
  points,
  supports = [],
  { displacementSamples = null } = {},
) {
  if (points.length < 2) {
    return points.map((point) => ({
      ...point,
      rotation: 0,
      deflection: 0,
    }));
  }

  const rotations = [0];
  const rawDeflections = [0];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const rotation =
      rotations[index - 1] +
      0.5 * (previous.curvature + current.curvature) * dx;
    const deflection =
      rawDeflections[index - 1] +
      0.5 * (rotations[index - 1] + rotation) * dx;

    rotations.push(rotation);
    rawDeflections.push(deflection);
  }

  const compatibleDisplacements = interpolateCompatibleDisplacements(
    points,
    displacementSamples,
  );

  if (compatibleDisplacements) {
    return points.map((point, index) => ({
      ...point,
      rotation: compatibleDisplacements[index].rotation ?? rotations[index],
      deflection: compatibleDisplacements[index].deflection,
    }));
  }

  const supportStations = [
    ...new Set(
      supports
        .filter((support) => support.restraints?.uy)
        .map((support) =>
          Number.isFinite(support.station) ? support.station : null,
        )
        .filter((station) => station != null),
    ),
  ].sort((first, second) => first - second);

  if (supportStations.length === 2) {
    return linearSupportCorrection(
      points,
      rotations,
      rawDeflections,
      supportStations[0],
      supportStations[1],
    );
  }

  if (supportStations.length > 2) {
    return smoothSupportCorrection(
      points,
      rotations,
      rawDeflections,
      supportStations,
    );
  }

  return points.map((point, index) => ({
    ...point,
    rotation: rotations[index],
    deflection: rawDeflections[index],
  }));
}
