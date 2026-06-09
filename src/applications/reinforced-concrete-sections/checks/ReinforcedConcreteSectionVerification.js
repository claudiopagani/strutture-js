import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { ConcreteNoTensionLaw } from "../../../domain/constitutive-laws/ConcreteNoTensionLaw.js";
import { ConcreteParabolaRectangleLaw } from "../../../domain/constitutive-laws/ConcreteParabolaRectangleLaw.js";
import { ConcreteStressBlockLaw } from "../../../domain/constitutive-laws/ConcreteStressBlockLaw.js";
import { ConcreteTriangularRectangleLaw } from "../../../domain/constitutive-laws/ConcreteTriangularRectangleLaw.js";
import { SteelElasticLaw } from "../../../domain/constitutive-laws/SteelElasticLaw.js";
import { SteelElasticPlasticHardeningLaw } from "../../../domain/constitutive-laws/SteelElasticPlasticHardeningLaw.js";
import { SteelElasticPerfectlyPlasticLaw } from "../../../domain/constitutive-laws/SteelElasticPerfectlyPlasticLaw.js";
import { IllinoisRootSolver } from "../../../domain/solvers/IllinoisRootSolver.js";
import { RCBiaxialDomainBuilder } from "../analysis/RCBiaxialDomainBuilder.js";
import { RCMomentCurvatureAnalyzer } from "../analysis/RCMomentCurvatureAnalyzer.js";
import { RCServiceStressSolver } from "../analysis/RCServiceStressSolver.js";
import { SectionFiberDiscretizer } from "../analysis/SectionFiberDiscretizer.js";
import { RCUniaxialDomainBuilder } from "../analysis/RCUniaxialDomainBuilder.js";
import { RCUltimateSectionSolver } from "../analysis/RCUltimateSectionSolver.js";
import { resolveRcSleModularRatio } from "../serviceabilityDefaults.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;
const roundNullable = (value, decimals = 6) =>
  Number.isFinite(value) ? round(value, decimals) : null;

function summarizeConcreteCompressionEdge(edge) {
  if (edge == null) {
    return null;
  }

  return {
    strain: round(edge.strain, 12),
    demand: round(edge.demand, 12),
    y: round(edge.y, 6),
    z: round(edge.z, 6),
  };
}

function resolveServiceStressSolverActions(actions = {}) {
  const userMxEd = actions?.mxEd ?? actions?.mEd ?? 0;
  const userMyEd = actions?.myEd ?? 0;

  return {
    nEd: actions?.nEd ?? actions?.axialForce,
    mxEd: -userMxEd,
    myEd: -userMyEd,
  };
}

function resolveReferencePoint(section, referencePoint = null) {
  const type = referencePoint?.type ?? "concrete-centroid";
  const coordinates = referencePoint?.coordinates ?? null;
  return section.getReferencePoint(type, coordinates);
}

function normalizeConcreteLawType(value = "parabola-rectangle") {
  const aliases = {
    "parabola-rectangle": "parabola-rectangle",
    "parabola-rettangolo": "parabola-rectangle",
    "triangular-rectangle": "triangular-rectangle",
    "triangolo-rettangolo": "triangular-rectangle",
    "stress-block": "stress-block",
    stressBlock: "stress-block",
    rettangolo: "stress-block",
    rectangular: "stress-block",
    "rectangular-stress-block": "stress-block",
  };

  return aliases[value] ?? value;
}

function normalizeSteelLawType(value = "elastic-perfectly-plastic") {
  const aliases = {
    "elastic-perfectly-plastic": "elastic-perfectly-plastic",
    "elasto-plastico": "elastic-perfectly-plastic",
    "elastic-plastic-hardening": "elastic-plastic-hardening",
    "elasto-plastico-incrudimento": "elastic-plastic-hardening",
    hardening: "elastic-plastic-hardening",
    incrudimento: "elastic-plastic-hardening",
  };

  return aliases[value] ?? value;
}

function resolveSteelUltimateStrain(model, reinforcementMaterial, fallback = 0.01) {
  const configured =
    model.analysisSettings?.esu ??
    model.analysisSettings?.steelUltimateStrain ??
    null;

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  if (Number.isFinite(reinforcementMaterial?.ultimateStrain)) {
    return reinforcementMaterial.ultimateStrain;
  }

  if (Number.isFinite(reinforcementMaterial?.metadata?.ultimateStrain)) {
    return reinforcementMaterial.metadata.ultimateStrain;
  }

  return fallback;
}

