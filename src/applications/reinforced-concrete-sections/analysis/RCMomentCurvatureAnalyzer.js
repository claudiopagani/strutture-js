import { IllinoisRootSolver } from "../../../domain/solvers/IllinoisRootSolver.js";
import { RCSectionStateIntegrator } from "./RCSectionStateIntegrator.js";
import { StrainField } from "./StrainField.js";

const DEFAULT_EPS0_MIN = -0.08;
const DEFAULT_EPS0_MAX = 0.08;
const LIMIT_TOLERANCE = 1e-9;

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

function buildUniaxialStrainField({ eps0, curvature, compressedEdge }) {
  const absoluteCurvature = Math.abs(curvature);

  if (compressedEdge === "top") {
    return new StrainField({
      eps0,
      kappaY: 0,
      kappaZ: -absoluteCurvature,
    });
  }

  if (compressedEdge === "bottom") {
    return new StrainField({
      eps0,
      kappaY: 0,
      kappaZ: absoluteCurvature,
    });
  }

  throw new Error(`Unsupported compressed edge: ${compressedEdge}.`);
}

function signedEngineeringCurvature({ curvature, compressedEdge }) {
  const absoluteCurvature = Math.abs(curvature);
  return compressedEdge === "top" ? absoluteCurvature : -absoluteCurvature;
}

function findBracket(samples, target) {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];

    if (Math.abs(previous.value - target) === 0) {
      return { min: previous.eps0, max: previous.eps0 };
    }

    if ((previous.value - target) * (current.value - target) <= 0) {
      return {
        min: previous.eps0,
        max: current.eps0,
      };
    }
  }

  return null;
}

function resolveLimitState({ state, concreteLaw, steelLaw }) {
  const concreteLimits = concreteLaw?.strainLimits?.() ?? {};
  const steelLimits = steelLaw?.strainLimits?.() ?? {};
  const checks = [];

  if (Number.isFinite(concreteLimits.compression)) {
    const limit = Math.abs(concreteLimits.compression);
    const demand = Math.max(0, -(state.extremes.minStrain ?? 0));
    checks.push({
      id: "concrete-compression-strain",
      demand,
      limit,
      utilizationRatio: limit > 0 ? demand / limit : Number.POSITIVE_INFINITY,
      reached: limit > 0 && demand / limit >= 1 - LIMIT_TOLERANCE,
    });
  }

  if (Number.isFinite(steelLimits.tension)) {
    const limit = Math.abs(steelLimits.tension);
    const demand = Math.max(0, state.extremes.maxStrain ?? 0);
    checks.push({
      id: "steel-tension-strain",
      demand,
      limit,
      utilizationRatio: limit > 0 ? demand / limit : Number.POSITIVE_INFINITY,
      reached: limit > 0 && demand / limit >= 1 - LIMIT_TOLERANCE,
    });
  }

  if (Number.isFinite(steelLimits.compression)) {
    const limit = Math.abs(steelLimits.compression);
    const demand = Math.max(0, -(state.extremes.minStrain ?? 0));
    checks.push({
      id: "steel-compression-strain",
      demand,
      limit,
      utilizationRatio: limit > 0 ? demand / limit : Number.POSITIVE_INFINITY,
      reached: limit > 0 && demand / limit >= 1 - LIMIT_TOLERANCE,
    });
  }

  const governing = checks.reduce(
    (current, check) =>
      current == null || check.utilizationRatio > current.utilizationRatio
        ? check
        : current,
    null,
  );

  return {
    reached: checks.some((check) => check.reached),
    governing,
    checks,
  };
}

function resolveFirstYieldState({ state, concreteLaw, steelLaw }) {
  const checks = [];
  const steelYieldStrain = resolveSteelYieldStrain(steelLaw);
  const concretePeakStrain = resolveConcretePeakCompressionStrain(concreteLaw);

  if (Number.isFinite(steelYieldStrain) && steelYieldStrain > 0) {
    const demand = Math.max(0, state.extremes.maxStrain ?? 0);
    checks.push({
      id: "steel-tension-yield",
      demand,
      limit: steelYieldStrain,
      utilizationRatio: demand / steelYieldStrain,
      reached: demand / steelYieldStrain >= 1 - LIMIT_TOLERANCE,
    });
  }

  if (Number.isFinite(concretePeakStrain) && concretePeakStrain > 0) {
    const demand = Math.max(0, -(state.extremes.minStrain ?? 0));
    checks.push({
      id: "concrete-compression-peak",
      demand,
      limit: concretePeakStrain,
      utilizationRatio: demand / concretePeakStrain,
      reached: demand / concretePeakStrain >= 1 - LIMIT_TOLERANCE,
    });
  }

  const governing = checks.reduce(
    (current, check) =>
      current == null || check.utilizationRatio > current.utilizationRatio
        ? check
        : current,
    null,
  );

  return {
    reached: checks.some((check) => check.reached),
    governing,
    checks,
  };
}

