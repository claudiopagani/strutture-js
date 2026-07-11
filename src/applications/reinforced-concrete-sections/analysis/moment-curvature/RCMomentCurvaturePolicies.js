import {
  getConcreteProjectedBounds,
  neutralAxisDirection,
  projectionAt,
  resolveConcreteStrainExtremes,
} from "../RCSectionStrainExtremes.js";
import {
  StrainField,
  createAffineStrainField,
} from "../StrainField.js";

export const DEFAULT_EPS0_MIN = -0.08;
export const DEFAULT_EPS0_MAX = 0.08;
export const LIMIT_TOLERANCE = 1e-9;
export const EVENT_UTILIZATION_TOLERANCE = 1e-10;
export const EVENT_MAX_ITERATIONS = 80;
export const NTC2018_ULTIMATE_MOMENT_DROP = 0.15;
export const POST_ULTIMATE_MOMENT_TOLERANCE = 1e-9;

export const round = (value, decimals = 12) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

export function resolveConcreteUltimateCompressionStrain(concreteLaw) {
  const compressionLimit = concreteLaw?.strainLimits?.().compression;

  if (!Number.isFinite(compressionLimit) || compressionLimit === 0) {
    return 0.0035;
  }

  return Math.abs(compressionLimit);
}

export function resolveConcretePeakCompressionStrain(concreteLaw) {
  const peak = concreteLaw?.peakCompressionStrain?.();

  if (Number.isFinite(peak) && peak >= 0) {
    return peak;
  }

  for (const key of ["ec2", "ec3", "ec4"]) {
    if (Number.isFinite(concreteLaw?.[key]) && concreteLaw[key] >= 0) {
      return concreteLaw[key];
    }
  }

  return null;
}

export function resolveSteelYieldStrain(steelLaw) {
  const yieldStrain = steelLaw?.yieldStrain?.();

  if (Number.isFinite(yieldStrain) && yieldStrain > 0) {
    return Math.abs(yieldStrain);
  }

  if (Number.isFinite(steelLaw?.fyd) && Number.isFinite(steelLaw?.Es)) {
    return Math.abs(steelLaw.fyd / steelLaw.Es);
  }

  return null;
}

export function resolveSteelUltimateTensionStrain(steelLaw) {
  const tensionLimit = steelLaw?.strainLimits?.().tension;

  return Number.isFinite(tensionLimit) && tensionLimit > 0
    ? Math.abs(tensionLimit)
    : null;
}

export function resolveCompressedSide({ compressedSide = null, compressedEdge = "top" }) {
  if (compressedSide != null) {
    if (!["positive", "negative"].includes(compressedSide)) {
      throw new Error(`Unsupported compressed side: ${compressedSide}.`);
    }

    return compressedSide;
  }

  if (compressedEdge === "top") {
    return "positive";
  }

  if (compressedEdge === "bottom") {
    return "negative";
  }

  throw new Error(`Unsupported compressed edge: ${compressedEdge}.`);
}

export function resolveUniaxialCompressedEdge({ theta, compressedSide }) {
  if (neutralAxisDirection(theta).theta !== 0) {
    return null;
  }

  return compressedSide === "positive" ? "top" : "bottom";
}

export function buildOrientedStrainField({
  eps0,
  curvature,
  theta,
  direction = null,
  compressedSide,
  includeResponseDetails = false,
}) {
  const absoluteCurvature = Math.abs(curvature);
  const resolvedDirection = direction ?? neutralAxisDirection(theta);
  const sideSign = compressedSide === "positive" ? 1 : -1;
  const coefficients = {
    eps0,
    kappaY: sideSign * absoluteCurvature * resolvedDirection.sin,
    kappaZ: sideSign * absoluteCurvature * resolvedDirection.cos,
  };

  return includeResponseDetails
    ? new StrainField(coefficients)
    : createAffineStrainField(coefficients);
}

export function signedEngineeringCurvature({
  curvature,
  compressedSide = null,
  compressedEdge = "top",
}) {
  const absoluteCurvature = Math.abs(curvature);
  const side = resolveCompressedSide({ compressedSide, compressedEdge });
  return side === "positive" ? absoluteCurvature : -absoluteCurvature;
}