function resolveConcreteLaw(model, section) {
  if (model.constitutiveModels?.concreteLaw) {
    return model.constitutiveModels.concreteLaw;
  }

  const concreteMaterial =
    model.materials?.concreteMaterial ?? section.concreteMaterial;

  if (!concreteMaterial?.fcd) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a concrete material with fcd.",
    );
  }

  const concreteLawType =
    normalizeConcreteLawType(
      model.analysisSettings?.concreteLawType ??
        model.analysisSettings?.concreteModel ??
        "parabola-rectangle",
    );

  if (concreteLawType === "parabola-rectangle") {
    return new ConcreteParabolaRectangleLaw({
      fcd: concreteMaterial.fcd,
      ec2: model.analysisSettings?.ec2 ?? 0.002,
      ecu: model.analysisSettings?.ecu ?? 0.0035,
    });
  }

  if (concreteLawType === "triangular-rectangle") {
    return new ConcreteTriangularRectangleLaw({
      fcd: concreteMaterial.fcd,
      ec3: model.analysisSettings?.ec3 ?? 0.00175,
      ecu: model.analysisSettings?.ecu ?? 0.0035,
    });
  }

  if (concreteLawType === "stress-block") {
    return new ConcreteStressBlockLaw({
      fcd: concreteMaterial.fcd,
      eta: model.analysisSettings?.eta ?? 1,
      ec4: model.analysisSettings?.ec4 ?? 0,
      ecu: model.analysisSettings?.ecu ?? 0.0035,
    });
  }

  throw new Error(`Unsupported concrete law type: ${concreteLawType}.`);
}

function resolveSteelLaw(model, section) {
  if (model.constitutiveModels?.steelLaw) {
    return model.constitutiveModels.steelLaw;
  }

  const reinforcementMaterial =
    model.materials?.reinforcementMaterial ?? section.reinforcementMaterial;

  if (!reinforcementMaterial?.elasticModulus || !reinforcementMaterial?.fyd) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a reinforcement material with elasticModulus and fyd.",
    );
  }

  const steelLawType =
    normalizeSteelLawType(
      model.analysisSettings?.steelLawType ??
        model.analysisSettings?.steelModel ??
        "elastic-perfectly-plastic",
    );

  if (steelLawType === "elastic-perfectly-plastic") {
    return new SteelElasticPerfectlyPlasticLaw({
      Es: reinforcementMaterial.elasticModulus,
      fyd: reinforcementMaterial.fyd,
      esu: resolveSteelUltimateStrain(model, reinforcementMaterial),
    });
  }

  if (steelLawType === "elastic-plastic-hardening") {
    const gammaS = reinforcementMaterial.metadata?.gammaS ?? 1.15;
    const ftd =
      model.analysisSettings?.ftd ??
      model.analysisSettings?.steelUltimateDesignStress ??
      (Number.isFinite(reinforcementMaterial.ftk)
        ? reinforcementMaterial.ftk / gammaS
        : null);

    return new SteelElasticPlasticHardeningLaw({
      Es: reinforcementMaterial.elasticModulus,
      fyd: reinforcementMaterial.fyd,
      ftd,
      esu: resolveSteelUltimateStrain(model, reinforcementMaterial),
      hardeningModulus: model.analysisSettings?.hardeningModulus ?? null,
    });
  }

  throw new Error(`Unsupported steel law type: ${steelLawType}.`);
}

function resolveServiceConcreteLaw(model, section) {
  if (model.constitutiveModels?.concreteLaw) {
    return model.constitutiveModels.concreteLaw;
  }

  const reinforcementMaterial =
    model.materials?.reinforcementMaterial ?? section.reinforcementMaterial;
  const modularRatio = resolveRcSleModularRatio(
    model.analysisSettings?.modularRatio,
  );

  if (!reinforcementMaterial?.elasticModulus) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a reinforcement material with elasticModulus for service-stress.",
    );
  }

  return new ConcreteNoTensionLaw({
    ecm: reinforcementMaterial.elasticModulus / modularRatio,
    compressionCap: model.analysisSettings?.compressionCap ?? null,
  });
}