function neutralAxisY(strainField) {
  if (!Number.isFinite(strainField.kappaZ) || Math.abs(strainField.kappaZ) < 1e-18) {
    return null;
  }

  return strainField.eps0 / strainField.kappaZ;
}

function absoluteMoment(point) {
  return Math.abs(point?.Mx ?? 0);
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
        return {
          absoluteCurvature: current.absoluteCurvature,
          curvature: signedEngineeringCurvature({
            curvature: current.absoluteCurvature,
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
      const signedMoment = Math.sign(current.Mx || previous.Mx || 1) * targetMoment;

      return {
        absoluteCurvature,
        curvature: signedEngineeringCurvature({
          curvature: absoluteCurvature,
          compressedEdge,
        }),
        Mx: signedMoment,
        My: null,
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
    targetMoment: 0.85 * maximum.moment,
    compressedEdge,
  });

  if (dropPoint) {
    return dropPoint;
  }

  if (failurePoint) {
    return {
      absoluteCurvature: failurePoint.absoluteCurvature,
      curvature: failurePoint.curvature,
      Mx: failurePoint.Mx,
      My: failurePoint.My,
      source: "material-ultimate-strain",
      interpolation: "solved-point",
    };
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
    ultimatePoint,
    firstYieldGoverning: firstYieldPoint.firstYieldState?.governing?.id ?? null,
    ultimateCurvatureSource: ultimatePoint?.source ?? null,
  };
}

function defaultCurvatureMax({ section, concreteLaw }) {
  const bounds = section.getBoundingBox();
  const height = bounds.maxY - bounds.minY;

  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("RCMomentCurvatureAnalyzer requires a positive section height.");
  }

  return (2.5 * resolveConcreteUltimateCompressionStrain(concreteLaw)) / height;
}

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
    compressedEdge = "top",
    referencePoint = null,
    includeConcreteTension = false,
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

    const resolvedReferencePoint =
      referencePoint ?? section.getReferencePoint("concrete-centroid");
    const evaluateAtEps0 = (eps0) => {
      const strainField = buildUniaxialStrainField({
        eps0,
        curvature,
        compressedEdge,
      });
      const state = this.sectionIntegrator.evaluate({
        section,
        concreteFibers,
        concreteLaw,
        steelLaw,
        strainField,
        referencePoint: resolvedReferencePoint,
        includeConcreteTension,
      });

      return {
        eps0,
        strainField,
        state,
        residual: state.N - nEd,
      };
    };
    const eps0Samples = createLinearSamples({
      minimum: this.eps0Min,
      maximum: this.eps0Max,
      count: this.eps0Samples,
    }).map((eps0) => ({
      eps0,
      value: evaluateAtEps0(eps0).state.N,
    }));
    const bracket = findBracket(eps0Samples, nEd);

    if (!bracket) {
      throw new Error(
        "RCMomentCurvatureAnalyzer could not bracket the axial-equilibrium root for the requested curvature.",
      );
    }

    const solved = bracket.min === bracket.max
      ? {
          converged: true,
          iterations: 0,
          root: bracket.min,
          residual: evaluateAtEps0(bracket.min).residual,
          bracket,
        }
      : this.axialRootSolver.solve({
          fn: (eps0) => evaluateAtEps0(eps0).state.N,
          min: bracket.min,
          max: bracket.max,
          target: nEd,
        });
    const stateAtRoot = evaluateAtEps0(solved.root);
    const limitState = resolveLimitState({
      state: stateAtRoot.state,
      concreteLaw,
      steelLaw,
    });
    const firstYieldState = resolveFirstYieldState({
      state: stateAtRoot.state,
      concreteLaw,
      steelLaw,
    });

    return {
      converged: solved.converged,
      curvature: signedEngineeringCurvature({ curvature, compressedEdge }),
      absoluteCurvature: Math.abs(curvature),
      compressedEdge,
      eps0: stateAtRoot.strainField.eps0,
      kappaY: stateAtRoot.strainField.kappaY,
      kappaZ: stateAtRoot.strainField.kappaZ,
      neutralAxisY: neutralAxisY(stateAtRoot.strainField),
      N: stateAtRoot.state.N,
      Mx: stateAtRoot.state.Mx,
      My: stateAtRoot.state.My,
      axialResidual: stateAtRoot.residual,
      state: stateAtRoot.state,
      firstYieldState,
      limitState,
      solverReport: {
        method: bracket.min === bracket.max ? "direct-hit" : "illinois",
        iterations: solved.iterations,
        bracket: solved.bracket,
        residual: solved.residual,
      },
    };
  }

  analyze({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd = 0,
    compressedEdge = "top",
    curvatureMax = null,
    curvatureValues = null,
    pointCount = 41,
    referencePoint = null,
    includeConcreteTension = false,
    stopAtFailure = true,
    includeFailurePoint = true,
  } = {}) {
    const resolvedCurvatureMax =
      curvatureMax ?? defaultCurvatureMax({ section, concreteLaw });
    const values = Array.isArray(curvatureValues) && curvatureValues.length >= 2
      ? curvatureValues
      : createCurvatureValues({
          curvatureMax: resolvedCurvatureMax,
          pointCount,
        });
    const points = [];
    const warnings = [];

    let previousPoint = null;
    let failurePoint = null;
    let firstYieldPoint = null;

    for (const curvature of values) {
      let point;

      try {
        point = this.solveAtCurvature({
          section,
          concreteFibers,
          concreteLaw,
          steelLaw,
          curvature: Math.abs(curvature),
          nEd,
          compressedEdge,
          referencePoint,
          includeConcreteTension,
        });
      } catch (error) {
        warnings.push(error.message);
        break;
      }

      if (!firstYieldPoint && point.firstYieldState.reached) {
        if (previousPoint) {
          try {
            firstYieldPoint = this.findFirstYieldPoint({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              nEd,
              compressedEdge,
              referencePoint,
              includeConcreteTension,
              minCurvature: previousPoint.absoluteCurvature,
              maxCurvature: point.absoluteCurvature,
            });
          } catch (error) {
            warnings.push(error.message);
            firstYieldPoint = point;
          }
        } else {
          firstYieldPoint = point;
        }
      }

      if (point.limitState.reached && previousPoint && includeFailurePoint) {
        try {
          failurePoint = this.findFailurePoint({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            nEd,
            compressedEdge,
            referencePoint,
            includeConcreteTension,
            minCurvature: previousPoint.absoluteCurvature,
            maxCurvature: point.absoluteCurvature,
          });
          points.push(failurePoint);
        } catch (error) {
          warnings.push(error.message);
          points.push(point);
          failurePoint = point;
        }
      } else {
        points.push(point);
        failurePoint = point.limitState.reached ? point : failurePoint;
      }

      if (point.limitState.reached && stopAtFailure) {
        break;
      }

      previousPoint = point;
    }

    return {
      nEd,
      compressedEdge,
      curvatureMax: resolvedCurvatureMax,
      pointCount: values.length,
      generatedPointCount: points.length,
      failureReached: failurePoint != null,
      failurePoint,
      firstYieldReached: firstYieldPoint != null,
      firstYieldPoint,
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

  findFirstYieldPoint({
    minCurvature,
    maxCurvature,
    ...options
  }) {
    const utilizationAtCurvature = (curvature) => {
      const point = this.solveAtCurvature({
        ...options,
        curvature,
      });
      return point.firstYieldState.governing?.utilizationRatio ?? 0;
    };
    const root = this.limitRootSolver.solve({
      fn: utilizationAtCurvature,
      min: minCurvature,
      max: maxCurvature,
      target: 1,
    });

    return this.solveAtCurvature({
      ...options,
      curvature: root.root,
    });
  }

  findFailurePoint({
    minCurvature,
    maxCurvature,
    ...options
  }) {
    const utilizationAtCurvature = (curvature) => {
      const point = this.solveAtCurvature({
        ...options,
        curvature,
      });
      return point.limitState.governing?.utilizationRatio ?? 0;
    };
    const root = this.limitRootSolver.solve({
      fn: utilizationAtCurvature,
      min: minCurvature,
      max: maxCurvature,
      target: 1,
    });

    return this.solveAtCurvature({
      ...options,
      curvature: root.root,
    });
  }

  static summarizePoint(point) {
    return {
      converged: point.converged,
      curvature: round(point.curvature),
      absoluteCurvature: round(point.absoluteCurvature),
      eps0: round(point.eps0),
      kappaY: round(point.kappaY),
      kappaZ: round(point.kappaZ),
      neutralAxisY: round(point.neutralAxisY, 6),
      N: round(point.N, 6),
      Mx: round(point.Mx, 6),
      My: round(point.My, 6),
      axialResidual: round(point.axialResidual, 6),
      firstYieldState: {
        reached: point.firstYieldState.reached,
        governing: point.firstYieldState.governing == null
          ? null
          : {
              id: point.firstYieldState.governing.id,
              demand: round(point.firstYieldState.governing.demand),
              limit: round(point.firstYieldState.governing.limit),
              utilizationRatio: round(
                point.firstYieldState.governing.utilizationRatio,
                6,
              ),
              reached: point.firstYieldState.governing.reached,
            },
      },
      limitState: {
        reached: point.limitState.reached,
        governing: point.limitState.governing == null
          ? null
          : {
              id: point.limitState.governing.id,
              demand: round(point.limitState.governing.demand),
              limit: round(point.limitState.governing.limit),
              utilizationRatio: round(
                point.limitState.governing.utilizationRatio,
                6,
              ),
              reached: point.limitState.governing.reached,
            },
      },
      extremes: {
        minStrain: round(point.state.extremes.minStrain),
        maxStrain: round(point.state.extremes.maxStrain),
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
