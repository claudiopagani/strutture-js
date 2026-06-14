import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { ConcreteNoTensionLaw } from "../../../domain/constitutive-laws/ConcreteNoTensionLaw.js";
import { SteelElasticLaw } from "../../../domain/constitutive-laws/SteelElasticLaw.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { RCServiceStressSolver } from "../../reinforced-concrete-sections/analysis/RCServiceStressSolver.js";
import { SectionFiberDiscretizer } from "../../reinforced-concrete-sections/analysis/SectionFiberDiscretizer.js";
import { solveServiceStressWithFallbacks } from "../../reinforced-concrete-sections/analysis/solveServiceStressWithFallbacks.js";
import {
  DEFAULT_RC_SLE_MODULAR_RATIO,
  resolveRcSleModularRatio,
} from "../../reinforced-concrete-sections/serviceabilityDefaults.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });
const SLENDERNESS_LIMITS = Object.freeze({
  simple_span: { k: 1, high: 14, low: 20 },
  continuous_end_span: { k: 1.3, high: 18, low: 26 },
  continuous_internal_span: { k: 1.5, high: 20, low: 30 },
  flat_slab: { k: 1.2, high: 17, low: 24 },
  cantilever: { k: 0.4, high: 6, low: 8 },
});

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function normalizeCombinationType(type) {
  return String(type ?? "").toUpperCase().replaceAll("-", "_");
}

function isQuasiPermanent(type) {
  return normalizeCombinationType(type) === "SLE_QUASI_PERMANENT";
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
    concreteArea +
    transformedBars.reduce((sum, bar) => sum + bar.area, 0);
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

function crackingMoment({ section, concreteMaterial }) {
  const concrete = section.concreteSection;
  const fctm = concreteMaterial?.fctm;

  if (!isFinitePositive(fctm)) {
    return null;
  }

  const sectionModulus =
    concrete.elasticSectionModulusY ??
    (isFinitePositive(concrete.inertiaY) && isFinitePositive(concrete.height)
      ? concrete.inertiaY / (concrete.height / 2)
      : null);

  return isFinitePositive(sectionModulus) ? fctm * sectionModulus : null;
}

function deduplicateSamples(samples, resolver) {
  const byStation = new Map();

  for (const sample of samples ?? []) {
    const x = resolver.length(sample.station ?? 0);
    const current = byStation.get(round(x, 6));

    if (!current || Math.abs(sample.m ?? 0) > Math.abs(current.sample.m ?? 0)) {
      byStation.set(round(x, 6), {
        x,
        sample,
      });
    }
  }

  return [...byStation.values()].sort((a, b) => a.x - b.x);
}

function integrateCurvature(points, supports = []) {
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
      rotations[index - 1] + 0.5 * (previous.curvature + current.curvature) * dx;
    const deflection =
      rawDeflections[index - 1] + 0.5 * (rotations[index - 1] + rotation) * dx;

    rotations.push(rotation);
    rawDeflections.push(deflection);
  }

  const span = points[points.length - 1].x - points[0].x;
  const verticalSupports = supports.filter((support) => support.restraints?.uy);
  const hasTwoVerticalSupports = verticalSupports.length >= 2;
  const correction =
    hasTwoVerticalSupports && span > 0
      ? -rawDeflections[rawDeflections.length - 1] / span
      : 0;

  return points.map((point, index) => ({
    ...point,
    rotation: rotations[index] + correction,
    deflection: rawDeflections[index] + correction * (point.x - points[0].x),
  }));
}

function utilizationCheck({ demand, capacity, metadata }) {
  const utilizationRatio = isFinitePositive(capacity) ? demand / capacity : null;

  return {
    id: "rc-sle-deflection-curvature",
    description: "RC deflection from curvature integration",
    demand: round(demand),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok: Number.isFinite(utilizationRatio) && utilizationRatio <= 1,
    metadata,
  };
}

