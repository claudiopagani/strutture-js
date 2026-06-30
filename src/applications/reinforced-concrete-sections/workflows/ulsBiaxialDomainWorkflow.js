import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { RCBiaxialDomainBuilder } from "../analysis/RCBiaxialDomainBuilder.js";
import {
  createRcSectionAnalysisContext,
  createUltimateSectionSolver,
} from "../shared/RcSectionAnalysisContext.js";
import {
  round,
  roundNullable,
  summarizeConcreteCompressionEdge,
} from "../shared/rcCommon.js";

export function runUlsBiaxialDomainWorkflow(model, { code, metadata }) {
  const context = createRcSectionAnalysisContext(model);
  const nEd = model.actions?.nEd ?? model.actions?.axialForce;

  if (!Number.isFinite(nEd)) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a finite actions.nEd for uls-biaxial-domain.",
    );
  }

  const angleCount = model.analysisSettings?.angleCount ?? 32;
  const domainBuilder = new RCBiaxialDomainBuilder({
    ultimateSolver: createUltimateSectionSolver(model),
  });
  const domain = domainBuilder.buildAtAxialLoad({
    section: context.section,
    concreteFibers: context.mesh.fibers,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    nEd,
    angleCount,
    referencePoint: context.referencePoint,
  });
  const allConverged = domain.points.every((point) => point.converged);

  return new VerificationResult({
    applicationId: "reinforced-concrete-sections",
    status: allConverged ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    summary:
      "ULS biaxial resistant domain built point-by-point with fiber discretization and Illinois axial-equilibrium iterations.",
    outputs: {
      analysisType: model.analysisType,
      sectionId: model.id,
      nEd: round(nEd, 6),
      angleCount,
      fiberCount: context.mesh.generatedCount,
      referencePoint: {
        y: round(context.referencePoint.y, 6),
        z: round(context.referencePoint.z, 6),
      },
      points: domain.points.map((point) => ({
        theta: round(point.theta, 12),
        MxRd: round(point.MxRd, 6),
        MyRd: round(point.MyRd, 6),
        neutralAxisDepth: roundNullable(point.neutralAxisDepth, 6),
        axialResidual: round(point.axialResidual, 6),
        failureMode: point.failureMode,
        concreteCompressionEdge: summarizeConcreteCompressionEdge(
          point.concreteCompressionEdge,
        ),
        converged: point.converged,
      })),
    },
    warnings: allConverged
      ? []
      : ["One or more domain points did not converge within the configured limits."],
    assumptions: [
      "Current biaxial workflow samples the domain by neutral-axis orientation and concrete ultimate strain on the compressed side.",
      "Concrete in tension is neglected during ULS resistance integration.",
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
