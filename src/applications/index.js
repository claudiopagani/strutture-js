import { ApplicationRegistry } from "../core/applications/ApplicationRegistry.js";
import { MasonryOutOfPlaneApplication } from "./masonry-out-of-plane/index.js";
import { MasonryPierApplication } from "./masonry-piers/index.js";
import { MasonryWallOpeningsApplication } from "./masonry-wall-openings/index.js";
import { MasonryRingBeamApplication } from "./masonry-ring-beams/index.js";
import { MicropileBromsApplication } from "./micropiles-broms/index.js";
import { RCrackedDeflectionApplication } from "./rc-cracked-deflection/index.js";
import { ReinforcedConcreteSectionApplication } from "./reinforced-concrete-sections/index.js";
import { SingleBeamDesignApplication } from "./single-beam-design/index.js";
import { SteelFrameApplication } from "./steel-frames/index.js";
import { TimberConcreteCompositeBeamApplication } from "./timber-concrete-composite-beams/index.js";
import { TimberXlamCompositeBeamApplication } from "./timber-xlam-composite-beams/index.js";
import { TimberBeamApplication } from "./timber-beams/index.js";
import { XlamOutOfPlanePanelApplication } from "./xlam-panels-out-of-plane/index.js";

export { MasonryOutOfPlaneApplication } from "./masonry-out-of-plane/index.js";
export { MasonryOutOfPlaneKinematicAnalysis } from "./masonry-out-of-plane/index.js";
export { MasonryOutOfPlaneModel } from "./masonry-out-of-plane/index.js";
export { MasonryPierApplication } from "./masonry-piers/index.js";
export { MasonryPierEquivalentFrameBuilder } from "./masonry-piers/index.js";
export { MasonryPierModel } from "./masonry-piers/index.js";
export { MasonryPierVerticalVerification } from "./masonry-piers/index.js";
export { MasonryWallOpeningsApplication } from "./masonry-wall-openings/index.js";
export { AlignmentSeismicAggregatedAnalysis } from "./masonry-wall-openings/index.js";
export { AlignmentEquivalentFramePushoverAnalysis } from "./masonry-wall-openings/index.js";
export { AlignmentStateComparisonAnalysis } from "./masonry-wall-openings/index.js";
export { AlignmentStaticAnalysis } from "./masonry-wall-openings/index.js";
export { MasonryPierCapacityCurveComparisonAnalysis } from "./masonry-wall-openings/index.js";
export { MasonryEquivalentFrameBuilder } from "./masonry-wall-openings/index.js";
export { ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION } from "./masonry-wall-openings/index.js";
export { AlignmentStateComparisonReportBuilder } from "./masonry-wall-openings/index.js";
export { AlignmentStateComparisonMarkdownRenderer } from "./masonry-wall-openings/index.js";
export { createAlignmentStateComparisonReportArtifacts } from "./masonry-wall-openings/index.js";
export { MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION } from "./masonry-wall-openings/index.js";
export { MasonryPierCapacityCurveComparisonReportBuilder } from "./masonry-wall-openings/index.js";
export { MasonryPierCapacityCurveComparisonMarkdownRenderer } from "./masonry-wall-openings/index.js";
export { createMasonryPierCapacityCurveComparisonReportArtifacts } from "./masonry-wall-openings/index.js";
export { bilinearizeCapacityCurve } from "./masonry-wall-openings/index.js";
export { resolveAlignmentMechanicalState } from "./masonry-wall-openings/index.js";
export { resolveMasonryStageMaterial } from "./masonry-wall-openings/index.js";
export { MasonryWallOpeningsModel } from "./masonry-wall-openings/index.js";
export { MasonryWallPierModel } from "./masonry-wall-openings/index.js";
export { MasonryWallSpandrelModel } from "./masonry-wall-openings/index.js";
export { extractEquivalentFrameMembers } from "./masonry-wall-openings/index.js";
export { sanitizeAlignmentOpenings } from "./masonry-wall-openings/index.js";
export { MasonryRingBeamApplication } from "./masonry-ring-beams/index.js";
export { MasonryRingBeamModel } from "./masonry-ring-beams/index.js";
export { MasonryRingBeamVerification } from "./masonry-ring-beams/index.js";
export { MicropileBromsApplication } from "./micropiles-broms/index.js";
export { MicropileBromsAnalysis } from "./micropiles-broms/index.js";
export { MicropileBromsModel } from "./micropiles-broms/index.js";
export { RCrackedDeflectionApplication } from "./rc-cracked-deflection/index.js";
export { CrackedSectionBeamModel } from "./rc-cracked-deflection/index.js";
export { CrackedSectionDeflectionAnalysis } from "./rc-cracked-deflection/index.js";
export { ReinforcedConcreteSectionApplication } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteBeamVerification } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteShearVerification } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteServiceabilityVerification } from "./reinforced-concrete-sections/index.js";
export { RCBiaxialDomainBuilder } from "./reinforced-concrete-sections/index.js";
export { RCMomentCurvatureAnalyzer } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteSectionModel } from "./reinforced-concrete-sections/index.js";
export { RCServiceStressSolver } from "./reinforced-concrete-sections/index.js";
export { RCUltimateSectionSolver } from "./reinforced-concrete-sections/index.js";
export { RCUniaxialDomainBuilder } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteSectionVerification } from "./reinforced-concrete-sections/index.js";
export { RCSectionStateIntegrator } from "./reinforced-concrete-sections/index.js";
export { SectionFiberDiscretizer } from "./reinforced-concrete-sections/index.js";
export { StrainField } from "./reinforced-concrete-sections/index.js";
export { SingleBeamDesignApplication } from "./single-beam-design/index.js";
export { SingleBeamDesignModel } from "./single-beam-design/index.js";
export { BEAM_REPORT_SCHEMA_VERSION } from "./single-beam-design/index.js";
export { validateBeamReportDto } from "./single-beam-design/index.js";
export { BeamReportBuilder } from "./single-beam-design/index.js";
export { BeamReportMarkdownRenderer } from "./single-beam-design/index.js";
export { createBeamReportArtifacts } from "./single-beam-design/index.js";
export { SteelFrameApplication } from "./steel-frames/index.js";
export { SteelRingFramePushoverAnalysis } from "./steel-frames/index.js";
export { SteelRingFrame2DBuilder } from "./steel-frames/index.js";
export { SteelDisplacementControlPushoverSolver2D } from "./steel-frames/index.js";
export { SteelPlasticHingeFrameElement2D } from "./steel-frames/index.js";
export { SteelPlasticHingeState } from "./steel-frames/index.js";
export { classifySteelSection } from "./steel-frames/index.js";
export { calculateElasticCriticalMomentLT } from "./steel-frames/index.js";
export { calculateSteelCompressionBucklingAxis } from "./steel-frames/index.js";
export { calculateSteelMethodBInteractionCoefficients } from "./steel-frames/index.js";
export { calculateSteelMethodBInteractionCoefficientsMyMz } from "./steel-frames/index.js";
export { inferSteelCompressionBucklingCurves } from "./steel-frames/index.js";
export { steelBucklingCurveImperfectionFactor } from "./steel-frames/index.js";
export { verifySteelBeamColumnInteractionMy } from "./steel-frames/index.js";
export { verifySteelBeamColumnInteractionMyMz } from "./steel-frames/index.js";
export { verifySteelCompressionBuckling } from "./steel-frames/index.js";
export { verifySteelLateralTorsionalBuckling } from "./steel-frames/index.js";
export { TimberConcreteCompositeBeamApplication } from "./timber-concrete-composite-beams/index.js";
export { TimberConcreteCompositeBeamModel } from "./timber-concrete-composite-beams/index.js";
export { TimberConcreteCompositeBeamSectionProvider } from "./timber-concrete-composite-beams/index.js";
export { TimberConcreteCompositeBeamVerification } from "./timber-concrete-composite-beams/index.js";
export { createTimberConcreteCompositeBeamSectionProvider } from "./timber-concrete-composite-beams/index.js";
export { TimberXlamCompositeBeamApplication } from "./timber-xlam-composite-beams/index.js";
export { TimberXlamCompositeBeamModel } from "./timber-xlam-composite-beams/index.js";
export { TimberXlamCompositeBeamSectionProvider } from "./timber-xlam-composite-beams/index.js";
export { TimberXlamCompositeBeamVerification } from "./timber-xlam-composite-beams/index.js";
export { createTimberXlamCompositeBeamSectionProvider } from "./timber-xlam-composite-beams/index.js";
export { SteelFrameModel } from "./steel-frames/index.js";
export { SteelRingFramePushoverModel } from "./steel-frames/index.js";
export { SteelMemberVerification } from "./steel-frames/index.js";
export { TimberBeamApplication } from "./timber-beams/index.js";
export { TimberBeamModel } from "./timber-beams/index.js";
export { TimberBeamVerification } from "./timber-beams/index.js";
export { calculateTimberLateralBucklingReduction } from "./timber-beams/index.js";
export { calculateTimberRectangularCriticalBendingStress } from "./timber-beams/index.js";
export { verifyTimberLateralTorsionalStability } from "./timber-beams/index.js";
export { XlamOutOfPlanePanelApplication } from "./xlam-panels-out-of-plane/index.js";
export { XlamOutOfPlanePanelModel } from "./xlam-panels-out-of-plane/index.js";
export { XlamOutOfPlanePanelVerification } from "./xlam-panels-out-of-plane/index.js";
export { XlamBeamVerification } from "./xlam-beams/index.js";

export function createDefaultApplicationRegistry() {
  return new ApplicationRegistry([
    new SingleBeamDesignApplication(),
    new SteelFrameApplication(),
    new MasonryRingBeamApplication(),
    new MasonryPierApplication(),
    new MasonryWallOpeningsApplication(),
    new ReinforcedConcreteSectionApplication(),
    new TimberBeamApplication(),
    new TimberConcreteCompositeBeamApplication(),
    new TimberXlamCompositeBeamApplication(),
    new XlamOutOfPlanePanelApplication(),
    new RCrackedDeflectionApplication(),
    new MasonryOutOfPlaneApplication(),
    new MicropileBromsApplication(),
  ]);
}