function resolveServiceSteelLaw(model, section) {
  if (model.constitutiveModels?.steelLaw) {
    return model.constitutiveModels.steelLaw;
  }

  const reinforcementMaterial =
    model.materials?.reinforcementMaterial ?? section.reinforcementMaterial;

  if (!reinforcementMaterial?.elasticModulus) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a reinforcement material with elasticModulus for service-stress.",
    );
  }

  return new SteelElasticLaw({
    Es: reinforcementMaterial.elasticModulus,
    stressCap: model.analysisSettings?.steelStressCap ?? null,
  });
}

export class ReinforcedConcreteSectionVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(modelOrOptions = {}) {
    if (!modelOrOptions?.section) {
      const { sectionId = null, loadCase = null } = modelOrOptions;

      return new VerificationResult({
        applicationId: "reinforced-concrete-sections",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary: "RC section biaxial/uniaxial verification scaffolded.",
        warnings: [
          "Interaction domains, strain compatibility and detailing checks are placeholders.",
        ],
        metadata: {
          code: this.code,
          sectionId,
          loadCase,
          ...this.metadata,
        },
      });
    }

    const model = modelOrOptions;

    if (model.analysisType !== "uls-uniaxial-resistance") {
      if (model.analysisType === "service-stress") {
        const section = model.section;
        const targetFiberCount = model.mesh?.targetFiberCount ?? 100;
        const modularRatio = resolveRcSleModularRatio(
          model.analysisSettings?.modularRatio,
        );
        const referencePoint = resolveReferencePoint(section, model.referencePoint);
        const concreteLaw = resolveServiceConcreteLaw(model, section);
        const steelLaw = resolveServiceSteelLaw(model, section);
        const discretizer = new SectionFiberDiscretizer();
        const mesh = discretizer.discretize(section, {
          targetCount: targetFiberCount,
        });
        const serviceSolver = new RCServiceStressSolver({
          tolerance: model.solver?.tolerance ?? 1e-3,
          maxIterations: model.solver?.maxIterations ?? 40,
          finiteDifferenceStep: model.solver?.finiteDifferenceStep ?? 1e-8,
        });
        const solved = serviceSolver.solve({
          section,
          concreteFibers: mesh.fibers,
          concreteLaw,
          steelLaw,
          actions: resolveServiceStressSolverActions(model.actions),
          referencePoint,
          initialGuess: model.solver?.initialGuess ?? {},
        });

        return new VerificationResult({
          applicationId: "reinforced-concrete-sections",
          status: solved.converged ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
          summary:
            "Service stress state solved through strain-field equilibrium with concrete tension excluded.",
          outputs: {
            analysisType: model.analysisType,
            sectionId: model.id,
            nEd: round(model.actions?.nEd ?? model.actions?.axialForce, 6),
            mxEd: round(model.actions?.mxEd ?? model.actions?.mEd ?? 0, 6),
            myEd: round(model.actions?.myEd ?? 0, 6),
            fiberCount: mesh.generatedCount,
            modularRatio: round(modularRatio, 6),
            referencePoint: {
              y: round(referencePoint.y, 6),
              z: round(referencePoint.z, 6),
            },
            strainField: {
              eps0: round(solved.strainField.eps0, 12),
              kappaY: round(solved.strainField.kappaY, 12),
              kappaZ: round(solved.strainField.kappaZ, 12),
            },
            residual: {
              n: round(solved.residual.n, 6),
              mx: round(solved.residual.mx, 6),
              my: round(solved.residual.my, 6),
            },
            iterations: solved.iterations,
            concrete: {
              axialForce: round(solved.state.concrete.axialForce, 6),
              maxCompression:
                solved.state.extremes.maxConcreteCompression == null
                  ? null
                  : {
                      value: round(solved.state.extremes.maxConcreteCompression.value, 6),
                      y: round(solved.state.extremes.maxConcreteCompression.y, 6),
                      z: round(solved.state.extremes.maxConcreteCompression.z, 6),
                    },
              maxTension:
                solved.state.extremes.maxConcreteTension == null
                  ? null
                  : {
                      value: round(solved.state.extremes.maxConcreteTension.value, 6),
                      y: round(solved.state.extremes.maxConcreteTension.y, 6),
                      z: round(solved.state.extremes.maxConcreteTension.z, 6),
                    },
            },
            steel: {
              axialForce: round(solved.state.steel.axialForce, 6),
              maxCompression:
                solved.state.extremes.maxSteelCompression == null
                  ? null
                  : {
                      value: round(solved.state.extremes.maxSteelCompression.value, 6),
                      y: round(solved.state.extremes.maxSteelCompression.y, 6),
                      z: round(solved.state.extremes.maxSteelCompression.z, 6),
                    },
              maxTension:
                solved.state.extremes.maxSteelTension == null
                  ? null
                  : {
                      value: round(solved.state.extremes.maxSteelTension.value, 6),
                      y: round(solved.state.extremes.maxSteelTension.y, 6),
                      z: round(solved.state.extremes.maxSteelTension.z, 6),
                    },
            },
          },
          warnings: solved.converged
            ? []
            : ["The service stress equilibrium iteration did not converge within the configured limits."],
          assumptions: [
            `Service-stress equilibrium uses the RC modular-ratio method with n = ${round(modularRatio, 6)} and concrete tension excluded.`,
            "Default service steel response is linear elastic unless a different constitutive law is passed in.",
          ],
          metadata: {
            code: this.code,
            sectionId: model.id,
            analysisType: model.analysisType,
            solverMethod: "damped-newton-finite-difference",
            modularRatio: round(modularRatio, 6),
            ...this.metadata,
          },
        });
      }

      if (model.analysisType === "uls-biaxial-domain") {
        const section = model.section;
        const targetFiberCount = model.mesh?.targetFiberCount ?? 100;
        const referencePoint = resolveReferencePoint(section, model.referencePoint);
        const concreteLaw = resolveConcreteLaw(model, section);
        const steelLaw = resolveSteelLaw(model, section);
        const discretizer = new SectionFiberDiscretizer();
        const mesh = discretizer.discretize(section, {
          targetCount: targetFiberCount,
        });
        const nEd = model.actions?.nEd ?? model.actions?.axialForce;

        if (!Number.isFinite(nEd)) {
          throw new Error(
            "ReinforcedConcreteSectionVerification requires a finite actions.nEd for uls-biaxial-domain.",
          );
        }

        const angleCount = model.analysisSettings?.angleCount ?? 32;
        const domainBuilder = new RCBiaxialDomainBuilder({
          ultimateSolver: new RCUltimateSectionSolver({
            rootSolver: new IllinoisRootSolver({
              tolerance: model.solver?.tolerance ?? 1e-6,
              maxIterations: model.solver?.maxIterations ?? 100,
            }),
          }),
        });
        const domain = domainBuilder.buildAtAxialLoad({
          section,
          concreteFibers: mesh.fibers,
          concreteLaw,
          steelLaw,
          nEd,
          angleCount,
          referencePoint,
        });

        return new VerificationResult({
          applicationId: "reinforced-concrete-sections",
          status: domain.points.every((point) => point.converged) ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
          summary:
            "ULS biaxial resistant domain built point-by-point with fiber discretization and Illinois axial-equilibrium iterations.",
          outputs: {
            analysisType: model.analysisType,
            sectionId: model.id,
            nEd: round(nEd, 6),
            angleCount,
            fiberCount: mesh.generatedCount,
            referencePoint: {
              y: round(referencePoint.y, 6),
              z: round(referencePoint.z, 6),
            },
            points: domain.points.map((point) => ({
              theta: round(point.theta, 12),
              MxRd: round(point.MxRd, 6),
              MyRd: round(point.MyRd, 6),
              neutralAxisDepth: roundNullable(point.neutralAxisDepth, 6),
              axialResidual: round(point.axialResidual, 6),
              failureMode: point.failureMode,
              concreteCompressionEdge:
                summarizeConcreteCompressionEdge(
                  point.concreteCompressionEdge,
                ),
              converged: point.converged,
            })),
          },
          warnings: domain.points.every((point) => point.converged)
            ? []
            : ["One or more domain points did not converge within the configured limits."],
          assumptions: [
            "Current biaxial workflow samples the domain by neutral-axis orientation and concrete ultimate strain on the compressed side.",
            "Concrete in tension is neglected during ULS resistance integration.",
          ],
          metadata: {
            code: this.code,
            sectionId: model.id,
            analysisType: model.analysisType,
            solverMethod: "illinois",
            ...this.metadata,
          },
        });
      }

      if (model.analysisType === "moment-curvature") {
        const section = model.section;
        const targetFiberCount = model.mesh?.targetFiberCount ?? 100;
        const referencePoint = resolveReferencePoint(section, model.referencePoint);
        const concreteLaw = resolveConcreteLaw(model, section);
        const steelLaw = resolveSteelLaw(model, section);
        const discretizer = new SectionFiberDiscretizer();
        const mesh = discretizer.discretize(section, {
          targetCount: targetFiberCount,
        });
        const nEd = model.actions?.nEd ?? model.actions?.axialForce ?? 0;

        if (!Number.isFinite(nEd)) {
          throw new Error(
            "ReinforcedConcreteSectionVerification requires a finite actions.nEd for moment-curvature.",
          );
        }

        const analyzer = new RCMomentCurvatureAnalyzer({
          axialRootSolver: new IllinoisRootSolver({
            tolerance: model.solver?.tolerance ?? 1e-6,
            maxIterations: model.solver?.maxIterations ?? 100,
          }),
          limitRootSolver: new IllinoisRootSolver({
            tolerance: model.solver?.limitTolerance ?? model.solver?.tolerance ?? 1e-8,
            maxIterations: model.solver?.limitMaxIterations ?? 60,
          }),
          eps0Samples: model.solver?.eps0Samples ?? 161,
          eps0Min: model.solver?.eps0Min ?? -0.08,
          eps0Max: model.solver?.eps0Max ?? 0.08,
        });
        const curve = analyzer.analyze({
          section,
          concreteFibers: mesh.fibers,
          concreteLaw,
          steelLaw,
          nEd,
          compressedEdge: model.analysisSettings?.compressedEdge ?? "top",
          curvatureMax: model.analysisSettings?.curvatureMax ?? null,
          curvatureValues: model.analysisSettings?.curvatureValues ?? null,
          pointCount: model.analysisSettings?.pointCount ?? 41,
          referencePoint,
          includeConcreteTension: model.analysisSettings?.includeConcreteTension ?? false,
          stopAtFailure: model.analysisSettings?.stopAtFailure ?? false,
          includeFailurePoint: model.analysisSettings?.includeFailurePoint ?? true,
          postPeakMomentDrop:
            model.analysisSettings?.postPeakMomentDrop ?? 0.3,
          postUltimateResponse:
            model.analysisSettings?.postUltimateResponse ??
            "zero-stress",
          postUltimateFractureEnergyDensity:
            model.analysisSettings
              ?.postUltimateFractureEnergyDensity ?? null,
          postPeakCurvatureGrowthFactor:
            model.analysisSettings?.postPeakCurvatureGrowthFactor ?? 1.15,
          maxPostPeakPoints:
            model.analysisSettings?.maxPostPeakPoints ?? 120,
        });
        const summarizedPoints = curve.points.map((point) =>
          RCMomentCurvatureAnalyzer.summarizePoint(point),
        );
        const summarizedFailurePoint =
          curve.failurePoint == null
            ? null
            : RCMomentCurvatureAnalyzer.summarizePoint(curve.failurePoint);
        const summarizedFirstYieldPoint =
          curve.firstYieldPoint == null
            ? null
            : RCMomentCurvatureAnalyzer.summarizePoint(curve.firstYieldPoint);
        const summarizedBalancedFailurePoint =
          curve.balancedFailurePoint == null
            ? null
            : RCMomentCurvatureAnalyzer.summarizePoint(
                curve.balancedFailurePoint,
              );
        const summarizedBalancedCurvaturePoint =
          curve.balancedCurvaturePoint == null
            ? null
            : RCMomentCurvatureAnalyzer.summarizePoint(
                curve.balancedCurvaturePoint,
              );
        const summarizedPostPeakDropPoint =
          curve.postPeakDropPoint == null
            ? null
            : RCMomentCurvatureAnalyzer.summarizePoint(
                curve.postPeakDropPoint,
              );
        const allConverged = curve.points.every((point) => point.converged);

        return new VerificationResult({
          applicationId: "reinforced-concrete-sections",
          status:
            summarizedPoints.length > 1 && allConverged
              ? RESULT_STATUS.OK
              : RESULT_STATUS.NOT_VERIFIED,
          summary:
            "Moment-curvature response solved at assigned axial force through fiber strain compatibility and axial-equilibrium iterations.",
          outputs: {
            analysisType: model.analysisType,
            sectionId: model.id,
            nEd: round(nEd, 6),
            compressedEdge: curve.compressedEdge,
            curvatureMax: round(curve.curvatureMax, 12),
            initialCurvatureMax: round(
              curve.initialCurvatureMax,
              12,
            ),
            balancedCurvature: round(curve.balancedCurvature, 12),
            requestedPointCount: curve.pointCount,
            analyzedPointCount: curve.analyzedPointCount,
            generatedPointCount: curve.generatedPointCount,
            failureReached: curve.failureReached,
            failureMode: curve.failureMode,
            firstYieldReached: curve.firstYieldReached,
            firstYieldType: curve.firstYieldType,
            balancedFailureReached: curve.balancedFailureReached,
            postPeakMomentDrop: round(curve.postPeakMomentDrop, 6),
            postPeakDropReached: curve.postPeakDropReached,
            postUltimateModel: curve.postUltimateModel,
            terminationReason: curve.terminationReason,
            fiberCount: mesh.generatedCount,
            referencePoint: {
              y: round(referencePoint.y, 6),
              z: round(referencePoint.z, 6),
            },
            firstYieldPoint: summarizedFirstYieldPoint,
            failurePoint: summarizedFailurePoint,
            balancedFailurePoint: summarizedBalancedFailurePoint,
            balancedCurvaturePoint:
              summarizedBalancedCurvaturePoint,
            maximumMomentPoint:
              curve.maximumMomentPoint == null
                ? null
                : RCMomentCurvatureAnalyzer.summarizePoint(
                    curve.maximumMomentPoint,
                  ),
            postPeakDropPoint: summarizedPostPeakDropPoint,
            ntc2018Ductility:
              RCMomentCurvatureAnalyzer.summarizeDuctility(
                curve.ntc2018Ductility,
              ),
            points: summarizedPoints,
          },
          warnings: curve.warnings,
          assumptions: [
            "Moment-curvature analysis is uniaxial and keeps the assigned axial force constant while curvature is increased.",
            "Positive reported curvature corresponds to top-edge compression; bottom-edge compression is reported with negative engineering curvature.",
            "Concrete tension is excluded by default during moment-curvature integration unless includeConcreteTension=true or a custom concrete law is supplied.",
            "Concrete peak and ultimate strains are checked at the actual section edge, while steel yield and ultimate strains are checked at reinforcement coordinates.",
            "The assigned-axial-force failure point is the first material ultimate limit reached along the N-constant path.",
            "The balanced failure point imposes simultaneous concrete ultimate compression and extreme tension-steel ultimate strain; its balanced axial force can differ from the assigned nEd.",
            "By default, material stress drops to zero immediately after its ultimate strain. Linear softening is enabled only when explicitly requested with a post-ultimate fracture-energy density.",
            "postUltimateFractureEnergyDensity is an energy per unit volume, expressed internally as N/mm2; it is not a mesh-regularized fracture energy per unit crack area.",
            "NTC 2018 ductility outputs use M'yd at the first-yield curvature, phiYd = MRd / M'yd * phiPrimeYd, and the earlier event between material ultimate strain and a 15% post-peak resistance drop.",
          ],
          metadata: {
            code: this.code,
            sectionId: model.id,
            analysisType: model.analysisType,
            solverMethod: "fiber-section-axial-equilibrium",
            ...this.metadata,
          },
        });
      }

      if (model.analysisType === "uls-uniaxial-domain") {
        const section = model.section;
        const targetFiberCount = model.mesh?.targetFiberCount ?? 100;
        const referencePoint = resolveReferencePoint(section, model.referencePoint);
        const concreteLaw = resolveConcreteLaw(model, section);
        const steelLaw = resolveSteelLaw(model, section);
        const discretizer = new SectionFiberDiscretizer();
        const mesh = discretizer.discretize(section, {
          targetCount: targetFiberCount,
        });
        const compressedEdge = model.analysisSettings?.compressedEdge ?? "top";
        const nValues =
          model.actions?.nValues ??
          model.analysisSettings?.nValues;
        const pointCount = model.analysisSettings?.pointCount ?? 15;
        const includeOppositeCurvature =
          model.analysisSettings?.includeOppositeCurvature ?? true;

        const domainBuilder = new RCUniaxialDomainBuilder({
          ultimateSolver: new RCUltimateSectionSolver({
            rootSolver: new IllinoisRootSolver({
              tolerance: model.solver?.tolerance ?? 1e-6,
              maxIterations: model.solver?.maxIterations ?? 100,
            }),
          }),
        });
        const domain = domainBuilder.build({
          section,
          concreteFibers: mesh.fibers,
          concreteLaw,
          steelLaw,
          nValues,
          compressedEdge,
          includeOppositeCurvature,
          pointCount,
          referencePoint,
        });

        return new VerificationResult({
          applicationId: "reinforced-concrete-sections",
          status: domain.points.every((point) => point.converged) ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
          summary:
            "ULS uniaxial M-N resistant domain built point-by-point with fiber discretization and Illinois axial-equilibrium iterations.",
          outputs: {
            analysisType: model.analysisType,
            sectionId: model.id,
            compressedEdge,
            compressedEdges: domain.compressedEdges,
            nValues: domain.nValues.map((nEd) => round(nEd, 6)),
            axialCapacity: {
              concreteArea: round(domain.axialCapacity.concreteArea, 6),
              reinforcementArea: round(domain.axialCapacity.reinforcementArea, 6),
              fcd: round(domain.axialCapacity.fcd, 6),
              fyd: round(domain.axialCapacity.fyd, 6),
              maximumTension: round(domain.axialCapacity.maximumTension, 6),
              maximumCompression: round(domain.axialCapacity.maximumCompression, 6),
            },
            fiberCount: mesh.generatedCount,
            referencePoint: {
              y: round(referencePoint.y, 6),
              z: round(referencePoint.z, 6),
            },
            points: domain.points.map((point) => ({
              nEd: round(point.nEd, 6),
              compressedEdge: point.compressedEdge,
              curvatureSign: point.curvatureSign,
              MxRd: round(point.MxRd, 6),
              MyRd: round(point.MyRd, 6),
              neutralAxisDepth: roundNullable(point.neutralAxisDepth, 6),
              axialResidual: round(point.axialResidual, 6),
              failureMode: point.failureMode,
              concreteCompressionEdge:
                summarizeConcreteCompressionEdge(
                  point.concreteCompressionEdge,
                ),
              converged: point.converged,
            })),
          },
          warnings: domain.points.every((point) => point.converged)
            ? []
            : ["One or more M-N domain points did not converge within the configured limits."],
          assumptions: [
            "M-N workflow uses uniaxial ULS strain compatibility over a conventional capped axial-force interval unless an explicit nValues list is passed in.",
            "The automatically generated compression side is capped at Nc,Rd = 0.8 Ac fcd + As fyd, with compression reported as negative axial force; explicit nValues can be used to build an uncapped section-analysis domain.",
            "Concrete in tension is neglected during ULS resistance integration.",
          ],
          metadata: {
            code: this.code,
            sectionId: model.id,
            analysisType: model.analysisType,
            solverMethod: "illinois",
            ...this.metadata,
          },
        });
      }

      return new VerificationResult({
        applicationId: "reinforced-concrete-sections",
        status: RESULT_STATUS.NOT_IMPLEMENTED,
        summary: `RC section analysis type ${model.analysisType} is not implemented yet.`,
        warnings: [
          "Only uls-uniaxial-resistance is currently wired to the fiber solver.",
        ],
        metadata: {
          code: this.code,
          sectionId: model.id,
          analysisType: model.analysisType,
          ...this.metadata,
        },
      });
    }