export function resolveConcreteCompressionEdge({ section, strainField }) {
  return resolveConcreteStrainExtremes({
    section,
    strainField,
  }).compression;
}

export function createStateCheck({ id, material, mode, demand, limit }) {
  const utilizationRatio =
    limit > 0 ? demand / limit : Number.POSITIVE_INFINITY;

  return {
    id,
    material,
    mode,
    demand,
    limit,
    utilizationRatio,
    reached: utilizationRatio >= 1,
  };
}

export function resolveLimitState({
  state,
  concreteLaw,
  steelLaw,
  concreteCompressionEdge,
}) {
  const concreteLimits = concreteLaw?.strainLimits?.() ?? {};
  const steelLimits = steelLaw?.strainLimits?.() ?? {};
  const checks = [];

  if (Number.isFinite(concreteLimits.compression)) {
    const limit = Math.abs(concreteLimits.compression);
    checks.push(createStateCheck({
      id: "concrete-compression-strain",
      material: "concrete",
      mode: "ultimate-compression",
      demand: concreteCompressionEdge.demand,
      limit,
    }));
  }

  if (Number.isFinite(steelLimits.tension)) {
    const limit = Math.abs(steelLimits.tension);
    const demand = Math.max(
      0,
      state.extremes.maxSteelTensionStrain?.strain ??
        state.extremes.maxSteelTension?.strain ??
        0,
    );
    checks.push(createStateCheck({
      id: "steel-tension-strain",
      material: "steel",
      mode: "ultimate-tension",
      demand,
      limit,
    }));
  }

  if (Number.isFinite(steelLimits.compression)) {
    const limit = Math.abs(steelLimits.compression);
    const demand = Math.max(
      0,
      -(
        state.extremes.maxSteelCompressionStrain?.strain ??
        state.extremes.maxSteelCompression?.strain ??
        0
      ),
    );
    checks.push(createStateCheck({
      id: "steel-compression-strain",
      material: "steel",
      mode: "ultimate-compression",
      demand,
      limit,
    }));
  }

  const governing = checks.reduce(
    (current, check) =>
      current == null || check.utilizationRatio > current.utilizationRatio
        ? check
        : current,
    null,
  );

  const reachedChecks = checks.filter((check) => check.reached);

  return {
    reached: reachedChecks.length > 0,
    governing,
    reachedChecks,
    checks,
  };
}

export function resolveFirstYieldState({
  state,
  concreteLaw,
  steelLaw,
  concreteCompressionEdge,
}) {
  const checks = [];
  const steelYieldStrain = resolveSteelYieldStrain(steelLaw);
  const concretePeakStrain = resolveConcretePeakCompressionStrain(concreteLaw);

  if (Number.isFinite(steelYieldStrain) && steelYieldStrain > 0) {
    const tensionDemand = Math.max(
      0,
      state.extremes.maxSteelTensionStrain?.strain ??
        state.extremes.maxSteelTension?.strain ??
        0,
    );
    checks.push(createStateCheck({
      id: "steel-tension-yield",
      material: "steel",
      mode: "yield-tension",
      demand: tensionDemand,
      limit: steelYieldStrain,
    }));

    const compressionDemand = Math.max(
      0,
      -(
        state.extremes.maxSteelCompressionStrain?.strain ??
        state.extremes.maxSteelCompression?.strain ??
        0
      ),
    );
    checks.push(createStateCheck({
      id: "steel-compression-yield",
      material: "steel",
      mode: "yield-compression",
      demand: compressionDemand,
      limit: steelYieldStrain,
    }));
  }

  if (Number.isFinite(concretePeakStrain) && concretePeakStrain > 0) {
    checks.push(createStateCheck({
      id: "concrete-compression-peak",
      material: "concrete",
      mode: "peak-compression",
      demand: concreteCompressionEdge.demand,
      limit: concretePeakStrain,
    }));
  }

  const governing = checks.reduce(
    (current, check) =>
      current == null || check.utilizationRatio > current.utilizationRatio
        ? check
        : current,
    null,
  );

  const reachedChecks = checks.filter((check) => check.reached);

  return {
    reached: reachedChecks.length > 0,
    governing,
    reachedChecks,
    checks,
  };
}

