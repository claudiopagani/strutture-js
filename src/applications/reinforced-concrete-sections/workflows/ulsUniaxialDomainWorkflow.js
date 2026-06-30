import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { RCUniaxialDomainBuilder } from "../analysis/RCUniaxialDomainBuilder.js";
import {
  createRcSectionAnalysisContext,
  createUltimateSectionSolver,
} from "../shared/RcSectionAnalysisContext.js";
import {
  round,
  roundNullable,
  summarizeConcreteCompressionEdge,
} from "../shared/rcCommon.js";

export function runUlsUniaxialDomainWorkflow(model, { code, metadata }) {
  const context = createRcSectionAnalysisContext(model);
  const compressedEdge = model.analysisSettings?.compressedEdge ?? "top";
  const nValues = model.actions?.nValues ?? model.analysisSettings?.nValues;
  const pointCount = model.analysisSettings?.pointCount ?? 15;
  const includeOppositeCurvature =
    model.analysisSettings?.includeOppositeCurvature ?? true;
  const domainBuilder = new RCUniaxialDomainBuilder({
    ultimateSolver: createUltimateSectionSolver(model),
  });
  const domain = domainBuilder.build({
    section: context.section,
    concreteFibers: context.mesh.fibers,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    nValues,
    compressedEdge,
    includeOppositeCurvature,
    pointCount,
    referencePoint: context.referencePoint,
  });
  const allConverged = domain.points.every((point) => point.converged);

  return new VerificationResult({
    applicationId: "reinforced-concrete-sections",
    status: allConverged ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
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
      fiberCount: context.mesh.generatedCount,
      referencePoint: {
        y: round(context.referencePoint.y, 6),
        z: round(context.referencePoint.z, 6),
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
        concreteCompressionEdge: summarizeConcreteCompressionEdge(
          point.concreteCompressionEdge,
        ),
        converged: point.converged,
      })),
    },
    warnings: allConverged
      ? []
      : [
          "One or more M-N domain points did not converge within the configured limits.",
        ],
    assumptions: [
      "M-N workflow uses uniaxial ULS strain compatibility over a conventional capped axial-force interval unless an explicit nValues list is passed in.",
      "The automatically generated compression side is capped at Nc,Rd = 0.8 Ac fcd + As fyd, with compression reported as negative axial force; explicit nValues can be used to build an uncapped section-analysis domain.",
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