    const section = model.section;
    const targetFiberCount = model.mesh?.targetFiberCount ?? 100;
    const referencePoint = resolveReferencePoint(section, model.referencePoint);
    const concreteLaw = resolveConcreteLaw(model, section);
    const steelLaw = resolveSteelLaw(model, section);
    const discretizer = new SectionFiberDiscretizer();
    const mesh = discretizer.discretize(section, {
      targetCount: targetFiberCount,
    });
    const ultimateSolver = new RCUltimateSectionSolver({
      rootSolver: new IllinoisRootSolver({
        tolerance: model.solver?.tolerance ?? 1e-6,
        maxIterations: model.solver?.maxIterations ?? 100,
      }),
    });
    const nEd = model.actions?.nEd ?? model.actions?.axialForce;

    if (!Number.isFinite(nEd)) {
      throw new Error(
        "ReinforcedConcreteSectionVerification requires a finite actions.nEd for uls-uniaxial-resistance.",
      );
    }

    const compressedEdge = model.analysisSettings?.compressedEdge ?? "top";
    const solved = ultimateSolver.solveUniaxialAtAxialLoad({
      section,
      concreteFibers: mesh.fibers,
      concreteLaw,
      steelLaw,
      nEd,
      compressedEdge,
      referencePoint,
    });