export function getStateCheck(point, stateKey, checkId) {
  return point?.[stateKey]?.checks?.find((check) => check.id === checkId) ?? null;
}

export function annotateEventPoint(point, stateKey, checkId) {
  const event = getStateCheck(point, stateKey, checkId);

  if (!event) {
    return point;
  }

  return {
    ...point,
    [stateKey]: {
      ...point[stateKey],
      reached: true,
      governing: event,
      event,
      eventType: event.id,
      eventMaterial: event.material,
      eventMode: event.mode,
    },
  };
}

export function annotateMomentDropPoint(point, { referenceMoment, dropRatio }) {
  const moment = absoluteMoment(point);
  const targetMoment = (1 - dropRatio) * referenceMoment;
  const actualDropRatio =
    referenceMoment > 0 ? 1 - moment / referenceMoment : null;

  return {
    ...point,
    postUltimateState: {
      referenceMoment,
      reference: "material-ultimate-moment",
      targetMoment,
      moment,
      targetDropRatio: dropRatio,
      actualDropRatio,
      reached: moment <= targetMoment,
    },
    // Legacy alias retained for consumers of the previous post-peak API.
    postPeakState: {
      maximumMoment: referenceMoment,
      targetMoment,
      moment,
      targetDropRatio: dropRatio,
      actualDropRatio,
      reached: moment <= targetMoment,
    },
  };
}

export function resolveBalancedFailureGeometry({
  section,
  concreteLaw,
  steelLaw,
  theta = 0,
  compressedSide = null,
  compressedEdge = "top",
}) {
  const ultimateCompressionStrain =
    resolveConcreteUltimateCompressionStrain(concreteLaw);
  const ultimateSteelTensionStrain =
    resolveSteelUltimateTensionStrain(steelLaw);
  const reinforcementBars = section.getReinforcementBars();

  if (
    !Number.isFinite(ultimateSteelTensionStrain) ||
    ultimateSteelTensionStrain <= 0 ||
    reinforcementBars.length === 0
  ) {
    return null;
  }

  const direction = neutralAxisDirection(theta);
  const side = resolveCompressedSide({ compressedSide, compressedEdge });
  const sideSign = side === "positive" ? 1 : -1;
  const projectedBounds = getConcreteProjectedBounds(section, direction.theta);
  const reinforcementProjections = reinforcementBars.map((bar) =>
    projectionAt(direction.theta, bar),
  );
  const compressedEdgeProjection =
    side === "positive"
      ? projectedBounds.maximum.projection
      : projectedBounds.minimum.projection;
  const tensionReinforcementProjection =
    side === "positive"
      ? Math.min(...reinforcementProjections)
      : Math.max(...reinforcementProjections);
  const effectiveDepth =
    sideSign *
    (compressedEdgeProjection - tensionReinforcementProjection);

  if (!Number.isFinite(effectiveDepth) || effectiveDepth <= 0) {
    return null;
  }

  const absoluteCurvature =
    (ultimateCompressionStrain + ultimateSteelTensionStrain) / effectiveDepth;
  const kappaY = sideSign * absoluteCurvature * direction.sin;
  const kappaZ = sideSign * absoluteCurvature * direction.cos;
  const eps0 =
    -ultimateCompressionStrain +
    sideSign * absoluteCurvature * compressedEdgeProjection;

  return {
    theta: direction.theta,
    compressedSide: side,
    absoluteCurvature,
    eps0,
    kappaY,
    kappaZ,
    compressedEdgeProjection,
    tensionReinforcementProjection,
    compressedEdgeY:
      direction.theta === 0 ? compressedEdgeProjection : null,
    tensionReinforcementY:
      direction.theta === 0 ? tensionReinforcementProjection : null,
    effectiveDepth,
    neutralAxisDepth: ultimateCompressionStrain / absoluteCurvature,
    ultimateCompressionStrain,
    ultimateSteelTensionStrain,
  };
}

