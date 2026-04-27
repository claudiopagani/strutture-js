import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { ConcreteNoTensionLaw } from "../../../domain/constitutive-laws/ConcreteNoTensionLaw.js";
import { ConcreteParabolaRectangleLaw } from "../../../domain/constitutive-laws/ConcreteParabolaRectangleLaw.js";
import { SteelElasticLaw } from "../../../domain/constitutive-laws/SteelElasticLaw.js";
import { SteelElasticPerfectlyPlasticLaw } from "../../../domain/constitutive-laws/SteelElasticPerfectlyPlasticLaw.js";
import { IllinoisRootSolver } from "../../../domain/solvers/IllinoisRootSolver.js";
import { RCBiaxialDomainBuilder } from "../analysis/RCBiaxialDomainBuilder.js";
import { RCServiceStressSolver } from "../analysis/RCServiceStressSolver.js";
import { SectionFiberDiscretizer } from "../analysis/SectionFiberDiscretizer.js";
import { RCUniaxialDomainBuilder } from "../analysis/RCUniaxialDomainBuilder.js";
import { RCUltimateSectionSolver } from "../analysis/RCUltimateSectionSolver.js";
import { resolveRcSleModularRatio } from "../serviceabilityDefaults.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

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

  return new ConcreteParabolaRectangleLaw({
    fcd: concreteMaterial.fcd,
    ec2: model.analysisSettings?.ec2 ?? 0.002,
    ecu: model.analysisSettings?.ecu ?? 0.0035,
  });
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

  return new SteelElasticPerfectlyPlasticLaw({
    Es: reinforcementMaterial.elasticModulus,
    fyd: reinforcementMaterial.fyd,
    esu: model.analysisSettings?.esu ?? 0.01,
  });
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
              neutralAxisDepth: round(point.neutralAxisDepth, 6),
              axialResidual: round(point.axialResidual, 6),
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
              neutralAxisDepth: round(point.neutralAxisDepth, 6),
              axialResidual: round(point.axialResidual, 6),
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
        neutralAxisDepth: round(solved.neutralAxisDepth, 6),
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