    const mEd = model.actions?.mEd ?? model.actions?.mxEd ?? null;
    const capacity = Math.abs(solved.MxRd);
    const demand = mEd == null ? null : Math.abs(mEd);
    const utilizationRatio =
      demand == null || capacity === 0 ? null : demand / capacity;
    const isVerified = utilizationRatio == null ? solved.converged : utilizationRatio <= 1;

    return new VerificationResult({
      applicationId: "reinforced-concrete-sections",
      status: isVerified ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "ULS uniaxial reinforced-concrete section resistance solved with fiber discretization and Illinois axial-equilibrium iteration.",
      utilizationRatio: round(utilizationRatio, 6),
      demand: round(demand, 6),
      capacity: round(capacity, 6),
      checks:
        utilizationRatio == null
          ? []
          : [
              {
                id: "uls-uniaxial-bending",
                description: "Uniaxial bending resistance at assigned axial force",
                demand: round(demand, 6),
                capacity: round(capacity, 6),
                utilizationRatio: round(utilizationRatio, 6),
                ok: utilizationRatio <= 1,
              },
            ],
      outputs: {
        analysisType: model.analysisType,
        sectionId: model.id,
        nEd: round(nEd, 6),
        mEd: round(mEd, 6),
        compressedEdge,
        failureMode: solved.failureMode,
        neutralAxisDepth: roundNullable(solved.neutralAxisDepth, 6),
        axialResidual: round(solved.axialResidual, 6),
        MxRd: round(solved.MxRd, 6),
        MyRd: round(solved.MyRd, 6),
        fiberCount: mesh.generatedCount,
        referencePoint: {
          y: round(referencePoint.y, 6),
          z: round(referencePoint.z, 6),
        },
        strainField: {
          eps0: round(solved.strainField.eps0, 12),
          kappaY: round(solved.strainField.kappaY, 12),
          kappaZ: round(solved.strainField.kappaZ, 12),
        },
        extremes: {
          minStrain: round(solved.state.extremes.minStrain, 12),
          maxStrain: round(solved.state.extremes.maxStrain, 12),
          maxConcreteCompression:
            solved.state.extremes.maxConcreteCompression == null
              ? null
              : {
                  value: round(solved.state.extremes.maxConcreteCompression.value, 6),
                  strain: round(solved.state.extremes.maxConcreteCompression.strain, 12),
                  y: round(solved.state.extremes.maxConcreteCompression.y, 6),
                  z: round(solved.state.extremes.maxConcreteCompression.z, 6),
                },
          concreteCompressionEdge:
            summarizeConcreteCompressionEdge(
              solved.concreteStrainExtremes?.compression,
            ),
          maxSteelTension:
            solved.state.extremes.maxSteelTension == null
              ? null
              : {
                  value: round(solved.state.extremes.maxSteelTension.value, 6),
                  strain: round(solved.state.extremes.maxSteelTension.strain, 12),
                  y: round(solved.state.extremes.maxSteelTension.y, 6),
                  z: round(solved.state.extremes.maxSteelTension.z, 6),
                },
        },
      },
      warnings: solved.converged
        ? []
        : ["The axial-equilibrium iteration did not converge within the configured limits."],
      assumptions: [
        "Current workflow implements only ULS uniaxial resistance with concrete ultimate strain governing the compressed edge.",
        "Concrete in tension is neglected during the ULS resistance integration.",
      ],
      metadata: {
        code: this.code,
        sectionId: model.id,
        analysisType: model.analysisType,
        solverMethod: "illinois",
        ...this.metadata,
      },
    });
  }
}