function slendernessCheck({
  span,
  section,
  serviceability,
}) {
  const system =
    serviceability.deflection?.slendernessSystem ??
    serviceability.slendernessSystem ??
    "simple_span";
  const stressLevel =
    serviceability.deflection?.slendernessStressLevel ??
    serviceability.slendernessStressLevel ??
    "low";
  const limits = SLENDERNESS_LIMITS[system] ?? SLENDERNESS_LIMITS.simple_span;
  const limit = limits[stressLevel] ?? limits.low;
  const height = section.concreteSection?.height ?? section.height;

  if (!isFinitePositive(span) || !isFinitePositive(height)) {
    return null;
  }

  const demand = span / height;
  const utilizationRatio = demand / limit;

  return {
    id: "rc-sle-deflection-slenderness",
    description: "Simplified RC span-depth deflection screening",
    demand: round(demand),
    capacity: round(limit),
    utilizationRatio: round(utilizationRatio),
    ok: utilizationRatio <= 1,
    metadata: {
      method: "circolare-ntc2018-c4.1.i-screening",
      system,
      stressLevel,
      k: limits.k,
      span: round(span),
      sectionHeight: round(height),
      slendernessLimit: limit,
    },
  };
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
  } = {}) {
    if (!analysisResult || !section?.concreteSection) {
      return new VerificationResult({
        applicationId: "rc-cracked-deflection",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary: "Cracked-section deflection analysis requires a beam analysis result and an RC section.",
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
    const warnings = [];
    const assumptions = [
      "Curvatures are integrated numerically along FEM service-combination stations.",
      `Cracked RC service sections use the modular-ratio method with base n = ${baseModularRatio}.`,
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

    if (includeShrinkage) {
      warnings.push(
        "Shrinkage curvature is intentionally excluded from the first RC deflection MVP; includeShrinkage was ignored.",
      );
    }

    const resultResolver = createUnitResolver(
      analysisResult.units,
      DEFAULT_SECTION_UNITS,
    );
    const discretizer = new SectionFiberDiscretizer();
    const concreteMesh = discretizer.discretize(section, {
      targetCount: mesh.targetFiberCount ?? 100,
    });
    const serviceSolver = new RCServiceStressSolver({
      tolerance: solver.tolerance ?? 1e-2,
      maxIterations: solver.maxIterations ?? 50,
      finiteDifferenceStep: solver.finiteDifferenceStep ?? 1e-8,
    });
    const mcr = crackingMoment({ section, concreteMaterial });
    const combinationOutputs = [];
    const checks = [];
    let globalSpan = null;

    for (const result of Object.values(analysisResult.combinations ?? {})) {
      if (String(result.context?.limitState ?? "").toUpperCase() !== "SLE") {
        continue;
      }

      const combinationType = result.context?.combinationType ?? null;
      const creepCoefficient = isQuasiPermanent(combinationType) ? phi : 0;
      const effectiveModularRatio = baseModularRatio * (1 + creepCoefficient);
      const effectiveConcreteModulus = es / effectiveModularRatio;
      const gross = transformedGrossInertiaY({ section, modularRatio: effectiveModularRatio });
      const concreteLaw = new ConcreteNoTensionLaw({
        ecm: effectiveConcreteModulus,
      });
      const steelLaw = new SteelElasticLaw({
        Es: es,
      });
      const rawPoints = deduplicateSamples(
        result.internalForces?.samples ?? [],
        resultResolver,
      );
      const curvaturePoints = rawPoints.map(({ x, sample }) => {
        const mEd = resultResolver.moment(sample.m ?? 0);
        const nEd = resultResolver.force(sample.n ?? 0);
        const absM = Math.abs(mEd);
        const uncrackedCurvature =
          isFinitePositive(effectiveConcreteModulus * gross.inertia)
            ? mEd / (effectiveConcreteModulus * gross.inertia)
            : 0;
        let crackedCurvature = uncrackedCurvature;
        let solverConverged = true;
        let zeta = 0;

        if (isFinitePositive(absM) && (!isFinitePositive(mcr) || absM > mcr)) {
          const solved = solveServiceStressWithFallbacks({
            serviceSolver,
            section,
            concreteFibers: concreteMesh.fibers,
            concreteLaw,
            steelLaw,
            actions: {
              nEd,
              mxEd: mEd,
              myEd: 0,
            },
          });
          solverConverged = solved.converged;

          if (solved.converged) {
            crackedCurvature =
              Math.sign(mEd || 1) * Math.abs(solved.strainField.kappaZ);
          }

          const beta = creepCoefficient > 0 ? betaLongTerm : betaShortTerm;
          zeta = isFinitePositive(mcr)
            ? Math.max(0, 1 - beta * (mcr / absM) ** 2)
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
          mcr,
          zeta,
          uncrackedCurvature,
          crackedCurvature,
          curvature:
            zeta * crackedCurvature + (1 - zeta) * uncrackedCurvature,
          cracked: zeta > 0,
        };
      });
      const integrated = integrateCurvature(curvaturePoints, result.supports ?? []);
      const governing = integrated.reduce((selected, point) => {
        if (!selected || Math.abs(point.deflection) > Math.abs(selected.deflection)) {
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
            },
          }),
        );
      }

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
        points: integrated.map((point) => ({
          station: round(point.station),
          mEd: round(point.mEd),
          zeta: round(point.zeta),
          curvature: round(point.curvature, 12),
          deflection: round(point.deflection),
          cracked: point.cracked,
        })),
      });
    }

    const slenderness = slendernessCheck({
      span: globalSpan,
      section,
      serviceability,
    });

    if (slenderness) {
      checks.push(slenderness);
    }

    const governingCheck = checks.reduce((selected, check) => {
      if (!Number.isFinite(check.utilizationRatio)) {
        return selected;
      }

      if (!selected || check.utilizationRatio > selected.utilizationRatio) {
        return check;
      }

      return selected;
    }, null);

    return new VerificationResult({
      applicationId: "rc-cracked-deflection",
      status:
        checks.length > 0 && checks.every((check) => check.ok)
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "RC service deflection from cracked/uncracked curvature integration.",
      utilizationRatio: governingCheck?.utilizationRatio ?? null,
      demand: governingCheck?.demand ?? null,
      capacity: governingCheck?.capacity ?? null,
      checks,
      outputs: {
        beamId,
        creepCoefficient: phi,
        includeShrinkage: false,
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
        governingCheckId: governingCheck?.id ?? null,
        creepCoefficient: phi,
        includeShrinkage: false,
        ...this.metadata,
      },
    });
  }
}
