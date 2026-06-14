import { IllinoisRootSolver } from "../../../domain/solvers/IllinoisRootSolver.js";
import {
  normalizePostUltimateFractureEnergyDensity,
  RCSectionStateIntegrator,
} from "./RCSectionStateIntegrator.js";
import {
  getConcreteProjectedBounds,
  neutralAxisDirection,
  projectionAt,
  resolveConcreteStrainExtremes,
} from "./RCSectionStrainExtremes.js";
import { StrainField } from "./StrainField.js";

const DEFAULT_EPS0_MIN = -0.08;
const DEFAULT_EPS0_MAX = 0.08;
const LIMIT_TOLERANCE = 1e-9;
const EVENT_UTILIZATION_TOLERANCE = 1e-10;
const EVENT_CURVATURE_TOLERANCE = 1e-13;
const EVENT_MAX_ITERATIONS = 80;
const NTC2018_ULTIMATE_MOMENT_DROP = 0.15;
const DEFAULT_POST_ULTIMATE_MOMENT_DROP = 0.15;
const DEFAULT_MAX_POST_ULTIMATE_CURVATURE_RATIO = 1.2;
const DEFAULT_POST_PEAK_CURVATURE_GROWTH_FACTOR = 1.15;
const DEFAULT_MAX_POST_PEAK_POINTS = 120;
const POST_ULTIMATE_MOMENT_TOLERANCE = 1e-9;

const round = (value, decimals = 12) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function resolveConcreteUltimateCompressionStrain(concreteLaw) {
  const compressionLimit = concreteLaw?.strainLimits?.().compression;

  if (!Number.isFinite(compressionLimit) || compressionLimit === 0) {
    return 0.0035;
  }

  return Math.abs(compressionLimit);
}

function resolveConcretePeakCompressionStrain(concreteLaw) {
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

function resolveSteelYieldStrain(steelLaw) {
  const yieldStrain = steelLaw?.yieldStrain?.();

  if (Number.isFinite(yieldStrain) && yieldStrain > 0) {
    return Math.abs(yieldStrain);
  }

  if (Number.isFinite(steelLaw?.fyd) && Number.isFinite(steelLaw?.Es)) {
    return Math.abs(steelLaw.fyd / steelLaw.Es);
  }

  return null;
}

function resolveSteelUltimateTensionStrain(steelLaw) {
  const tensionLimit = steelLaw?.strainLimits?.().tension;

  return Number.isFinite(tensionLimit) && tensionLimit > 0
    ? Math.abs(tensionLimit)
    : null;
}

function createLinearSamples({ minimum, maximum, count }) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    throw new Error("RCMomentCurvatureAnalyzer requires a valid sample interval.");
  }

  if (!Number.isInteger(count) || count < 2) {
    throw new Error("RCMomentCurvatureAnalyzer requires at least two samples.");
  }

  const step = (maximum - minimum) / (count - 1);

  return Array.from({ length: count }, (_, index) => minimum + step * index);
}

function createCurvatureValues({ curvatureMax, pointCount }) {
  if (!Number.isFinite(curvatureMax) || curvatureMax <= 0) {
    throw new Error("RCMomentCurvatureAnalyzer requires a positive curvatureMax.");
  }

  return createLinearSamples({
    minimum: 0,
    maximum: curvatureMax,
    count: pointCount,
  });
}

