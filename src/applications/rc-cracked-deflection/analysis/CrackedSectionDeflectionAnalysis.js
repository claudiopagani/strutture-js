import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  DEFAULT_RC_SECTION_UNITS,
  governingCheck,
  isFinitePositive,
  normalizeCombinationType,
  round,
} from "../../reinforced-concrete-sections/shared/rcCommon.js";
import {
  createRcServiceSectionSolverContext,
  solveRcServiceSectionState,
} from "../../reinforced-concrete-sections/shared/solveRcServiceSectionState.js";
import {
  SingleBeamModel,
  resolveBeamSupportPreset,
} from "../../../domain/beams/SingleBeamInput.js";
import {
  DEFAULT_RC_SLE_MODULAR_RATIO,
  resolveRcSleModularRatio,
} from "../../reinforced-concrete-sections/serviceabilityDefaults.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { SectionMomentCurvatureCurve } from "./SectionMomentCurvatureCurve.js";
import { HyperstaticDeflectionIteration } from "./HyperstaticDeflectionIteration.js";
import { integrateCurvature } from "./CurvatureDeflectionIntegrator.js";
import {
  slendernessCheck,
  utilizationCheck,
} from "./DeflectionChecks.js";
import {
  convertCompatibleDisplacements,
  convertSupportStations,
  deduplicateSamples,
  maxAbsSampleAction,
  selectAnalysisSamples,
  selectOutputPoints,
} from "./DeflectionSampling.js";

export const RC_DEFLECTION_PERFORMANCE_PROFILES = Object.freeze({
  interactive: Object.freeze({
    targetFiberCount: 80,
    solverTolerance: 5e-2,
    solverMaxIterations: 35,
    maxStationsPerCombination: 17,
    maxOutputPointsPerCombination: 33,
  }),
  production: Object.freeze({
    targetFiberCount: 120,
    solverTolerance: 1e-2,
    solverMaxIterations: 50,
    maxStationsPerCombination: 33,
    maxOutputPointsPerCombination: 65,
  }),
  accurate: Object.freeze({
    targetFiberCount: 300,
    solverTolerance: 1e-3,
    solverMaxIterations: 80,
    maxStationsPerCombination: null,
    maxOutputPointsPerCombination: null,
  }),
});

function isQuasiPermanent(type) {
  return normalizeCombinationType(type) === "SLE_QUASI_PERMANENT";
}

function resolvePerformanceProfile(name) {
  if (name == null || name === false) {
    return null;
  }

  return RC_DEFLECTION_PERFORMANCE_PROFILES[name] ?? null;
}

function resolveAnalysisOptions({
  performanceProfile,
  serviceability,
  mesh,
  solver,
  sampling,
  output,
}) {
  const profile =
    resolvePerformanceProfile(
      performanceProfile ??
        serviceability.deflection?.performanceProfile ??
        serviceability.performanceProfile,
    ) ?? {};
  const resolvedMesh = {
    ...mesh,
    targetFiberCount: mesh?.targetFiberCount ?? profile.targetFiberCount ?? 100,
  };
  const resolvedSolver = {
    ...solver,
    tolerance: solver?.tolerance ?? profile.solverTolerance ?? 1e-2,
    maxIterations: solver?.maxIterations ?? profile.solverMaxIterations ?? 50,
  };
  const resolvedSampling = {
    ...sampling,
    maxStationsPerCombination:
      sampling?.maxStationsPerCombination ??
      sampling?.maxStations ??
      serviceability.deflection?.maxStationsPerCombination ??
      serviceability.deflection?.maxStations ??
      profile.maxStationsPerCombination ??
      null,
  };
  const resolvedOutput = {
    ...output,
    maxPointsPerCombination:
      output?.maxPointsPerCombination ??
      output?.maxPoints ??
      serviceability.deflection?.maxOutputPointsPerCombination ??
      serviceability.deflection?.maxOutputPoints ??
      profile.maxOutputPointsPerCombination ??
      null,
    includePointDetails:
      output?.includePointDetails ??
      serviceability.deflection?.includePointDetails ??
      false,
  };

  return {
    profileName:
      Object.entries(RC_DEFLECTION_PERFORMANCE_PROFILES).find(
        ([, value]) => value === profile,
      )?.[0] ?? null,
    mesh: resolvedMesh,
    solver: resolvedSolver,
    sampling: resolvedSampling,
    output: resolvedOutput,
  };
}

