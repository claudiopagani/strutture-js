export const EVENT_CURVATURE_TOLERANCE = 1e-13;

export function createLinearSamples({ minimum, maximum, count }) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    throw new Error("RCMomentCurvatureAnalyzer requires a valid sample interval.");
  }

  if (!Number.isInteger(count) || count < 2) {
    throw new Error("RCMomentCurvatureAnalyzer requires at least two samples.");
  }

  const step = (maximum - minimum) / (count - 1);

  return Array.from({ length: count }, (_, index) => minimum + step * index);
}

export function createCurvatureValues({ curvatureMax, pointCount }) {
  if (!Number.isFinite(curvatureMax) || curvatureMax <= 0) {
    throw new Error("RCMomentCurvatureAnalyzer requires a positive curvatureMax.");
  }

  return createLinearSamples({
    minimum: 0,
    maximum: curvatureMax,
    count: pointCount,
  });
}

export function findBrackets(samples, target) {
  const brackets = [];

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];

    if (Math.abs(previous.value - target) === 0) {
      brackets.push({ min: previous.eps0, max: previous.eps0 });
      continue;
    }

    if ((previous.value - target) * (current.value - target) <= 0) {
      brackets.push({
        min: previous.eps0,
        max: current.eps0,
      });
    }
  }

  const last = samples.at(-1);

  if (last && Math.abs(last.value - target) === 0) {
    brackets.push({ min: last.eps0, max: last.eps0 });
  }

  return brackets.filter(
    (bracket, index) =>
      index === 0 ||
      bracket.min !== brackets[index - 1].min ||
      bracket.max !== brackets[index - 1].max,
  );
}

export function bracketDistanceFromHint(bracket, eps0Hint) {
  if (!Number.isFinite(eps0Hint)) {
    return 0;
  }

  if (eps0Hint < bracket.min) {
    return bracket.min - eps0Hint;
  }

  if (eps0Hint > bracket.max) {
    return eps0Hint - bracket.max;
  }

  return 0;
}

export function appendUniquePoint(
  points,
  point,
  tolerance = EVENT_CURVATURE_TOLERANCE,
) {
  const previous = points.at(-1);

  if (
    previous &&
    Math.abs(previous.absoluteCurvature - point.absoluteCurvature) <= tolerance
  ) {
    points[points.length - 1] = point;
    return;
  }

  points.push(point);
}