export function neutralAxisY(strainField) {
  if (!Number.isFinite(strainField.kappaZ) || Math.abs(strainField.kappaZ) < 1e-18) {
    return null;
  }

  return strainField.eps0 / strainField.kappaZ;
}

export function neutralAxisProjection({ strainField, compressedSide }) {
  const curvature = Math.hypot(strainField.kappaY, strainField.kappaZ);

  if (!Number.isFinite(curvature) || curvature < 1e-18) {
    return null;
  }

  const sideSign = compressedSide === "positive" ? 1 : -1;
  return strainField.eps0 / (sideSign * curvature);
}

export function projectedMoment(point) {
  const direction = neutralAxisDirection(point?.theta ?? 0);
  return (point?.Mx ?? 0) * direction.cos + (point?.My ?? 0) * direction.sin;
}

export function absoluteMoment(point) {
  return Math.abs(projectedMoment(point));
}

export function findMaximumMomentPoint(points) {
  return points.reduce(
    (current, point, index) => {
      const moment = absoluteMoment(point);

      if (current == null || moment > current.moment) {
        return { point, index, moment };
      }

      return current;
    },
    null,
  );
}

export function interpolateCurvatureAtMomentDrop({
  points,
  maximumIndex,
  targetMoment,
  compressedEdge,
}) {
  for (let index = maximumIndex + 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousMoment = absoluteMoment(previous);
    const currentMoment = absoluteMoment(current);

    if (previousMoment >= targetMoment && currentMoment <= targetMoment) {
      if (Math.abs(previousMoment - currentMoment) < 1e-12) {
        const compressedSide =
          current.compressedSide ?? previous.compressedSide ?? null;

        return {
          theta: current.theta ?? previous.theta ?? 0,
          compressedSide,
          absoluteCurvature: current.absoluteCurvature,
          curvature: signedEngineeringCurvature({
            curvature: current.absoluteCurvature,
            compressedSide,
            compressedEdge,
          }),
          Mx: current.Mx,
          My: current.My,
          source: "15-percent-post-peak-drop",
          interpolation: "flat-segment",
        };
      }

      const ratio =
        (previousMoment - targetMoment) / (previousMoment - currentMoment);
      const absoluteCurvature =
        previous.absoluteCurvature +
        ratio * (current.absoluteCurvature - previous.absoluteCurvature);
      const mx = previous.Mx + ratio * (current.Mx - previous.Mx);
      const my = previous.My + ratio * (current.My - previous.My);
      const compressedSide =
        current.compressedSide ?? previous.compressedSide ?? null;

      return {
        theta: current.theta ?? previous.theta ?? 0,
        compressedSide,
        absoluteCurvature,
        curvature: signedEngineeringCurvature({
          curvature: absoluteCurvature,
          compressedSide,
          compressedEdge,
        }),
        Mx: mx,
        My: my,
        source: "15-percent-post-peak-drop",
        interpolation: "linear-moment-curvature",
      };
    }
  }

  return null;
}

export function resolveUltimateDuctilityPoint({
  points,
  maximum,
  failurePoint,
  compressedEdge,
}) {
  if (!maximum) {
    return null;
  }

  const dropPoint = interpolateCurvatureAtMomentDrop({
    points,
    maximumIndex: maximum.index,
    targetMoment:
      (1 - NTC2018_ULTIMATE_MOMENT_DROP) * maximum.moment,
    compressedEdge,
  });
  const materialPoint =
    failurePoint == null
      ? null
      : {
          absoluteCurvature: failurePoint.absoluteCurvature,
          curvature: failurePoint.curvature,
          Mx: failurePoint.Mx,
          My: failurePoint.My,
          source: "material-ultimate-strain",
          interpolation: "solved-point",
        };

  if (dropPoint && materialPoint) {
    return dropPoint.absoluteCurvature <= materialPoint.absoluteCurvature
      ? dropPoint
      : materialPoint;
  }

  if (dropPoint) {
    return dropPoint;
  }

  if (materialPoint) {
    return materialPoint;
  }

  const lastPoint = points.at(-1);

  if (!lastPoint) {
    return null;
  }

  return {
    absoluteCurvature: lastPoint.absoluteCurvature,
    curvature: lastPoint.curvature,
    Mx: lastPoint.Mx,
    My: lastPoint.My,
    source: "last-analysis-point",
    interpolation: "solved-point",
  };
}