function numericCacheKey(value) {
  return Number.isFinite(value) ? value.toPrecision(12) : String(value);
}

function quantizeAxialForce(value, tolerance) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value / tolerance) * tolerance;
}

function transformedGrossInertiaY({ section, modularRatio }) {
  const concrete = section.concreteSection;
  const concreteArea = concrete.area;
  const concreteCentroid = concrete.centroidY;
  const bars = section.getReinforcementBars();
  const transformedBars = bars.map((bar) => ({
    area: modularRatio * bar.area,
    y: bar.y,
  }));
  const totalArea =
    concreteArea + transformedBars.reduce((sum, bar) => sum + bar.area, 0);
  const centroid =
    (concreteArea * concreteCentroid +
      transformedBars.reduce((sum, bar) => sum + bar.area * bar.y, 0)) /
    totalArea;
  const inertia =
    concrete.inertiaY +
    concreteArea * (concreteCentroid - centroid) ** 2 +
    transformedBars.reduce(
      (sum, bar) => sum + bar.area * (bar.y - centroid) ** 2,
      0,
    );

  return {
    centroid,
    inertia,
  };
}

function crackingMoments({ section, concreteMaterial, transformedGross }) {
  const concrete = section.concreteSection;
  const fctm = concreteMaterial?.fctm;
  const bounds = section.getBoundingBox?.() ?? {
    minY: 0,
    maxY: concrete.height,
  };

  if (
    !isFinitePositive(fctm) ||
    !isFinitePositive(transformedGross?.inertia) ||
    !Number.isFinite(transformedGross?.centroid) ||
    !isFinitePositive(concrete.height)
  ) {
    return { positive: null, negative: null };
  }

  const distanceToBottom = transformedGross.centroid - bounds.minY;
  const distanceToTop = bounds.maxY - transformedGross.centroid;

  return {
    positive: isFinitePositive(distanceToBottom)
      ? (fctm * transformedGross.inertia) / distanceToBottom
      : null,
    negative: isFinitePositive(distanceToTop)
      ? (fctm * transformedGross.inertia) / distanceToTop
      : null,
  };
}

function selectCrackingMoment(moment, crackingThresholds) {
  return moment >= 0
    ? crackingThresholds.positive
    : crackingThresholds.negative;
}

function summarizeCurvaturePoint(point, { includePointDetails = false } = {}) {
  const summary = {
    station: round(point.station),
    mEd: round(point.mEd),
    zeta: round(point.zeta),
    curvature: round(point.curvature, 12),
    rotation: round(point.rotation, 12),
    deflection: round(point.deflection),
    cracked: point.cracked,
  };

  if (includePointDetails) {
    summary.x = round(point.x);
    summary.nEd = round(point.nEd);
    summary.mcr = round(point.mcr);
    summary.mcrPositive = round(point.mcrPositive);
    summary.mcrNegative = round(point.mcrNegative);
    summary.uncrackedCurvature = round(point.uncrackedCurvature, 12);
    summary.crackedCurvature = round(point.crackedCurvature, 12);
  }

  return summary;
}

/**
 * Count vertical/rotational restraints for beam-line bending indeterminacy.
 * A simple span and a cantilever both have 2 bending restraints; more means
 * that flexural actions depend on stiffness redistribution.
 */
function countBendingSupportRestraints(beamModel) {
  if (!beamModel?.supports) return 0;
  let count = 0;
  for (const support of beamModel.supports) {
    const type = support.type ?? support.preset ?? "free";
    const restraints = support.restraints ?? resolveBeamSupportPreset(type);

    if (restraints?.uy) count += 1;
    if (restraints?.rz) count += 1;
  }
  return count;
}

