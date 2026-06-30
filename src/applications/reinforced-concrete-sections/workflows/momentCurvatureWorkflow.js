import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { RCMomentCurvatureAnalyzer } from "../analysis/RCMomentCurvatureAnalyzer.js";
import {
  createMomentCurvatureAnalyzer,
  createRcSectionAnalysisContext,
} from "../shared/RcSectionAnalysisContext.js";
import { round } from "../shared/rcCommon.js";

function summarizeOptionalPoint(point) {
  return point == null ? null : RCMomentCurvatureAnalyzer.summarizePoint(point);
}

export function runMomentCurvatureWorkflow(model, { code, metadata }) {
  const context = createRcSectionAnalysisContext(model);
  const nEd = model.actions?.nEd ?? model.actions?.axialForce ?? 0;

  if (!Number.isFinite(nEd)) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a finite actions.nEd for moment-curvature.",
    );
  }

  const curve = createMomentCurvatureAnalyzer(model).analyze({
    section: context.section,
    concreteFibers: context.mesh.fibers,
    concreteLaw: context.concreteLaw,
    steelLaw: context.steelLaw,
    nEd,
    theta: model.analysisSettings?.theta ?? 0,
    compressedSide: model.analysisSettings?.compressedSide ?? null,
    compressedEdge: model.analysisSettings?.compressedEdge ?? "top",
    curvatureMax: model.analysisSettings?.curvatureMax ?? null,
    curvatureValues: model.analysisSettings?.curvatureValues ?? null,
    pointCount: model.analysisSettings?.pointCount ?? 41,
    referencePoint: context.referencePoint,
    includeConcreteTension:
      model.analysisSettings?.includeConcreteTension ?? false,
    stopAtFailure: model.analysisSettings?.stopAtFailure ?? false,
    includeFailurePoint: model.analysisSettings?.includeFailurePoint ?? true,
    postUltimateMomentDrop:
      model.analysisSettings?.postUltimateMomentDrop ??
      model.analysisSettings?.postPeakMomentDrop ??
      0.15,
    maxPostUltimateCurvatureRatio:
      model.analysisSettings?.maxPostUltimateCurvatureRatio ?? 1.2,
    postPeakMomentDrop: model.analysisSettings?.postPeakMomentDrop ?? null,
    postUltimateResponse:
      model.analysisSettings?.postUltimateResponse ?? "zero-stress",
    postUltimateFractureEnergyDensity:
      model.analysisSettings?.postUltimateFractureEnergyDensity ?? null,
    postPeakCurvatureGrowthFactor:
      model.analysisSettings?.postPeakCurvatureGrowthFactor ?? 1.15,
    maxPostPeakPoints: model.analysisSettings?.maxPostPeakPoints ?? 120,
  });
  const summarizedPoints = curve.points.map((point) =>
    RCMomentCurvatureAnalyzer.summarizePoint(point),
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
      theta: round(curve.theta, 12),
      compressedSide: curve.compressedSide,
      compressedEdge: curve.compressedEdge,
      curvatureMax: round(curve.curvatureMax, 12),
      initialCurvatureMax: round(curve.initialCurvatureMax, 12),
      balancedCurvature: round(curve.balancedCurvature, 12),
      requestedPointCount: curve.pointCount,
      analyzedPointCount: curve.analyzedPointCount,
      generatedPointCount: curve.generatedPointCount,
      failureReached: curve.failureReached,
      failureMode: curve.failureMode,
      firstYieldReached: curve.firstYieldReached,
      firstYieldType: curve.firstYieldType,
      balancedFailureReached: curve.balancedFailureReached,
      materialUltimateReached: curve.materialUltimateReached,
      materialUltimateType: curve.materialUltimateType,
      phiMaterialUltimate: round(curve.phiMaterialUltimate, 12),
      Mu: round(curve.Mu, 6),
      postUltimateMomentDrop: round(curve.postUltimateMomentDrop, 6),
      maxPostUltimateCurvatureRatio: round(
        curve.maxPostUltimateCurvatureRatio,
        6,
      ),
      postUltimateCurvatureLimit: round(
        curve.postUltimateCurvatureLimit,
        12,
      ),
      postUltimateTerminationReached: curve.postUltimateTerminationReached,
      postUltimateMomentDropReached: curve.postUltimateMomentDropReached,
      postUltimateCurvatureLimitReached:
        curve.postUltimateCurvatureLimitReached,
      // Legacy aliases retained for existing consumers.
      postPeakMomentDrop: round(curve.postPeakMomentDrop, 6),
      postPeakDropReached: curve.postPeakDropReached,
      postUltimateModel: curve.postUltimateModel,
      terminationReason: curve.terminationReason,
      fiberCount: context.mesh.generatedCount,
      referencePoint: {
        y: round(context.referencePoint.y, 6),
        z: round(context.referencePoint.z, 6),
      },
      firstYieldPoint: summarizeOptionalPoint(curve.firstYieldPoint),
      failurePoint: summarizeOptionalPoint(curve.failurePoint),
      materialUltimatePoint: summarizeOptionalPoint(
        curve.materialUltimatePoint,
      ),
      balancedFailurePoint: summarizeOptionalPoint(curve.balancedFailurePoint),
      balancedCurvaturePoint: summarizeOptionalPoint(
        curve.balancedCurvaturePoint,
      ),
      maximumMomentPoint: summarizeOptionalPoint(curve.maximumMomentPoint),
      postPeakDropPoint: summarizeOptionalPoint(curve.postPeakDropPoint),
      postUltimateTerminationPoint: summarizeOptionalPoint(
        curve.postUltimateTerminationPoint,
      ),
      ntc2018Ductility: RCMomentCurvatureAnalyzer.summarizeDuctility(
        curve.ntc2018Ductility,
      ),
      points: summarizedPoints,
    },
    warnings: curve.warnings,
    assumptions: [
      "Moment-curvature analysis keeps the assigned axial force constant while curvature is increased at the requested neutral-axis orientation.",
      "theta is measured counterclockwise from +z toward +y; positive-side compression gives positive engineering curvature.",
      "Concrete tension is excluded by default during moment-curvature integration unless includeConcreteTension=true or a custom concrete law is supplied.",
      "Concrete peak and ultimate strains are checked at the actual section edge, while steel yield and ultimate strains are checked at reinforcement coordinates.",
      "The assigned-axial-force failure point is the first material ultimate limit reached along the N-constant path.",
      "After the material ultimate point, the analysis stops at the first event between the configured resistance drop from Mu and the configured multiple of phiMaterialUltimate.",
      "The balanced failure point imposes simultaneous concrete ultimate compression and extreme tension-steel ultimate strain; its balanced axial force can differ from the assigned nEd.",
      "By default, material stress drops to zero immediately after its ultimate strain. Linear softening is enabled only when explicitly requested with a post-ultimate fracture-energy density.",
      "postUltimateFractureEnergyDensity is an energy per unit volume, expressed internally as N/mm2; it is not a mesh-regularized fracture energy per unit crack area.",
      "NTC 2018 ductility outputs use M'yd at the first-yield curvature, phiYd = MRd / M'yd * phiPrimeYd, and the earlier event between material ultimate strain and a 15% post-peak resistance drop.",
    ],
    metadata: {
      code,
      sectionId: model.id,
      analysisType: model.analysisType,
      solverMethod: "fiber-section-axial-equilibrium",
      ...metadata,
    },
  });
}