export function resolveNtc2018Ductility({
  points,
  firstYieldPoint,
  failurePoint,
  compressedEdge,
}) {
  if (!Array.isArray(points) || points.length === 0 || !firstYieldPoint) {
    return null;
  }

  const maximum = findMaximumMomentPoint(points);
  const momentDropPoint =
    maximum == null
      ? null
      : interpolateCurvatureAtMomentDrop({
          points,
          maximumIndex: maximum.index,
          targetMoment:
            (1 - NTC2018_ULTIMATE_MOMENT_DROP) * maximum.moment,
          compressedEdge,
        });
  const materialUltimatePoint =
    failurePoint == null
      ? null
      : {
          absoluteCurvature: failurePoint.absoluteCurvature,
          curvature: failurePoint.curvature,
          Mx: failurePoint.Mx,
          My: failurePoint.My,
          source: "material-ultimate-strain",
          interpolation: "solved-point",
        };
  const ultimatePoint = resolveUltimateDuctilityPoint({
    points,
    maximum,
    failurePoint,
    compressedEdge,
  });
  const phiPrimeYd = firstYieldPoint.absoluteCurvature;
  const mPrimeYd = absoluteMoment(firstYieldPoint);
  const mRd = maximum?.moment ?? null;
  const phiYd =
    Number.isFinite(phiPrimeYd) &&
    Number.isFinite(mPrimeYd) &&
    Number.isFinite(mRd) &&
    mPrimeYd > 0
      ? phiPrimeYd * (mRd / mPrimeYd)
      : null;
  const phiU = ultimatePoint?.absoluteCurvature ?? null;

  return {
    reference: "NTC2018 4.1.2.3.4.2",
    phiPrimeYd,
    mPrimeYd,
    mRd,
    phiYd,
    phiU,
    curvatureDuctilityRatio:
      Number.isFinite(phiU) && Number.isFinite(phiYd) && phiYd > 0
        ? phiU / phiYd
        : null,
    firstYieldPoint,
    maximumMomentPoint: maximum?.point ?? null,
    momentDropPoint,
    materialUltimatePoint,
    ultimatePoint,
    ultimateMomentDropRatio: NTC2018_ULTIMATE_MOMENT_DROP,
    firstYieldGoverning: firstYieldPoint.firstYieldState?.governing?.id ?? null,
    ultimateCurvatureSource: ultimatePoint?.source ?? null,
  };
}

export function defaultCurvatureMax({
  section,
  concreteLaw,
  steelLaw,
  theta = 0,
  compressedSide = null,
  compressedEdge = "top",
}) {
  const balancedGeometry = resolveBalancedFailureGeometry({
    section,
    concreteLaw,
    steelLaw,
    theta,
    compressedSide,
    compressedEdge,
  });

  if (balancedGeometry) {
    return balancedGeometry.absoluteCurvature;
  }

  const projectedBounds = getConcreteProjectedBounds(section, theta);
  const height =
    projectedBounds.maximum.projection -
    projectedBounds.minimum.projection;

  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("RCMomentCurvatureAnalyzer requires a positive section height.");
  }

  return (2.5 * resolveConcreteUltimateCompressionStrain(concreteLaw)) / height;
}

export function summarizeStateCheck(check) {
  if (check == null) {
    return null;
  }

  return {
    id: check.id,
    material: check.material,
    mode: check.mode,
    demand: round(check.demand),
    limit: round(check.limit),
    utilizationRatio: round(check.utilizationRatio, 9),
    reached: check.reached,
  };
}