function resolveCompressedSide({ compressedSide = null, compressedEdge = "top" }) {
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

function resolveUniaxialCompressedEdge({ theta, compressedSide }) {
  if (neutralAxisDirection(theta).theta !== 0) {
    return null;
  }

  return compressedSide === "positive" ? "top" : "bottom";
}

function buildOrientedStrainField({
  eps0,
  curvature,
  theta,
  compressedSide,
}) {
  const absoluteCurvature = Math.abs(curvature);
  const direction = neutralAxisDirection(theta);
  const sideSign = compressedSide === "positive" ? 1 : -1;

  return new StrainField({
    eps0,
    kappaY: sideSign * absoluteCurvature * direction.sin,
    kappaZ: sideSign * absoluteCurvature * direction.cos,
  });
}

function signedEngineeringCurvature({
  curvature,
  compressedSide = null,
  compressedEdge = "top",
}) {
  const absoluteCurvature = Math.abs(curvature);
  const side = resolveCompressedSide({ compressedSide, compressedEdge });
  return side === "positive" ? absoluteCurvature : -absoluteCurvature;
}

function findBrackets(samples, target) {
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

function bracketDistanceFromHint(bracket, eps0Hint) {
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

function resolveConcreteCompressionEdge({ section, strainField }) {
  return resolveConcreteStrainExtremes({
    section,
    strainField,
  }).compression;
}

function createStateCheck({ id, material, mode, demand, limit }) {
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

function resolveLimitState({
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

function resolveFirstYieldState({
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

function getStateCheck(point, stateKey, checkId) {
  return point?.[stateKey]?.checks?.find((check) => check.id === checkId) ?? null;
}

function annotateEventPoint(point, stateKey, checkId) {
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

function appendUniquePoint(points, point) {
  const previous = points.at(-1);

  if (
    previous &&
    Math.abs(previous.absoluteCurvature - point.absoluteCurvature) <=
      EVENT_CURVATURE_TOLERANCE
  ) {
    points[points.length - 1] = point;
    return;
  }

  points.push(point);
}

function annotateMomentDropPoint(point, { referenceMoment, dropRatio }) {
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

function resolveBalancedFailureGeometry({
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

function neutralAxisY(strainField) {
  if (!Number.isFinite(strainField.kappaZ) || Math.abs(strainField.kappaZ) < 1e-18) {
    return null;
  }

  return strainField.eps0 / strainField.kappaZ;
}

function neutralAxisProjection({ strainField, compressedSide }) {
  const curvature = Math.hypot(strainField.kappaY, strainField.kappaZ);

  if (!Number.isFinite(curvature) || curvature < 1e-18) {
    return null;
  }

  const sideSign = compressedSide === "positive" ? 1 : -1;
  return strainField.eps0 / (sideSign * curvature);
}

function projectedMoment(point) {
  const direction = neutralAxisDirection(point?.theta ?? 0);
  return (point?.Mx ?? 0) * direction.cos + (point?.My ?? 0) * direction.sin;
}

function absoluteMoment(point) {
  return Math.abs(projectedMoment(point));
}

function findMaximumMomentPoint(points) {
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

function interpolateCurvatureAtMomentDrop({
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

function resolveUltimateDuctilityPoint({
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

function resolveNtc2018Ductility({
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

function defaultCurvatureMax({
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

function summarizeStateCheck(check) {
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

/**
 * Moment-curvature solver with the same theta and moment conventions as ULS.
 */
export class RCMomentCurvatureAnalyzer {
  constructor({
    axialRootSolver = new IllinoisRootSolver(),
    limitRootSolver = new IllinoisRootSolver({ tolerance: 1e-8, maxIterations: 60 }),
    sectionIntegrator = new RCSectionStateIntegrator(),
    eps0Samples = 161,
    eps0Min = DEFAULT_EPS0_MIN,
    eps0Max = DEFAULT_EPS0_MAX,
  } = {}) {
    if (!Number.isInteger(eps0Samples) || eps0Samples < 3) {
      throw new Error("RCMomentCurvatureAnalyzer eps0Samples must be at least 3.");
    }

    this.axialRootSolver = axialRootSolver;
    this.limitRootSolver = limitRootSolver;
    this.sectionIntegrator = sectionIntegrator;
    this.eps0Samples = eps0Samples;
    this.eps0Min = eps0Min;
    this.eps0Max = eps0Max;
  }

  solveAtCurvature({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    curvature,
    nEd = 0,
    theta = 0,
    compressedSide = null,
    compressedEdge = "top",
    referencePoint = null,
    includeConcreteTension = false,
    eps0Hint = null,
    postUltimateResponse = "zero-stress",
    postUltimateFractureEnergyDensity = null,
  } = {}) {
    if (!section?.concreteSection) {
      throw new Error("RCMomentCurvatureAnalyzer requires a reinforced concrete section.");
    }

    if (!Array.isArray(concreteFibers)) {
      throw new Error("RCMomentCurvatureAnalyzer requires concrete fibers.");
    }

    if (!Number.isFinite(curvature) || curvature < 0) {
      throw new Error("RCMomentCurvatureAnalyzer requires a non-negative curvature.");
    }

    if (!Number.isFinite(nEd)) {
      throw new Error("RCMomentCurvatureAnalyzer requires a finite axial force.");
    }

    const direction = neutralAxisDirection(theta);
    const resolvedCompressedSide = resolveCompressedSide({
      compressedSide,
      compressedEdge,
    });
    const resolvedCompressedEdge = resolveUniaxialCompressedEdge({
      theta: direction.theta,
      compressedSide: resolvedCompressedSide,
    });
    const resolvedReferencePoint =
      referencePoint ?? section.getReferencePoint("concrete-centroid");
    const evaluateAtEps0 = (eps0) => {
      const strainField = buildOrientedStrainField({
        eps0,
        curvature,
        theta: direction.theta,
        compressedSide: resolvedCompressedSide,
      });
      const state = this.sectionIntegrator.evaluate({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        strainField,
        referencePoint: resolvedReferencePoint,
        includeConcreteTension,
        postUltimateResponse,
        postUltimateFractureEnergyDensity,
      });

      return {
        eps0,
        strainField,
        state,
        residual: state.N - nEd,
      };
    };
    const projectedBounds = getConcreteProjectedBounds(
      section,
      direction.theta,
    );
    const coordinateShift =
      Math.abs(curvature) *
      Math.max(
        Math.abs(projectedBounds.minimum.projection),
        Math.abs(projectedBounds.maximum.projection),
      );
    const sampleMinimum = Math.min(
      this.eps0Min - coordinateShift,
      Number.isFinite(eps0Hint)
        ? eps0Hint - 0.02
        : Number.POSITIVE_INFINITY,
    );
    const sampleMaximum = Math.max(
      this.eps0Max + coordinateShift,
      Number.isFinite(eps0Hint)
        ? eps0Hint + 0.02
        : Number.NEGATIVE_INFINITY,
    );
    const axialSampleCount =
      postUltimateResponse === "retain"
        ? this.eps0Samples
        : Math.max(this.eps0Samples, 401);
    const eps0Samples = createLinearSamples({
      minimum: sampleMinimum,
      maximum: sampleMaximum,
      count: axialSampleCount,
    }).map((eps0) => ({
      eps0,
      value: evaluateAtEps0(eps0).state.N,
    }));
    const brackets = findBrackets(eps0Samples, nEd);
    if (brackets.length === 0) {
      throw new Error(
        "RCMomentCurvatureAnalyzer could not bracket the axial-equilibrium root for the requested curvature.",
      );
    }

    const axialTolerance = Math.max(100, Math.abs(nEd) * 1e-6);
    const orderedBrackets = [...brackets].sort(
      (first, second) =>
        bracketDistanceFromHint(first, eps0Hint) -
        bracketDistanceFromHint(second, eps0Hint),
    );
    const solvedCandidates = [];

    for (
      let index = 0;
      index < Math.min(orderedBrackets.length, 24);
      index += 1
    ) {
      const candidateBracket = orderedBrackets[index];
      const solved =
        candidateBracket.min === candidateBracket.max
          ? {
              converged: true,
              iterations: 0,
              root: candidateBracket.min,
              residual:
                evaluateAtEps0(candidateBracket.min).residual,
              bracket: candidateBracket,
            }
          : this.axialRootSolver.solve({
              fn: (eps0) => evaluateAtEps0(eps0).state.N,
              min: candidateBracket.min,
              max: candidateBracket.max,
              target: nEd,
            });
      const stateAtRoot = evaluateAtEps0(solved.root);
      const candidate = {
        bracket: candidateBracket,
        solved,
        stateAtRoot,
        absoluteResidual: Math.abs(stateAtRoot.residual),
        hintDistance: Number.isFinite(eps0Hint)
          ? Math.abs(stateAtRoot.eps0 - eps0Hint)
          : 0,
      };

      solvedCandidates.push(candidate);

      if (candidate.absoluteResidual <= axialTolerance) {
        break;
      }
    }
    const equilibratedCandidates = solvedCandidates.filter(
      (candidate) => candidate.absoluteResidual <= axialTolerance,
    );
    const candidatesToRank =
      equilibratedCandidates.length > 0
        ? equilibratedCandidates
        : solvedCandidates;
    const selectedCandidate = candidatesToRank.reduce(
      (selected, candidate) => {
        if (selected == null) {
          return candidate;
        }

        if (equilibratedCandidates.length > 0) {
          return candidate.hintDistance < selected.hintDistance
            ? candidate
            : selected;
        }

        return candidate.absoluteResidual < selected.absoluteResidual
          ? candidate
          : selected;
      },
      null,
    );
    const { bracket, solved, stateAtRoot } = selectedCandidate;
    const converged =
      solved.converged &&
      selectedCandidate.absoluteResidual <= axialTolerance;
    const concreteCompressionEdge = {
      ...resolveConcreteCompressionEdge({
        section,
        strainField: stateAtRoot.strainField,
      }),
      edge: resolvedCompressedEdge,
      side: resolvedCompressedSide,
    };
    const limitState = resolveLimitState({
      state: stateAtRoot.state,
      concreteLaw,
      steelLaw,
      concreteCompressionEdge,
    });
    const firstYieldState = resolveFirstYieldState({
      state: stateAtRoot.state,
      concreteLaw,
      steelLaw,
      concreteCompressionEdge,
    });

    return {
      converged,
      theta: direction.theta,
      compressedSide: resolvedCompressedSide,
      curvature: signedEngineeringCurvature({
        curvature,
        compressedSide: resolvedCompressedSide,
        compressedEdge,
      }),
      absoluteCurvature: Math.abs(curvature),
      compressedEdge: resolvedCompressedEdge,
      eps0: stateAtRoot.strainField.eps0,
      kappaY: stateAtRoot.strainField.kappaY,
      kappaZ: stateAtRoot.strainField.kappaZ,
      neutralAxisY: neutralAxisY(stateAtRoot.strainField),
      neutralAxisProjection: neutralAxisProjection({
        strainField: stateAtRoot.strainField,
        compressedSide: resolvedCompressedSide,
      }),
      N: stateAtRoot.state.N,
      Mx: stateAtRoot.state.Mx,
      My: stateAtRoot.state.My,
      projectedMoment:
        stateAtRoot.state.Mx * direction.cos +
        stateAtRoot.state.My * direction.sin,
      axialResidual: stateAtRoot.residual,
      state: stateAtRoot.state,
      postUltimate: stateAtRoot.state.postUltimate,
      concreteCompressionEdge,
      firstYieldState,
      limitState,
      solverReport: {
        method: bracket.min === bracket.max ? "direct-hit" : "illinois",
        iterations: solved.iterations,
        bracket: solved.bracket,
        candidateBracketCount: brackets.length,
        evaluatedBracketCount: solvedCandidates.length,
        residual: stateAtRoot.residual,
        axialTolerance,
      },
    };
  }

  solveBalancedFailurePoint({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd = 0,
    theta = 0,
    compressedSide = null,
    compressedEdge = "top",
    referencePoint = null,
    includeConcreteTension = false,
  } = {}) {
    const geometry = resolveBalancedFailureGeometry({
      section,
      concreteLaw,
      steelLaw,
      theta,
      compressedSide,
      compressedEdge,
    });

    if (!geometry) {
      return null;
    }

    const resolvedCompressedEdge = resolveUniaxialCompressedEdge({
      theta: geometry.theta,
      compressedSide: geometry.compressedSide,
    });
    const resolvedReferencePoint =
      referencePoint ?? section.getReferencePoint("concrete-centroid");
    const strainField = new StrainField({
      eps0: geometry.eps0,
      kappaY: geometry.kappaY,
      kappaZ: geometry.kappaZ,
    });
    const state = this.sectionIntegrator.evaluate({
      section,
      concreteFibers,
      concreteLaw,
      steelLaw,
      strainField,
      referencePoint: resolvedReferencePoint,
      includeConcreteTension,
      postUltimateResponse: "retain",
    });
    const concreteCompressionEdge = {
      ...resolveConcreteCompressionEdge({
        section,
        strainField,
      }),
      edge: resolvedCompressedEdge,
      side: geometry.compressedSide,
    };
    const firstYieldState = resolveFirstYieldState({
      state,
      concreteLaw,
      steelLaw,
      concreteCompressionEdge,
    });
    const limitState = resolveLimitState({
      state,
      concreteLaw,
      steelLaw,
      concreteCompressionEdge,
    });
    const concreteCheck = getStateCheck(
      { limitState },
      "limitState",
      "concrete-compression-strain",
    );
    const steelCheck = getStateCheck(
      { limitState },
      "limitState",
      "steel-tension-strain",
    );
    const axialResidual = state.N - nEd;
    const axialTolerance = Math.max(10, Math.abs(nEd) * 1e-6);

    return {
      converged: true,
      theta: geometry.theta,
      compressedSide: geometry.compressedSide,
      curvature: signedEngineeringCurvature({
        curvature: geometry.absoluteCurvature,
        compressedSide: geometry.compressedSide,
        compressedEdge,
      }),
      absoluteCurvature: geometry.absoluteCurvature,
      compressedEdge: resolvedCompressedEdge,
      eps0: strainField.eps0,
      kappaY: strainField.kappaY,
      kappaZ: strainField.kappaZ,
      neutralAxisY: neutralAxisY(strainField),
      neutralAxisProjection: neutralAxisProjection({
        strainField,
        compressedSide: geometry.compressedSide,
      }),
      N: state.N,
      Mx: state.Mx,
      My: state.My,
      projectedMoment:
        state.Mx * Math.cos(geometry.theta) +
        state.My * Math.sin(geometry.theta),
      axialResidual,
      state,
      concreteCompressionEdge,
      firstYieldState,
      limitState,
      failureMode: "balanced-concrete-steel",
      balancedFailureState: {
        reached:
          concreteCheck != null &&
          steelCheck != null &&
          Math.abs(concreteCheck.utilizationRatio - 1) <= LIMIT_TOLERANCE &&
          Math.abs(steelCheck.utilizationRatio - 1) <= LIMIT_TOLERANCE,
        concrete: concreteCheck,
        steel: steelCheck,
        effectiveDepth: geometry.effectiveDepth,
        neutralAxisDepth: geometry.neutralAxisDepth,
        compressedEdgeProjection: geometry.compressedEdgeProjection,
        tensionReinforcementProjection:
          geometry.tensionReinforcementProjection,
        compressedEdgeY: geometry.compressedEdgeY,
        tensionReinforcementY: geometry.tensionReinforcementY,
        assignedAxialForce: nEd,
        balancedAxialForce: state.N,
        axialResidual,
        compatibleWithAssignedAxialForce: Math.abs(axialResidual) <= axialTolerance,
      },
      solverReport: {
        method: "closed-form-balanced-strain-compatibility",
        iterations: 0,
        residual: axialResidual,
      },
    };
  }

  analyze({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd = 0,
    theta = 0,
    compressedSide = null,
    compressedEdge = "top",
    curvatureMax = null,
    curvatureValues = null,
    pointCount = 41,
    referencePoint = null,
    includeConcreteTension = false,
    stopAtFailure = false,
    includeFailurePoint = true,
    postUltimateMomentDrop = null,
    maxPostUltimateCurvatureRatio =
      DEFAULT_MAX_POST_ULTIMATE_CURVATURE_RATIO,
    postPeakMomentDrop = null,
    postUltimateResponse = "zero-stress",
    postUltimateFractureEnergyDensity = null,
    postPeakCurvatureGrowthFactor =
      DEFAULT_POST_PEAK_CURVATURE_GROWTH_FACTOR,
    maxPostPeakPoints = DEFAULT_MAX_POST_PEAK_POINTS,
  } = {}) {
    const direction = neutralAxisDirection(theta);
    const resolvedCompressedSide = resolveCompressedSide({
      compressedSide,
      compressedEdge,
    });
    const resolvedCompressedEdge = resolveUniaxialCompressedEdge({
      theta: direction.theta,
      compressedSide: resolvedCompressedSide,
    });
    const resolvedPostUltimateMomentDrop =
      postUltimateMomentDrop ??
      postPeakMomentDrop ??
      DEFAULT_POST_ULTIMATE_MOMENT_DROP;

    if (
      !Number.isFinite(resolvedPostUltimateMomentDrop) ||
      resolvedPostUltimateMomentDrop <= 0 ||
      resolvedPostUltimateMomentDrop >= 1
    ) {
      throw new Error(
        "RCMomentCurvatureAnalyzer postUltimateMomentDrop must be between 0 and 1.",
      );
    }

    if (
      !Number.isFinite(maxPostUltimateCurvatureRatio) ||
      maxPostUltimateCurvatureRatio <= 1
    ) {
      throw new Error(
        "RCMomentCurvatureAnalyzer maxPostUltimateCurvatureRatio must be greater than 1.",
      );
    }

    if (
      !["retain", "linear-softening", "zero-stress"].includes(
        postUltimateResponse,
      )
    ) {
      throw new Error(
        `Unsupported RC post-ultimate response: ${postUltimateResponse}.`,
      );
    }

    if (
      !Number.isFinite(postPeakCurvatureGrowthFactor) ||
      postPeakCurvatureGrowthFactor <= 1
    ) {
      throw new Error(
        "RCMomentCurvatureAnalyzer postPeakCurvatureGrowthFactor must be greater than 1.",
      );
    }

    if (!Number.isInteger(maxPostPeakPoints) || maxPostPeakPoints < 1) {
      throw new Error(
        "RCMomentCurvatureAnalyzer maxPostPeakPoints must be a positive integer.",
      );
    }

    const normalizedFractureEnergyDensity =
      normalizePostUltimateFractureEnergyDensity(
        postUltimateFractureEnergyDensity,
      );

    if (
      postUltimateResponse === "linear-softening" &&
      normalizedFractureEnergyDensity.concrete <= 0 &&
      normalizedFractureEnergyDensity.steel <= 0
    ) {
      throw new Error(
        "RCMomentCurvatureAnalyzer linear softening requires a positive postUltimateFractureEnergyDensity.",
      );
    }

    const warnings = [];
    let balancedFailurePoint = null;

    try {
      balancedFailurePoint = this.solveBalancedFailurePoint({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        nEd,
        theta: direction.theta,
        compressedSide: resolvedCompressedSide,
        compressedEdge,
        referencePoint,
        includeConcreteTension,
      });
    } catch (error) {
      warnings.push(error.message);
    }

    const initialCurvatureMax =
      curvatureMax ?? defaultCurvatureMax({
        section,
        concreteLaw,
        steelLaw,
        theta: direction.theta,
        compressedSide: resolvedCompressedSide,
        compressedEdge,
      });
    const usesExplicitCurvatureValues =
      Array.isArray(curvatureValues) && curvatureValues.length >= 2;
    const values = usesExplicitCurvatureValues
      ? [...curvatureValues]
      : createCurvatureValues({
          curvatureMax: initialCurvatureMax,
          pointCount,
        });
    const requestedPointCount = values.length;
    const automaticPostPeakExtension =
      curvatureMax == null &&
      !usesExplicitCurvatureValues &&
      !stopAtFailure;
    const balancedCurvature =
      balancedFailurePoint?.absoluteCurvature ?? initialCurvatureMax;
    const maximumAutomaticCurvature =
      Math.max(initialCurvatureMax, balancedCurvature) *
      postPeakCurvatureGrowthFactor ** maxPostPeakPoints;
    const points = [];

    let previousPoint = null;
    let failurePoint = null;
    let firstYieldPoint = null;
    let balancedCurvaturePoint = null;
    let postUltimateTerminationPoint = null;
    let postPeakDropPoint = null;
    let postPeakPointCount = 0;
    let phiMaterialUltimate = null;
    let materialUltimateMoment = null;
    let postUltimateCurvatureLimit = null;
    let terminationReason = "curvature-range-completed";

    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const curvature = values[valueIndex];
      let point;
      const usePostUltimateResponse =
        failurePoint != null && !stopAtFailure;

      try {
        point = this.solveAtCurvature({
          section,
          concreteFibers,
          concreteLaw,
          steelLaw,
          curvature: Math.abs(curvature),
          nEd,
          theta: direction.theta,
          compressedSide: resolvedCompressedSide,
          compressedEdge,
          referencePoint,
          includeConcreteTension,
          eps0Hint: previousPoint?.eps0 ?? null,
          postUltimateResponse: usePostUltimateResponse
            ? postUltimateResponse
            : "retain",
          postUltimateFractureEnergyDensity:
            normalizedFractureEnergyDensity,
        });
      } catch (error) {
        warnings.push(error.message);
        terminationReason = "axial-equilibrium-not-found";
        break;
      }

      let intervalFirstYieldPoint = null;
      let intervalFailurePoint = null;

      if (!firstYieldPoint && point.firstYieldState.reached) {
        if (previousPoint) {
          try {
            intervalFirstYieldPoint = this.findFirstYieldPoint({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              nEd,
              theta: direction.theta,
              compressedSide: resolvedCompressedSide,
              compressedEdge,
              referencePoint,
              includeConcreteTension,
              minCurvature: previousPoint.absoluteCurvature,
              maxCurvature: point.absoluteCurvature,
              postUltimateResponse: "retain",
            });
          } catch (error) {
            warnings.push(error.message);
            const fallbackCheck = point.firstYieldState.reachedChecks[0];
            intervalFirstYieldPoint = fallbackCheck
              ? annotateEventPoint(
                  point,
                  "firstYieldState",
                  fallbackCheck.id,
                )
              : point;
          }
        } else {
          const firstCheck = point.firstYieldState.reachedChecks[0];
          intervalFirstYieldPoint = firstCheck
            ? annotateEventPoint(point, "firstYieldState", firstCheck.id)
            : point;
        }

        firstYieldPoint = intervalFirstYieldPoint;
      }

      if (
        !failurePoint &&
        point.limitState.reached &&
        previousPoint
      ) {
        try {
          intervalFailurePoint = this.findFailurePoint({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            nEd,
            theta: direction.theta,
            compressedSide: resolvedCompressedSide,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            minCurvature: previousPoint.absoluteCurvature,
            maxCurvature: point.absoluteCurvature,
            postUltimateResponse: "retain",
          });
        } catch (error) {
          warnings.push(error.message);
          const fallbackCheck = point.limitState.reachedChecks[0];
          intervalFailurePoint = fallbackCheck
            ? annotateEventPoint(point, "limitState", fallbackCheck.id)
            : point;
        }
      } else if (!failurePoint && point.limitState.reached) {
        const firstCheck = point.limitState.reachedChecks[0];
        intervalFailurePoint = firstCheck
          ? annotateEventPoint(point, "limitState", firstCheck.id)
          : point;
      }

      if (
        intervalFirstYieldPoint &&
        (!intervalFailurePoint ||
          intervalFirstYieldPoint.absoluteCurvature <=
            intervalFailurePoint.absoluteCurvature)
      ) {
        appendUniquePoint(points, intervalFirstYieldPoint);
      }

      if (intervalFailurePoint) {
        failurePoint = intervalFailurePoint;
        phiMaterialUltimate = Number.isFinite(
          intervalFailurePoint.absoluteCurvature,
        )
          ? intervalFailurePoint.absoluteCurvature
          : null;
        materialUltimateMoment = Number.isFinite(
          absoluteMoment(intervalFailurePoint),
        )
          ? absoluteMoment(intervalFailurePoint)
          : null;
        postUltimateCurvatureLimit =
          phiMaterialUltimate != null &&
          phiMaterialUltimate > EVENT_CURVATURE_TOLERANCE
            ? maxPostUltimateCurvatureRatio * phiMaterialUltimate
            : null;

        if (includeFailurePoint) {
          appendUniquePoint(points, intervalFailurePoint);
        }
      }

      if (intervalFailurePoint && stopAtFailure) {
        if (!includeFailurePoint) {
          appendUniquePoint(points, intervalFailurePoint);
        }
        terminationReason = "first-material-ultimate-strain";
        break;
      }

      if (
        intervalFailurePoint &&
        postUltimateCurvatureLimit == null &&
        (materialUltimateMoment == null ||
          materialUltimateMoment <= POST_ULTIMATE_MOMENT_TOLERANCE)
      ) {
        if (!includeFailurePoint) {
          appendUniquePoint(points, intervalFailurePoint);
        }
        warnings.push(
          "Post-ultimate continuation cannot be evaluated because both Mu and phiMaterialUltimate are null or too close to zero.",
        );
        terminationReason = "post-ultimate-reference-unavailable";
        break;
      }

      if (
        intervalFailurePoint &&
        point.absoluteCurvature >
          intervalFailurePoint.absoluteCurvature + EVENT_CURVATURE_TOLERANCE
      ) {
        try {
          point = this.solveAtCurvature({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            curvature: point.absoluteCurvature,
            nEd,
            theta: direction.theta,
            compressedSide: resolvedCompressedSide,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            eps0Hint: intervalFailurePoint.eps0,
            postUltimateResponse,
            postUltimateFractureEnergyDensity:
              normalizedFractureEnergyDensity,
          });
        } catch (error) {
          warnings.push(error.message);
          terminationReason = "axial-equilibrium-not-found";
          break;
        }
      }

      let resolvedPointThisStep = point;
      const postUltimateLowerPoint =
        intervalFailurePoint ?? (failurePoint == null ? null : previousPoint);
      const momentCriterionAvailable =
        materialUltimateMoment != null &&
        materialUltimateMoment > POST_ULTIMATE_MOMENT_TOLERANCE;
      const targetMoment = momentCriterionAvailable
        ? (1 - resolvedPostUltimateMomentDrop) *
          materialUltimateMoment
        : null;
      const reachesPostUltimateCurvatureLimit =
        failurePoint != null &&
        postUltimateCurvatureLimit != null &&
        point.absoluteCurvature >=
          postUltimateCurvatureLimit - EVENT_CURVATURE_TOLERANCE;

      if (
        reachesPostUltimateCurvatureLimit &&
        Math.abs(
          point.absoluteCurvature - postUltimateCurvatureLimit,
        ) > EVENT_CURVATURE_TOLERANCE
      ) {
        try {
          resolvedPointThisStep = this.solveAtCurvature({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            curvature: postUltimateCurvatureLimit,
            nEd,
            theta: direction.theta,
            compressedSide: resolvedCompressedSide,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            eps0Hint:
              postUltimateLowerPoint?.eps0 ??
              failurePoint?.eps0 ??
              null,
            postUltimateResponse,
            postUltimateFractureEnergyDensity:
              normalizedFractureEnergyDensity,
          });
        } catch (error) {
          warnings.push(error.message);
          terminationReason = "axial-equilibrium-not-found";
          break;
        }
      }

      const crossesPostUltimateMomentTarget =
        failurePoint != null &&
        postUltimateLowerPoint != null &&
        targetMoment != null &&
        absoluteMoment(resolvedPointThisStep) <
          absoluteMoment(postUltimateLowerPoint) &&
        absoluteMoment(postUltimateLowerPoint) >= targetMoment &&
        absoluteMoment(resolvedPointThisStep) <= targetMoment;

      if (crossesPostUltimateMomentTarget) {
        try {
          postPeakDropPoint = this.findMomentDropPoint({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            nEd,
            theta: direction.theta,
            compressedSide: resolvedCompressedSide,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            postUltimateResponse,
            postUltimateFractureEnergyDensity:
              normalizedFractureEnergyDensity,
            lowerPoint: postUltimateLowerPoint,
            upperPoint: resolvedPointThisStep,
            referenceMoment: materialUltimateMoment,
            dropRatio: resolvedPostUltimateMomentDrop,
          });
        } catch (error) {
          warnings.push(error.message);
          postPeakDropPoint = annotateMomentDropPoint(
            resolvedPointThisStep,
            {
              referenceMoment: materialUltimateMoment,
              dropRatio: resolvedPostUltimateMomentDrop,
            },
          );
        }

        resolvedPointThisStep = postPeakDropPoint;
        postUltimateTerminationPoint = postPeakDropPoint;
        terminationReason = "post-ultimate-moment-drop";
      }

      appendUniquePoint(points, resolvedPointThisStep);

      if (
        balancedCurvaturePoint == null &&
        resolvedPointThisStep.absoluteCurvature >=
          balancedCurvature - EVENT_CURVATURE_TOLERANCE
      ) {
        if (
          Math.abs(
            resolvedPointThisStep.absoluteCurvature - balancedCurvature,
          ) <= EVENT_CURVATURE_TOLERANCE
        ) {
          balancedCurvaturePoint = resolvedPointThisStep;
        } else if (
          previousPoint &&
          previousPoint.absoluteCurvature < balancedCurvature
        ) {
          try {
            balancedCurvaturePoint = this.solveAtCurvature({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              curvature: balancedCurvature,
              nEd,
              theta: direction.theta,
              compressedSide: resolvedCompressedSide,
              compressedEdge,
              referencePoint,
              includeConcreteTension,
              eps0Hint: previousPoint.eps0,
              postUltimateResponse,
              postUltimateFractureEnergyDensity:
                normalizedFractureEnergyDensity,
            });
          } catch (error) {
            warnings.push(error.message);
          }
        }
      }

      if (postUltimateTerminationPoint) {
        previousPoint = resolvedPointThisStep;
        break;
      }

      if (reachesPostUltimateCurvatureLimit) {
        postUltimateTerminationPoint = resolvedPointThisStep;
        terminationReason = "post-ultimate-curvature-limit";
        previousPoint = resolvedPointThisStep;
        break;
      }

      previousPoint = resolvedPointThisStep;

      if (
        valueIndex === values.length - 1 &&
        automaticPostPeakExtension
      ) {
        if (postPeakPointCount >= maxPostPeakPoints) {
          warnings.push(
            "Post-ultimate continuation reached maxPostPeakPoints before a termination criterion.",
          );
          terminationReason = "maximum-post-peak-point-count";
          break;
        }

        const nextCurvature = Math.max(
          point.absoluteCurvature * postPeakCurvatureGrowthFactor,
          point.absoluteCurvature +
            initialCurvatureMax / Math.max(pointCount - 1, 1),
        );

        if (nextCurvature > maximumAutomaticCurvature) {
          warnings.push(
            "Post-ultimate continuation reached the automatic curvature guard before a termination criterion.",
          );
          terminationReason = "maximum-automatic-curvature";
          break;
        }

        values.push(nextCurvature);
        postPeakPointCount += 1;
      }
    }

    const maximum = findMaximumMomentPoint(points);
    const finalCurvature = points.at(-1)?.absoluteCurvature ?? initialCurvatureMax;

    return {
      nEd,
      theta: direction.theta,
      compressedSide: resolvedCompressedSide,
      compressedEdge: resolvedCompressedEdge,
      curvatureMax: finalCurvature,
      initialCurvatureMax,
      balancedCurvature,
      pointCount: requestedPointCount,
      analyzedPointCount: values.length,
      generatedPointCount: points.length,
      failureReached: failurePoint != null,
      failurePoint,
      failureMode: failurePoint?.limitState?.eventType ?? null,
      materialUltimateReached: failurePoint != null,
      materialUltimatePoint: failurePoint,
      materialUltimateType:
        failurePoint?.limitState?.eventType ?? null,
      phiMaterialUltimate,
      Mu: materialUltimateMoment,
      balancedFailureReached: balancedFailurePoint != null,
      balancedFailurePoint,
      balancedCurvaturePoint,
      firstYieldReached: firstYieldPoint != null,
      firstYieldPoint,
      firstYieldType: firstYieldPoint?.firstYieldState?.eventType ?? null,
      maximumMomentPoint: maximum?.point ?? null,
      postUltimateMomentDrop: resolvedPostUltimateMomentDrop,
      maxPostUltimateCurvatureRatio,
      postUltimateCurvatureLimit,
      postUltimateTerminationReached:
        postUltimateTerminationPoint != null,
      postUltimateTerminationPoint,
      postUltimateMomentDropReached:
        terminationReason === "post-ultimate-moment-drop",
      postUltimateCurvatureLimitReached:
        terminationReason === "post-ultimate-curvature-limit",
      // Legacy aliases retained for backward compatibility.
      postPeakMomentDrop: resolvedPostUltimateMomentDrop,
      postPeakDropReached: postPeakDropPoint != null,
      postPeakDropPoint,
      postUltimateModel: {
        response: postUltimateResponse,
        fractureEnergyDensity:
          postUltimateResponse === "linear-softening"
            ? normalizedFractureEnergyDensity
            : {
                concrete: 0,
                steel: 0,
              },
        fractureEnergyDensityUnits: "N/mm2",
        fractureEnergyInterpretation: "energy-per-unit-volume",
      },
      terminationReason,
      ntc2018Ductility: resolveNtc2018Ductility({
        points,
        firstYieldPoint,
        failurePoint,
        compressedEdge,
      }),
      warnings,
      points,
    };
  }

  findMomentDropPoint({
    lowerPoint,
    upperPoint,
    referenceMoment = null,
    maximumMoment,
    dropRatio,
    ...options
  }) {
    const resolvedReferenceMoment = referenceMoment ?? maximumMoment;
    const targetMoment = (1 - dropRatio) * resolvedReferenceMoment;

    if (
      !Number.isFinite(resolvedReferenceMoment) ||
      resolvedReferenceMoment <= POST_ULTIMATE_MOMENT_TOLERANCE ||
      !lowerPoint ||
      !upperPoint ||
      lowerPoint.absoluteCurvature >= upperPoint.absoluteCurvature ||
      absoluteMoment(lowerPoint) < targetMoment ||
      absoluteMoment(upperPoint) > targetMoment
    ) {
      throw new Error(
        "RCMomentCurvatureAnalyzer requires a valid post-ultimate moment-drop bracket.",
      );
    }

    let lower = lowerPoint;
    let upper = upperPoint;

    for (
      let iteration = 0;
      iteration < EVENT_MAX_ITERATIONS;
      iteration += 1
    ) {
      const lowerMoment = absoluteMoment(lower);
      const upperMoment = absoluteMoment(upper);
      const denominator = lowerMoment - upperMoment;
      const linearRatio =
        denominator > 0
          ? (lowerMoment - targetMoment) / denominator
          : 0.5;
      const boundedRatio = Math.max(0.1, Math.min(0.9, linearRatio));
      const curvature =
        lower.absoluteCurvature +
        boundedRatio *
          (upper.absoluteCurvature - lower.absoluteCurvature);
      const eps0Hint =
        lower.eps0 + boundedRatio * (upper.eps0 - lower.eps0);
      const point = this.solveAtCurvature({
        ...options,
        curvature,
        eps0Hint,
      });
      const moment = absoluteMoment(point);

      if (moment > targetMoment) {
        lower = point;
      } else {
        upper = point;
      }

      if (
        Math.abs(moment - targetMoment) <=
          Math.max(1, resolvedReferenceMoment * 1e-8) ||
        upper.absoluteCurvature - lower.absoluteCurvature <=
          EVENT_CURVATURE_TOLERANCE
      ) {
        break;
      }
    }

    return annotateMomentDropPoint(upper, {
      referenceMoment: resolvedReferenceMoment,
      dropRatio,
    });
  }

  findFirstYieldPoint({
    minCurvature,
    maxCurvature,
    ...options
  }) {
    return this.findEventPoint({
      minCurvature,
      maxCurvature,
      stateKey: "firstYieldState",
      ...options,
    });
  }

  findFailurePoint({
    minCurvature,
    maxCurvature,
    ...options
  }) {
    return this.findEventPoint({
      minCurvature,
      maxCurvature,
      stateKey: "limitState",
      ...options,
    });
  }

  findEventPoint({
    minCurvature,
    maxCurvature,
    stateKey,
    ...options
  }) {
    if (
      !Number.isFinite(minCurvature) ||
      !Number.isFinite(maxCurvature) ||
      minCurvature < 0 ||
      minCurvature >= maxCurvature
    ) {
      throw new Error(
        "RCMomentCurvatureAnalyzer requires a valid event-curvature bracket.",
      );
    }

    const cache = new Map();
    const solve = (curvature) => {
      const key = curvature.toPrecision(17);

      if (!cache.has(key)) {
        cache.set(
          key,
          this.solveAtCurvature({
            ...options,
            curvature,
          }),
        );
      }

      return cache.get(key);
    };
    const lowerPoint = solve(minCurvature);
    const upperPoint = solve(maxCurvature);
    const utilizationTolerance = Math.min(
      EVENT_UTILIZATION_TOLERANCE,
      this.limitRootSolver.tolerance,
    );
    const maxIterations = Math.max(
      EVENT_MAX_ITERATIONS,
      this.limitRootSolver.maxIterations,
    );
    const candidateIds = upperPoint[stateKey].checks
      .filter((upperCheck) => {
        const lowerCheck = getStateCheck(lowerPoint, stateKey, upperCheck.id);
        return (
          upperCheck.utilizationRatio >= 1 &&
          (lowerCheck?.utilizationRatio ?? 0) < 1
        );
      })
      .map((check) => check.id);

    if (candidateIds.length === 0) {
      const alreadyReached = lowerPoint[stateKey].checks.find(
        (check) => check.utilizationRatio >= 1,
      );

      if (alreadyReached) {
        return annotateEventPoint(lowerPoint, stateKey, alreadyReached.id);
      }

      throw new Error(
        `RCMomentCurvatureAnalyzer could not bracket a ${stateKey} event.`,
      );
    }

    const candidates = candidateIds.map((checkId) => {
      let lowerCurvature = minCurvature;
      let upperCurvature = maxCurvature;
      let lower = lowerPoint;
      let upper = upperPoint;

      for (
        let iteration = 0;
        iteration < maxIterations;
        iteration += 1
      ) {
        const middleCurvature = 0.5 * (lowerCurvature + upperCurvature);
        const middle = solve(middleCurvature);
        const middleCheck = getStateCheck(middle, stateKey, checkId);

        if (!middleCheck) {
          throw new Error(
            `RCMomentCurvatureAnalyzer could not evaluate event ${checkId}.`,
          );
        }

        if (middleCheck.utilizationRatio >= 1) {
          upperCurvature = middleCurvature;
          upper = middle;
        } else {
          lowerCurvature = middleCurvature;
          lower = middle;
        }

        const upperCheck = getStateCheck(upper, stateKey, checkId);
        const interval = upperCurvature - lowerCurvature;

        if (
          interval <= EVENT_CURVATURE_TOLERANCE ||
          Math.abs((upperCheck?.utilizationRatio ?? 0) - 1) <=
            utilizationTolerance
        ) {
          break;
        }
      }

      return annotateEventPoint(upper, stateKey, checkId);
    });

    return candidates.reduce((earliest, candidate) =>
      earliest == null ||
      candidate.absoluteCurvature < earliest.absoluteCurvature
        ? candidate
        : earliest,
    null);
  }

  static summarizePoint(point) {
    return {
      converged: point.converged,
      theta: round(point.theta, 12),
      compressedSide: point.compressedSide ?? null,
      curvature: round(point.curvature),
      absoluteCurvature: round(point.absoluteCurvature),
      eps0: round(point.eps0),
      kappaY: round(point.kappaY),
      kappaZ: round(point.kappaZ),
      neutralAxisY: round(point.neutralAxisY, 6),
      neutralAxisProjection: round(point.neutralAxisProjection, 6),
      N: round(point.N, 6),
      Mx: round(point.Mx, 6),
      My: round(point.My, 6),
      projectedMoment: round(
        point.projectedMoment ?? projectedMoment(point),
        6,
      ),
      axialResidual: round(point.axialResidual, 6),
      failureMode: point.failureMode ?? point.limitState?.eventType ?? null,
      postUltimate:
        point.postUltimate == null
          ? null
          : {
              response: point.postUltimate.response,
              fractureEnergyDensity:
                point.postUltimate.fractureEnergyDensity,
              fractureEnergyDensityUnits:
                point.postUltimate.fractureEnergyDensityUnits,
              fractureEnergyInterpretation:
                point.postUltimate.fractureEnergyInterpretation,
              concreteFiberCount:
                point.postUltimate.concreteFiberCount,
              steelBarCount: point.postUltimate.steelBarCount,
              active: point.postUltimate.active,
            },
      postUltimateState:
        point.postUltimateState == null
          ? null
          : {
              referenceMoment: round(
                point.postUltimateState.referenceMoment,
                6,
              ),
              reference: point.postUltimateState.reference,
              targetMoment: round(
                point.postUltimateState.targetMoment,
                6,
              ),
              moment: round(point.postUltimateState.moment, 6),
              targetDropRatio: round(
                point.postUltimateState.targetDropRatio,
                6,
              ),
              actualDropRatio: round(
                point.postUltimateState.actualDropRatio,
                6,
              ),
              reached: point.postUltimateState.reached,
            },
      postPeakState:
        point.postPeakState == null
          ? null
          : {
              maximumMoment: round(
                point.postPeakState.maximumMoment,
                6,
              ),
              targetMoment: round(point.postPeakState.targetMoment, 6),
              moment: round(point.postPeakState.moment, 6),
              targetDropRatio: round(
                point.postPeakState.targetDropRatio,
                6,
              ),
              actualDropRatio: round(
                point.postPeakState.actualDropRatio,
                6,
              ),
              reached: point.postPeakState.reached,
            },
      firstYieldState: {
        reached: point.firstYieldState.reached,
        eventType: point.firstYieldState.eventType ?? null,
        eventMaterial: point.firstYieldState.eventMaterial ?? null,
        eventMode: point.firstYieldState.eventMode ?? null,
        event: summarizeStateCheck(point.firstYieldState.event),
        governing: summarizeStateCheck(point.firstYieldState.governing),
      },
      limitState: {
        reached: point.limitState.reached,
        eventType: point.limitState.eventType ?? null,
        eventMaterial: point.limitState.eventMaterial ?? null,
        eventMode: point.limitState.eventMode ?? null,
        event: summarizeStateCheck(point.limitState.event),
        governing: summarizeStateCheck(point.limitState.governing),
      },
      extremes: {
        minStrain: round(point.state.extremes.minStrain),
        maxStrain: round(point.state.extremes.maxStrain),
        concreteCompressionEdge:
          point.concreteCompressionEdge == null
            ? null
            : {
                edge: point.concreteCompressionEdge.edge,
                side: point.concreteCompressionEdge.side ?? null,
                strain: round(point.concreteCompressionEdge.strain),
                demand: round(point.concreteCompressionEdge.demand),
                y: round(point.concreteCompressionEdge.y, 6),
                z: round(point.concreteCompressionEdge.z, 6),
              },
        maxConcreteCompression:
          point.state.extremes.maxConcreteCompression == null
            ? null
            : {
                value: round(point.state.extremes.maxConcreteCompression.value, 6),
                strain: round(point.state.extremes.maxConcreteCompression.strain),
                y: round(point.state.extremes.maxConcreteCompression.y, 6),
                z: round(point.state.extremes.maxConcreteCompression.z, 6),
              },
        maxSteelTension:
          point.state.extremes.maxSteelTension == null
            ? null
            : {
                value: round(point.state.extremes.maxSteelTension.value, 6),
                strain: round(point.state.extremes.maxSteelTension.strain),
                y: round(point.state.extremes.maxSteelTension.y, 6),
                z: round(point.state.extremes.maxSteelTension.z, 6),
              },
        maxSteelTensionStrain:
          point.state.extremes.maxSteelTensionStrain == null
            ? null
            : {
                value: round(
                  point.state.extremes.maxSteelTensionStrain.stress,
                  6,
                ),
                strain: round(
                  point.state.extremes.maxSteelTensionStrain.strain,
                ),
                id: point.state.extremes.maxSteelTensionStrain.id,
                y: round(point.state.extremes.maxSteelTensionStrain.y, 6),
                z: round(point.state.extremes.maxSteelTensionStrain.z, 6),
              },
        maxSteelCompressionStrain:
          point.state.extremes.maxSteelCompressionStrain == null
            ? null
            : {
                value: round(
                  point.state.extremes.maxSteelCompressionStrain.stress,
                  6,
                ),
                strain: round(
                  point.state.extremes.maxSteelCompressionStrain.strain,
                ),
                id: point.state.extremes.maxSteelCompressionStrain.id,
                y: round(point.state.extremes.maxSteelCompressionStrain.y, 6),
                z: round(point.state.extremes.maxSteelCompressionStrain.z, 6),
              },
      },
      balancedFailureState:
        point.balancedFailureState == null
          ? null
          : {
              reached: point.balancedFailureState.reached,
              concrete: summarizeStateCheck(
                point.balancedFailureState.concrete,
              ),
              steel: summarizeStateCheck(point.balancedFailureState.steel),
              effectiveDepth: round(
                point.balancedFailureState.effectiveDepth,
                6,
              ),
              neutralAxisDepth: round(
                point.balancedFailureState.neutralAxisDepth,
                6,
              ),
              compressedEdgeProjection: round(
                point.balancedFailureState.compressedEdgeProjection,
                6,
              ),
              tensionReinforcementProjection: round(
                point.balancedFailureState.tensionReinforcementProjection,
                6,
              ),
              compressedEdgeY: round(
                point.balancedFailureState.compressedEdgeY,
                6,
              ),
              tensionReinforcementY: round(
                point.balancedFailureState.tensionReinforcementY,
                6,
              ),
              assignedAxialForce: round(
                point.balancedFailureState.assignedAxialForce,
                6,
              ),
              balancedAxialForce: round(
                point.balancedFailureState.balancedAxialForce,
                6,
              ),
              axialResidual: round(
                point.balancedFailureState.axialResidual,
                6,
              ),
              compatibleWithAssignedAxialForce:
                point.balancedFailureState.compatibleWithAssignedAxialForce,
            },
    };
  }

  static summarizeDuctility(ductility) {
    if (ductility == null) {
      return null;
    }

    return {
      reference: ductility.reference,
      phiPrimeYd: round(ductility.phiPrimeYd),
      mPrimeYd: round(ductility.mPrimeYd, 6),
      mRd: round(ductility.mRd, 6),
      phiYd: round(ductility.phiYd),
      phiU: round(ductility.phiU),
      curvatureDuctilityRatio: round(ductility.curvatureDuctilityRatio, 6),
      ultimateMomentDropRatio: round(
        ductility.ultimateMomentDropRatio,
        6,
      ),
      firstYieldGoverning: ductility.firstYieldGoverning,
      ultimateCurvatureSource: ductility.ultimateCurvatureSource,
      firstYieldPoint:
        ductility.firstYieldPoint == null
          ? null
          : RCMomentCurvatureAnalyzer.summarizePoint(ductility.firstYieldPoint),
      maximumMomentPoint:
        ductility.maximumMomentPoint == null
          ? null
          : RCMomentCurvatureAnalyzer.summarizePoint(ductility.maximumMomentPoint),
      momentDropPoint:
        ductility.momentDropPoint == null
          ? null
          : {
              absoluteCurvature: round(
                ductility.momentDropPoint.absoluteCurvature,
              ),
              curvature: round(ductility.momentDropPoint.curvature),
              Mx: round(ductility.momentDropPoint.Mx, 6),
              My: round(ductility.momentDropPoint.My, 6),
              source: ductility.momentDropPoint.source,
              interpolation: ductility.momentDropPoint.interpolation,
            },
      materialUltimatePoint:
        ductility.materialUltimatePoint == null
          ? null
          : {
              absoluteCurvature: round(
                ductility.materialUltimatePoint.absoluteCurvature,
              ),
              curvature: round(
                ductility.materialUltimatePoint.curvature,
              ),
              Mx: round(ductility.materialUltimatePoint.Mx, 6),
              My: round(ductility.materialUltimatePoint.My, 6),
              source: ductility.materialUltimatePoint.source,
              interpolation:
                ductility.materialUltimatePoint.interpolation,
            },
      ultimatePoint:
        ductility.ultimatePoint == null
          ? null
          : {
              absoluteCurvature: round(ductility.ultimatePoint.absoluteCurvature),
              curvature: round(ductility.ultimatePoint.curvature),
              Mx: round(ductility.ultimatePoint.Mx, 6),
              My: round(ductility.ultimatePoint.My, 6),
              source: ductility.ultimatePoint.source,
              interpolation: ductility.ultimatePoint.interpolation,
            },
    };
  }
}
