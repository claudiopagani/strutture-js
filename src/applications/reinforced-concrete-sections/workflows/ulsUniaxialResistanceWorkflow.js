import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import {
  createRcSectionAnalysisContext,
  createUltimateSectionSolver,
} from "../shared/RcSectionAnalysisContext.js";
import {
  round,
  roundNullable,
  summarizeConcreteCompressionEdge,
} from "../shared/rcCommon.js";

export function runUlsUniaxialResistanceWorkflow(model, { code, metadata }) {
  const context = createRcSectionAnalysisContext(model);
  const nEd = model.actions?.nEd ?? model.actions?.axialForce;

  if (!Number.isFinite(nEd)) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a finite actions.nEd for uls-uniaxial-resistance.",
    );
  }

  const compressedEdge = model.analysisSettings?.compressedEdge ?? "top";
  const solved = createUltimateSectionSolver(model).solveUniaxialAtAxialLoad({
    section: context.section,
    concreteFibers: context.mesh.fibers,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    nEd,
    compressedEdge,
    referencePoint: context.referencePoint,
  });
  const mEd = model.actions?.mEd ?? model.actions?.mxEd ?? null;
  const capacity = Math.abs(solved.MxRd);
  const demand = mEd == null ? null : Math.abs(mEd);
  const utilizationRatio =
    demand == null || capacity === 0 ? null : demand / capacity;
  const isVerified =
    utilizationRatio == null ? solved.converged : utilizationRatio <= 1;

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
      fiberCount: context.mesh.generatedCount,
      referencePoint: {
        y: round(context.referencePoint.y, 6),
        z: round(context.referencePoint.z, 6),
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
                value: round(
                  solved.state.extremes.maxConcreteCompression.value,
                  6,
                ),
                strain: round(
                  solved.state.extremes.maxConcreteCompression.strain,
                  12,
                ),
                y: round(solved.state.extremes.maxConcreteCompression.y, 6),
                z: round(solved.state.extremes.maxConcreteCompression.z, 6),
              },
        concreteCompressionEdge: summarizeConcreteCompressionEdge(
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
      : [
          "The axial-equilibrium iteration did not converge within the configured limits.",
        ],
    assumptions: [
      "Current workflow implements only ULS uniaxial resistance with concrete ultimate strain governing the compressed edge.",
      "Concrete in tension is neglected during the ULS resistance integration.",
    ],
    metadata: {
      code,
      sectionId: model.id,
      analysisType: model.analysisType,
      solverMethod: "illinois",
      ...metadata,
    },
  });
}