export class CrackedSectionDeflectionAnalysis {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  analyze({
    beamId = null,
    analysisResult = null,
    section = null,
    concreteMaterial = section?.concreteMaterial,
    reinforcementMaterial = section?.reinforcementMaterial,
    serviceability = {},
    mesh = { targetFiberCount: 100 },
    solver = { tolerance: 1e-2, maxIterations: 50 },
    performanceProfile = null,
    sampling = {},
    output = {},
    beamModel = null,
    hyperstatic = null,
  } = {}) {
    if (!analysisResult || !section?.concreteSection) {
      return new VerificationResult({
        applicationId: "rc-cracked-deflection",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary:
          "Cracked-section deflection analysis requires a beam analysis result and an RC section.",
        warnings: [
          "Cracked inertia, tension stiffening and time-dependent effects were not evaluated because required inputs are missing.",
        ],
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    const es = reinforcementMaterial?.elasticModulus;
    const ec = concreteMaterial?.elasticModulus;
    const phi =
      serviceability.deflection?.creepCoefficient ??
      serviceability.creepCoefficient ??
      2;
    const baseModularRatio = resolveRcSleModularRatio(
      serviceability.deflection?.modularRatio,
      serviceability.modularRatio,
      DEFAULT_RC_SLE_MODULAR_RATIO,
    );
    const includeShrinkage =
      serviceability.deflection?.includeShrinkage ??
      serviceability.includeShrinkage ??
      false;
    const limitRatio =
      serviceability.deflection?.limitRatio ??
      serviceability.deflectionLimitRatio ??
      250;
    const betaShortTerm = serviceability.deflection?.betaShortTerm ?? 1;
    const betaLongTerm = serviceability.deflection?.betaLongTerm ?? 0.5;
    const axialForceCurveTolerance =
      serviceability.deflection?.axialForceCurveTolerance ?? 1000;
    const analysisOptions = resolveAnalysisOptions({
      performanceProfile,
      serviceability,
      mesh,
      solver,
      sampling,
      output,
    });
    const warnings = [];
    const assumptions = [
      "Curvatures are integrated numerically along FEM service-combination stations.",
      `Cracked RC service sections use the modular-ratio method with base n = ${baseModularRatio}.`,
      "Cracking moments use the effective transformed uncracked section and the sign-specific extreme tension fiber.",
      "Concrete tension is excluded in cracked service-section states.",
      `Long-term quasi-permanent curvature increases the effective modular ratio through phi = ${phi}; shrinkage curvature is excluded.`,
    ];

    if (!isFinitePositive(es) || !isFinitePositive(ec)) {
      return new VerificationResult({
        applicationId: "rc-cracked-deflection",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary: "RC cracked deflection could not be evaluated.",
        warnings: [
          "Concrete and reinforcement elastic moduli are required for curvature integration.",
        ],
        assumptions,
        metadata: {
          code: this.code,
          beamId,
          ...this.metadata,
        },
      });
    }

    if (!isFinitePositive(axialForceCurveTolerance)) {
      throw new Error(
        "RC cracked deflection axialForceCurveTolerance must be positive.",
      );
    }

    if (includeShrinkage) {
      warnings.push(
        "Shrinkage curvature is intentionally excluded from the first RC deflection MVP; includeShrinkage was ignored.",
      );
    }

    const resultResolver = createUnitResolver(
      analysisResult.units,
      DEFAULT_RC_SECTION_UNITS,
    );
    const combinationOutputs = [];
    const checks = [];
    const serviceContextCache = new Map();
    const solvedCurvatureCache = new Map();
    const performance = {
      profile: analysisOptions.profileName,
      targetFiberCount: analysisOptions.mesh.targetFiberCount,
      solverTolerance: analysisOptions.solver.tolerance,
      solverMaxIterations: analysisOptions.solver.maxIterations,
      maxStationsPerCombination:
        analysisOptions.sampling.maxStationsPerCombination,
      maxOutputPointsPerCombination:
        analysisOptions.output.maxPointsPerCombination,
      inputStationCount: 0,
      analyzedStationCount: 0,
      returnedPointCount: 0,
      serviceSolveCount: 0,
      serviceSolveCacheHits: 0,
      curveBuildCount: 0,
      curveCacheHitCount: 0,
      curveSectionSolveCount: 0,
      curveSectionSolveFailureCount: 0,
      curveBuildElapsedMs: 0,
      curveLookupCount: 0,
      femSolveCount: 0,
      femSolveElapsedMs: 0,
      hyperstaticIterationElapsedMs: 0,
    };
    let globalSpan = null;
    const normalizedBeamModel = beamModel
      ? beamModel instanceof SingleBeamModel
        ? beamModel
        : new SingleBeamModel(beamModel)
      : null;

    const getServiceContext = (effectiveModularRatio) => {
      const key = numericCacheKey(effectiveModularRatio);

      if (!serviceContextCache.has(key)) {
        serviceContextCache.set(key, {
          gross: transformedGrossInertiaY({
            section,
            modularRatio: effectiveModularRatio,
          }),
          context: createRcServiceSectionSolverContext({
            section,
            reinforcementMaterial,
            mesh: analysisOptions.mesh,
            solver: analysisOptions.solver,
            modularRatio: effectiveModularRatio,
          }),
        });
      }

      return serviceContextCache.get(key);
    };

    // -- Hyperstatic setup -------------------------------------------------
    const isHyperstatic =
      normalizedBeamModel != null &&
      (hyperstatic === true ||
        (hyperstatic == null &&
          countBendingSupportRestraints(normalizedBeamModel) > 2));

    let hyperstaticIteration = null;
    const hyperstaticCurveCache = new Map();

    if (hyperstatic === true && !normalizedBeamModel) {
      warnings.push(
        "Hyperstatic deflection iteration was requested but no beam model was provided; falling back to linear FEM moments.",
      );
    }

    if (isHyperstatic && normalizedBeamModel) {
      if (
        !normalizedBeamModel.combinations ||
        Object.keys(normalizedBeamModel.combinations).length === 0
      ) {
        warnings.push(
          "Hyperstatic deflection iteration requires combination definitions in the beam model; falling back to linear FEM moments.",
        );
      } else {
        hyperstaticIteration = new HyperstaticDeflectionIteration({
          relaxationFactor: serviceability.deflection?.relaxationFactor ?? 0.5,
          tolerance: serviceability.deflection?.iterationTolerance ?? 1e-4,
          maxIterations: serviceability.deflection?.maxIterations ?? 50,
        });
        assumptions.push(
          "Hyperstatic beams use iterative secant-stiffness redistribution with precomputed M-kappa envelopes shared by compatible combinations.",
          `Variable axial force is represented by M-kappa curve families quantized every ${axialForceCurveTolerance} N.`,
        );
      }
    }
    // -----------------------------------------------------------------------

    const hyperstaticCurveEnvelopeByKey = new Map();

    if (hyperstaticIteration) {
      for (const candidate of Object.values(
        analysisResult.combinations ?? {},
      )) {
        if (
          String(candidate.context?.limitState ?? "").toUpperCase() !==
            "SLE" ||
          !candidate.factors ||
          Object.keys(candidate.factors).length === 0
        ) {
          continue;
        }

        const candidateCombinationType =
          candidate.context?.combinationType ?? null;
        const candidateCreepCoefficient = isQuasiPermanent(
          candidateCombinationType,
        )
          ? phi
          : 0;
        const candidateModularRatio =
          baseModularRatio * (1 + candidateCreepCoefficient);
        const candidateBeta =
          candidateCreepCoefficient > 0 ? betaLongTerm : betaShortTerm;
        for (const sample of candidate.internalForces?.samples ?? []) {
          const candidateAxialForce = quantizeAxialForce(
            resultResolver.force(sample.n ?? 0),
            axialForceCurveTolerance,
          );
          const candidateKey = [
            numericCacheKey(candidateModularRatio),
            numericCacheKey(candidateBeta),
            numericCacheKey(candidateAxialForce),
          ].join("|");
          const candidateMoment = Math.abs(
            resultResolver.moment(sample.m ?? 0),
          );

          hyperstaticCurveEnvelopeByKey.set(
            candidateKey,
            Math.max(
              hyperstaticCurveEnvelopeByKey.get(candidateKey) ?? 0,
              candidateMoment,
            ),
          );
        }
      }
    }

    for (const result of Object.values(analysisResult.combinations ?? {})) {
      if (String(result.context?.limitState ?? "").toUpperCase() !== "SLE") {
        continue;
      }

      const combinationType = result.context?.combinationType ?? null;
      const creepCoefficient = isQuasiPermanent(combinationType) ? phi : 0;
      const effectiveModularRatio = baseModularRatio * (1 + creepCoefficient);
      const effectiveConcreteModulus = es / effectiveModularRatio;
      const serviceArtifacts = getServiceContext(effectiveModularRatio);
      const gross = serviceArtifacts.gross;
      const serviceContext = serviceArtifacts.context;
      const crackingThresholds = crackingMoments({
        section,
        concreteMaterial,
        transformedGross: gross,
      });
      // Keep the historical scalar mcr as the positive-bending threshold.
      const mcr = crackingThresholds.positive;

      // -- Hyperstatic iteration (replaces linear FEM moments) ----------
      let iteratedResult = null;
      let iteratedCurve = null;
      let iteratedCurveResolver = null;
      let iteratedCurveCacheHit = false;
      let combinationCurveBuildElapsedMs = 0;
      let combinationCurveSectionSolveCount = 0;
      const iteratedCurveLookupStarts = new Map();
      const iteratedCurveKeys = new Set();
      if (
        hyperstaticIteration &&
        normalizedBeamModel &&
        result.factors &&
        Object.keys(result.factors).length > 0
      ) {
        const beta = creepCoefficient > 0 ? betaLongTerm : betaShortTerm;
        const initialSamples = result.internalForces?.samples ?? [];
        const initialMaxMoment = maxAbsSampleAction(
          initialSamples,
          "m",
          resultResolver,
        );
        const governingInitialSample = initialSamples.reduce(
          (selected, sample) =>
            selected == null ||
            Math.abs(sample.m ?? 0) > Math.abs(selected.m ?? 0)
              ? sample
              : selected,
          null,
        );
        const curveForAxialForce = (axialForce, requiredMoment = 0) => {
          const representativeAxialForce = quantizeAxialForce(
            axialForce,
            axialForceCurveTolerance,
          );
          const curveKey = [
            numericCacheKey(effectiveModularRatio),
            numericCacheKey(beta),
            numericCacheKey(representativeAxialForce),
          ].join("|");
          let curve = hyperstaticCurveCache.get(curveKey);

          if (!curve) {
            const envelopeMaxMoment = Math.max(
              requiredMoment,
              hyperstaticCurveEnvelopeByKey.get(curveKey) ?? 0,
            );
            curve = new SectionMomentCurvatureCurve({
              section,
              reinforcementMaterial,
              effectiveModularRatio,
              mesh: analysisOptions.mesh,
              solver: analysisOptions.solver,
              mcr,
              mcrPositive: crackingThresholds.positive,
              mcrNegative: crackingThresholds.negative,
              grossInertia: gross.inertia,
              concreteModulus: effectiveConcreteModulus,
              beta,
              initialMaxMoment: envelopeMaxMoment,
              axialForce: representativeAxialForce,
              units: DEFAULT_RC_SECTION_UNITS,
            });
            hyperstaticCurveCache.set(curveKey, curve);
            performance.curveBuildCount += 1;
            performance.curveSectionSolveCount +=
              curve.metrics.sectionSolveCount;
            performance.curveSectionSolveFailureCount +=
              curve.metrics.sectionSolveFailureCount;
            performance.curveBuildElapsedMs += curve.metrics.buildElapsedMs;
            combinationCurveBuildElapsedMs += curve.metrics.buildElapsedMs;
            combinationCurveSectionSolveCount +=
              curve.metrics.sectionSolveCount;
          } else if (!iteratedCurveKeys.has(curveKey)) {
            iteratedCurveCacheHit = true;
            performance.curveCacheHitCount += 1;
          }

          if (!iteratedCurveKeys.has(curveKey)) {
            iteratedCurveKeys.add(curveKey);
            iteratedCurveLookupStarts.set(curve, curve.lookupCount);
          }

          return curve;
        };
        const representativeAxialForce = resultResolver.force(
          governingInitialSample?.n ?? 0,
        );
        iteratedCurve = curveForAxialForce(
          representativeAxialForce,
          initialMaxMoment,
        );
        iteratedCurveResolver = ({ axialForce, moment }) =>
          curveForAxialForce(axialForce, Math.abs(moment));

        const combinationDef = {
          id: result.id,
          factors: { ...result.factors },
          metadata: result.context ?? {},
        };

        iteratedResult = hyperstaticIteration.iterate({
          model: normalizedBeamModel,
          combination: combinationDef,
          curve: iteratedCurve,
          curveResolver: iteratedCurveResolver,
        });
        performance.femSolveCount +=
          iteratedResult.performance?.femSolveCount ?? 0;
        performance.femSolveElapsedMs +=
          iteratedResult.performance?.femSolveElapsedMs ?? 0;
        performance.hyperstaticIterationElapsedMs +=
          iteratedResult.performance?.elapsedMs ?? 0;

        if (!iteratedResult.converged) {
          warnings.push(
            `Hyperstatic secant iteration did not converge for ${result.id} after ${iteratedResult.iterations} iterations; using final moment distribution.`,
          );
        }
      }
      // -----------------------------------------------------------------

      const rawPoints = deduplicateSamples(
        iteratedResult
          ? (iteratedResult.momentSamples ?? [])
          : (result.internalForces?.samples ?? []),
        resultResolver,
      );
      const analysisPoints = selectAnalysisSamples(
        rawPoints,
        analysisOptions.sampling,
      );
      performance.inputStationCount += rawPoints.length;
      performance.analyzedStationCount += analysisPoints.length;

      const curvaturePoints = analysisPoints.map(({ x, sample }) => {
        const mEd = resultResolver.moment(sample.m ?? 0);
        const nEd = resultResolver.force(sample.n ?? 0);
        const absM = Math.abs(mEd);
        const selectedMcr = selectCrackingMoment(mEd, crackingThresholds);
        const uncrackedCurvature = isFinitePositive(
          effectiveConcreteModulus * gross.inertia,
        )
          ? mEd / (effectiveConcreteModulus * gross.inertia)
          : 0;
        let crackedCurvature = uncrackedCurvature;
        let solverConverged = true;
        let zeta = 0;

        if (iteratedCurve) {
          const pointCurve =
            iteratedCurveResolver?.({ axialForce: nEd, moment: mEd }) ??
            iteratedCurve;
          const curveState = pointCurve.lookupState(mEd);
          crackedCurvature = curveState.kappaCracked ?? curveState.kappa;
          solverConverged = curveState.converged ?? true;
          zeta = curveState.zeta ?? 0;

          if (!solverConverged) {
            warnings.push(
              `Precomputed M-kappa curve did not converge for ${result.id} near station ${sample.station}.`,
            );
          }

          return {
            x,
            station: sample.station,
            mEd,
            nEd,
            mcr: selectedMcr,
            mcrPositive: crackingThresholds.positive,
            mcrNegative: crackingThresholds.negative,
            zeta,
            uncrackedCurvature:
              curveState.kappaUncracked ?? uncrackedCurvature,
            crackedCurvature,
            curvature: curveState.kappa,
            cracked: curveState.cracked ?? zeta > 0,
          };
        }

        if (
          isFinitePositive(absM) &&
          (!isFinitePositive(selectedMcr) || absM > selectedMcr)
        ) {
          const solveCacheKey = [
            numericCacheKey(effectiveModularRatio),
            numericCacheKey(nEd),
            numericCacheKey(mEd),
          ].join("|");
          let solved = solvedCurvatureCache.get(solveCacheKey);

          if (solved) {
            performance.serviceSolveCacheHits += 1;
          } else {
            solved = solveRcServiceSectionState({
              section,
              reinforcementMaterial,
              concreteMesh: serviceContext.mesh,
              serviceSolver: serviceContext.serviceSolver,
              concreteLaw: serviceContext.concreteLaw,
              steelLaw: serviceContext.steelLaw,
              solver: analysisOptions.solver,
              modularRatio: effectiveModularRatio,
              actions: {
                nEd,
                mxEd: mEd,
                myEd: 0,
              },
            }).solved;
            solvedCurvatureCache.set(solveCacheKey, solved);
            performance.serviceSolveCount += 1;
          }

          solverConverged = solved.converged;

          if (solved.converged) {
            crackedCurvature =
              Math.sign(mEd || 1) * Math.abs(solved.strainField.kappaZ);
          }

          const beta = creepCoefficient > 0 ? betaLongTerm : betaShortTerm;
          zeta = isFinitePositive(selectedMcr)
            ? Math.max(0, 1 - beta * (selectedMcr / absM) ** 2)
            : 1;
        }

        if (!solverConverged) {
          warnings.push(
            `Cracked curvature solver did not converge for ${result.id} at station ${sample.station}.`,
          );
        }

        return {
          x,
          station: sample.station,
          mEd,
          nEd,
          mcr: selectedMcr,
          mcrPositive: crackingThresholds.positive,
          mcrNegative: crackingThresholds.negative,
          zeta,
          uncrackedCurvature,
          crackedCurvature,
          curvature: zeta * crackedCurvature + (1 - zeta) * uncrackedCurvature,
          cracked: zeta > 0,
        };
      });
      const integrated = integrateCurvature(
        curvaturePoints,
        convertSupportStations(
          iteratedResult?.supports ?? result.supports ?? [],
          resultResolver,
        ),
        {
          displacementSamples: convertCompatibleDisplacements(
            iteratedResult?.compatibleDisplacementSamples ?? [],
            resultResolver,
          ),
        },
      );
      const curveLookupCount = [...iteratedCurveLookupStarts.entries()].reduce(
        (count, [curve, lookupCountAtStart]) =>
          count + curve.lookupCount - lookupCountAtStart,
        0,
      );

      performance.curveLookupCount += curveLookupCount;
      const governing = integrated.reduce((selected, point) => {
        if (
          !selected ||
          Math.abs(point.deflection) > Math.abs(selected.deflection)
        ) {
          return point;
        }

        return selected;
      }, null);
      const span =
        integrated.length > 1
          ? integrated[integrated.length - 1].x - integrated[0].x
          : resultResolver.length(result.geometry?.length ?? 0);
      globalSpan = globalSpan ?? span;
      const limit = isFinitePositive(limitRatio) ? span / limitRatio : null;

      if (governing && isFinitePositive(limit)) {
        checks.push(
          utilizationCheck({
            demand: Math.abs(governing.deflection),
            capacity: limit,
            metadata: {
              resultId: result.id,
              resultType: result.resultType,
              limitState: result.context?.limitState ?? null,
              combinationType,
              station: round(governing.station),
              creepCoefficient,
              baseModularRatio: round(baseModularRatio),
              modularRatio: round(effectiveModularRatio),
              limitRatio,
              maxAbsDeflection: round(Math.abs(governing.deflection)),
              span: round(span),
              mcr: round(mcr),
              mcrPositive: round(crackingThresholds.positive),
              mcrNegative: round(crackingThresholds.negative),
            },
          }),
        );
      }

      const outputPoints = selectOutputPoints(
        integrated,
        analysisOptions.output,
      );
      const crackedPointCount = integrated.filter((point) => point.cracked)
        .length;
      const maxZeta = integrated.reduce(
        (max, point) => Math.max(max, point.zeta ?? 0),
        0,
      );
      const hyperstaticSummary = iteratedResult
        ? {
            active: true,
            converged: Boolean(iteratedResult.converged),
            iterations: iteratedResult.iterations,
            relaxationFactor:
              iteratedResult.relaxationFactor ??
              hyperstaticIteration.relaxationFactor,
            method: "secant-stiffness-moment-curvature",
            momentCurvePointCount: iteratedCurve?.pointCount ?? null,
            axialForceCurveCount: iteratedCurveKeys.size,
            axialForceCurveTolerance,
            compatibleDeflectionSource: "iterated-fem-shape-functions",
            curveCacheHit: iteratedCurveCacheHit,
            curveBuildElapsedMs: combinationCurveBuildElapsedMs,
            curveSectionSolveCount: combinationCurveSectionSolveCount,
            curveLookupCount,
            femSolveCount:
              iteratedResult.performance?.femSolveCount ?? 0,
            femSolveElapsedMs:
              iteratedResult.performance?.femSolveElapsedMs ?? 0,
            iterationElapsedMs:
              iteratedResult.performance?.elapsedMs ?? 0,
          }
        : {
            active: false,
            converged: null,
            iterations: 0,
            relaxationFactor: null,
            method: null,
            momentCurvePointCount: null,
            axialForceCurveCount: 0,
            axialForceCurveTolerance,
            compatibleDeflectionSource: null,
          };

      combinationOutputs.push({
        resultId: result.id,
        combinationType,
        creepCoefficient,
        baseModularRatio: round(baseModularRatio),
        effectiveConcreteModulus: round(effectiveConcreteModulus),
        modularRatio: round(effectiveModularRatio),
        limitRatio,
        span: round(span),
        deflectionLimit: round(limit),
        maxAbsDeflection: round(Math.abs(governing?.deflection ?? 0)),
        governingStation: round(governing?.station),
        mcr: round(mcr),
        mcrPositive: round(crackingThresholds.positive),
        mcrNegative: round(crackingThresholds.negative),
        grossCentroid: round(gross.centroid),
        grossInertia: round(gross.inertia),
        grossFlexuralRigidity: round(
          effectiveConcreteModulus * gross.inertia,
        ),
        inputPointCount: rawPoints.length,
        analyzedPointCount: analysisPoints.length,
        returnedPointCount: outputPoints.length,
        crackedPointCount,
        maxZeta: round(maxZeta),
        hyperstatic: hyperstaticSummary,
        points: outputPoints.map((point) =>
          summarizeCurvaturePoint(point, analysisOptions.output),
        ),
      });

      performance.returnedPointCount +=
        combinationOutputs[combinationOutputs.length - 1].returnedPointCount;
    }

    const slenderness = slendernessCheck({
      span: globalSpan,
      section,
      serviceability,
    });

    if (slenderness) {
      checks.push(slenderness);
    }

    const governing = governingCheck(checks);

    return new VerificationResult({
      applicationId: "rc-cracked-deflection",
      status:
        checks.length > 0 && checks.every((check) => check.ok)
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "RC service deflection from cracked/uncracked curvature integration.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        beamId,
        creepCoefficient: phi,
        includeShrinkage: false,
        performance,
        simplifiedSlenderness: slenderness
          ? {
              demand: slenderness.demand,
              capacity: slenderness.capacity,
              utilizationRatio: slenderness.utilizationRatio,
              ok: slenderness.ok,
              metadata: { ...slenderness.metadata },
            }
          : null,
        combinationCount: combinationOutputs.length,
        combinations: combinationOutputs,
      },
      warnings,
      assumptions,
      metadata: {
        code: this.code,
        beamId,
        method: "curvature-integration-tension-stiffening-mvp",
        governingCheckId: governing?.id ?? null,
        creepCoefficient: phi,
        includeShrinkage: false,
        ...this.metadata,
      },
    });
  }
}
