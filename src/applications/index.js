import { ApplicationRegistry } from "../core/applications/ApplicationRegistry.js";
import { MasonryOutOfPlaneApplication } from "./masonry-out-of-plane/index.js";
import { MasonryPierApplication } from "./masonry-piers/index.js";
import { MasonryWallOpeningsApplication } from "./masonry-wall-openings/index.js";
import { MasonryRingBeamApplication } from "./masonry-ring-beams/index.js";
import { GeotechnicalEarthPressureApplication } from "./geotechnical-earth-pressures/index.js";
import { GeotechnicalDeepFoundationApplication } from "./geotechnical-deep-foundations/index.js";
import { GeotechnicalEmbeddedRetainingWallApplication } from "./geotechnical-embedded-retaining-walls/index.js";
import { GeotechnicalGroundAnchorApplication } from "./geotechnical-ground-anchors/index.js";
import { GeotechnicalLateralPileApplication } from "./geotechnical-lateral-piles/index.js";
import { GeotechnicalRetainingWallApplication } from "./geotechnical-retaining-walls/index.js";
import { GeotechnicalShallowFoundationApplication } from "./geotechnical-shallow-foundations/index.js";
import { GeotechnicalSlopeStabilityApplication } from "./geotechnical-slope-stability/index.js";
import { MicropileBromsApplication } from "./micropiles-broms/index.js";
import { RCrackedDeflectionApplication } from "./rc-cracked-deflection/index.js";
import { ReinforcedConcretePlateApplication } from "./reinforced-concrete-plates/index.js";
import { ReinforcedConcretePunchingApplication } from "./reinforced-concrete-punching/index.js";
import { ReinforcedConcreteColumnApplication } from "./reinforced-concrete-columns/index.js";
import { ReinforcedConcreteIsolatedFootingApplication } from "./reinforced-concrete-isolated-footings/index.js";
import { ReinforcedConcreteFoundationBeamApplication } from "./reinforced-concrete-foundation-beams/index.js";
import { ReinforcedConcreteBeamColumnJointApplication } from "./reinforced-concrete-beam-column-joints/index.js";
import { ReinforcedConcreteStrutAndTieApplication } from "./reinforced-concrete-strut-and-tie/index.js";
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
export { NTC2018MasonryPierAnalysis } from "./masonry-piers/index.js";
export { NTC2018MasonryPierModel } from "./masonry-piers/index.js";
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
export { GeotechnicalEarthPressureApplication } from "./geotechnical-earth-pressures/index.js";
export {
  EMBEDDED_RETAINING_WALL_END_RESTRAINTS,
  EMBEDDED_RETAINING_WALL_LOADING_CONDITIONS,
  EMBEDDED_RETAINING_WALL_MODEL_SCHEMA_VERSION,
  EMBEDDED_RETAINING_WALL_REFERENCES,
  EMBEDDED_RETAINING_WALL_RESULT_SCHEMA_VERSION,
  EMBEDDED_RETAINING_WALL_SCENARIO_SCHEMA_VERSION,
  EMBEDDED_RETAINING_WALL_SUPPORT_BEHAVIORS,
  EMBEDDED_RETAINING_WALL_SUPPORT_TYPES,
  EMBEDDED_RETAINING_WALL_TYPES,
  WALL_SOIL_REACTION_EXTRAPOLATION_MODELS,
  WALL_SOIL_REACTION_LAW_SCHEMA_VERSION,
  WALL_SOIL_REACTION_MODELS,
  EmbeddedRetainingWallAnalysis,
  EmbeddedRetainingWallModel,
  EmbeddedRetainingWallScenario,
  GeotechnicalEmbeddedRetainingWallApplication,
  WallSoilReactionLaw,
} from "./geotechnical-embedded-retaining-walls/index.js";
export {
  GROUND_ANCHOR_BOND_CATALOG,
  GROUND_ANCHOR_BOND_CATALOG_IDS,
  GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
  GROUND_ANCHOR_BOND_RESISTANCE_MODELS,
  GROUND_ANCHOR_CORROSION_CLASSES,
  GROUND_ANCHOR_DEMAND_SOURCES,
  GROUND_ANCHOR_DESIGN_REFERENCE,
  GROUND_ANCHOR_DESIGN_RESULT_SCHEMA_VERSION,
  GROUND_ANCHOR_DESIGN_SCENARIO_SCHEMA_VERSION,
  GROUND_ANCHOR_FAILURE_SURFACE_MODELS,
  GROUND_ANCHOR_FHWA_CRITERIA,
  GROUND_ANCHOR_GROUND_CLASSES,
  GROUND_ANCHOR_HORIZONTAL_DIRECTIONS,
  GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION,
  GROUND_ANCHOR_STABILITY_FORCE_MODELS,
  GROUND_ANCHOR_STABILITY_REFERENCE,
  GROUND_ANCHOR_MODEL_SCHEMA_VERSION,
  GROUND_ANCHOR_TENDON_TYPES,
  GROUND_ANCHOR_TEST_TYPES,
  GeotechnicalGroundAnchorApplication,
  GroundAnchorAnalysis,
  GroundAnchorDesignScenario,
  GroundAnchorModel,
  GroundAnchorStabilityAction2D,
  getGroundAnchorBondCatalogEntry,
  groundAnchorDemandFromEmbeddedWallResult,
  listGroundAnchorBondCatalogEntries,
} from "./geotechnical-ground-anchors/index.js";
export {
  AXIAL_PILE_BASE_RESISTANCE_METHODS,
  AXIAL_PILE_CAPACITY_REFERENCE,
  AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  AXIAL_PILE_EFFECTIVE_STRESS_COEFFICIENT_MODELS,
  AXIAL_PILE_LOAD_DIRECTIONS,
  AXIAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION,
  AXIAL_PILE_RESISTANCE_CONVERSION_MODELS,
  AXIAL_PILE_SHAFT_RESISTANCE_METHODS,
  DEEP_FOUNDATION_DISPLACEMENT_CLASSES,
  DEEP_FOUNDATION_ELEMENT_TYPES,
  DEEP_FOUNDATION_GEOMETRY_MODELS,
  DEEP_FOUNDATION_MODEL_SCHEMA_VERSION,
  AxialPileCapacityAnalysis,
  AxialPileLoadScenario,
  DeepFoundationModel,
  GeotechnicalDeepFoundationApplication,
} from "./geotechnical-deep-foundations/index.js";
export {
  GeotechnicalLateralPileApplication,
  LATERAL_PILE_BEHAVIOR_CLASSIFICATIONS,
  LATERAL_PILE_BROMS_REFERENCE,
  LATERAL_PILE_CAPACITY_METHODS,
  LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  LATERAL_PILE_HEAD_CONDITIONS,
  LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION,
  LATERAL_PILE_ACTION_REFERENCE_POINTS,
  LATERAL_PILE_END_RESTRAINTS,
  LATERAL_PILE_PY_REFERENCE,
  LATERAL_PILE_PY_RESULT_SCHEMA_VERSION,
  LATERAL_PILE_RESPONSE_METHODS,
  LATERAL_PILE_RESPONSE_SCENARIO_SCHEMA_VERSION,
  LATERAL_PILE_RESISTANCE_CONVERSION_MODELS,
  LATERAL_PILE_SOIL_RESPONSE_MODELS,
  LATERAL_PILE_SOIL_BRANCHES,
  PILE_TRANSFER_CURVE_MODELS,
  PILE_TRANSFER_EXTRAPOLATION_MODELS,
  PILE_TRANSFER_LAW_KINDS,
  PILE_TRANSFER_LAW_SCHEMA_VERSION,
  LateralPileBeamOnSpringsAnalysis,
  LateralPileCapacityAnalysis,
  LateralPileLoadScenario,
  LateralPileResponseScenario,
  PileTransferLaw,
} from "./geotechnical-lateral-piles/index.js";
export {
  GeotechnicalRetainingWallApplication,
  RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
  RETAINING_WALL_BASE_UPLIFT_MODELS,
  RETAINING_WALL_LOAD_SCENARIO_SCHEMA_VERSION,
  RETAINING_WALL_MODEL_SCHEMA_VERSION,
  RETAINING_WALL_SEISMIC_DIRECTIONS,
  RETAINING_WALL_TYPES,
  RetainingWallAnalysis,
  RetainingWallLoadScenario,
  RetainingWallModel,
  calculateRetainingWallPolygonProperties,
} from "./geotechnical-retaining-walls/index.js";
export {
  GeotechnicalShallowFoundationApplication,
  SHALLOW_FOUNDATION_ACTION_BASES,
  SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION,
  SHALLOW_FOUNDATION_BASE_UPLIFT_TREATMENTS,
  SHALLOW_FOUNDATION_BEARING_METHODS,
  SHALLOW_FOUNDATION_BEARING_SELECTIONS,
  SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION,
  SHALLOW_FOUNDATION_SHAPES,
  SHALLOW_FOUNDATION_SETTLEMENT_METHODS,
  SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION,
  SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  ShallowFoundationServiceabilityAnalysis,
  ShallowFoundationUltimateLimitStateAnalysis,
  calculateRigidFoundationElasticStiffness,
  calculateSchmertmannStrainInfluence,
  calculateShallowFoundationDifferentialMovement,
  calculateShallowFoundationBearingCapacity,
  calculateShallowFoundationEffectiveGeometry,
  calculateShallowFoundationSlidingResistance,
  calculateShallowFoundationVerticalStressInfluence,
} from "./geotechnical-shallow-foundations/index.js";
export { GeotechnicalSlopeStabilityApplication } from "./geotechnical-slope-stability/index.js";
export { MicropileBromsApplication } from "./micropiles-broms/index.js";
export { MicropileBromsAnalysis } from "./micropiles-broms/index.js";
export { MicropileBromsModel } from "./micropiles-broms/index.js";
export { RCrackedDeflectionApplication } from "./rc-cracked-deflection/index.js";
export { CrackedSectionBeamModel } from "./rc-cracked-deflection/index.js";
export { CrackedSectionDeflectionAnalysis } from "./rc-cracked-deflection/index.js";
export { HyperstaticDeflectionIteration } from "./rc-cracked-deflection/index.js";
export { RC_DEFLECTION_PERFORMANCE_PROFILES } from "./rc-cracked-deflection/index.js";
export { SectionMomentCurvatureCurve } from "./rc-cracked-deflection/index.js";
export { createServiceDeflectionAnalysisResult } from "./rc-cracked-deflection/index.js";
export { runRcServiceDeflectionAnalysis } from "./rc-cracked-deflection/index.js";
export { createScaServiceDeflectionAnalysisResult } from "./rc-cracked-deflection/index.js";
export { runScaRcDeflectionAnalysis } from "./rc-cracked-deflection/index.js";
export {
  RC_PLATE_ANALYSIS_TYPES,
  ReinforcedConcretePlateApplication,
  ReinforcedConcretePlateModel,
  ReinforcedConcretePlateVerification,
  createPlateStripSection,
  rotatePlateMoments,
  rotatePlateShear,
  verifyPlateBending,
  verifyPlateServiceability,
  verifyPlateShear,
  verifyPlateSlenderness,
  woodArmer,
} from "./reinforced-concrete-plates/index.js";
export {
  ReinforcedConcreteColumnApplication,
  ReinforcedConcreteColumnDetailingVerification,
  ReinforcedConcreteColumnModel,
  ReinforcedConcreteColumnVerification,
} from "./reinforced-concrete-columns/index.js";
export {
  ReinforcedConcreteIsolatedFootingApplication,
  ReinforcedConcreteIsolatedFootingModel,
  ReinforcedConcreteIsolatedFootingVerification,
} from "./reinforced-concrete-isolated-footings/index.js";
export {
  FoundationBeamAnalysis,
  FoundationBeamFemBuilder,
  FoundationBeamModel,
  ReinforcedConcreteFoundationBeamApplication,
  ReinforcedConcreteFoundationBeamModel,
} from "./reinforced-concrete-foundation-beams/index.js";
export {
  ReinforcedConcreteBeamColumnJointApplication,
  ReinforcedConcreteBeamColumnJoint3DModel,
  ReinforcedConcreteBeamColumnJoint3DVerification,
  ReinforcedConcreteBeamColumnJointModel,
  ReinforcedConcreteBeamColumnJointVerification,
} from "./reinforced-concrete-beam-column-joints/index.js";
export {
  RC_STRUT_AND_TIE_SUPPORTED_CODE,
  ReinforcedConcreteStrutAndTieApplication,
  ReinforcedConcreteStrutAndTieModel,
  ReinforcedConcreteStrutAndTieVerification,
} from "./reinforced-concrete-strut-and-tie/index.js";
export {
  PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION,
  PunchingVerification,
  PunchingVerificationRequest,
  RC_PUNCHING_PARAMETER_PROFILES,
  RC_PUNCHING_DESIGN_CODE_IDS,
  RC_PUNCHING_DESIGN_CODE_ID_VALUES,
  ReinforcedConcretePunchingApplication,
  getRcPunchingDesignCodeManifest,
  verifyPunching,
} from "./reinforced-concrete-punching/index.js";
export { ReinforcedConcreteSectionApplication } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteBeamVerification } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteBeamDetailingVerification } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteShearVerification } from "./reinforced-concrete-sections/index.js";
export { ReinforcedConcreteTorsionVerification } from "./reinforced-concrete-sections/index.js";
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
export { getSteelVerificationCapabilities } from "./steel-frames/index.js";
export { createSteelMemberFem3DResult, validateSteelMemberFem3DResult, steelMemberFem3DToLegacyAnalysisResult } from "./steel-frames/index.js";
export { calculateSteelMomentDiagramFactor, steelNotSupportedCheck, verifySteelBendingShearInteraction, verifySteelConcentratedWebLoad, verifySteelShearTorsionInteraction, verifySteelWebShearBuckling } from "./steel-frames/index.js";
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
    new ReinforcedConcretePlateApplication(),
    new ReinforcedConcretePunchingApplication(),
    new ReinforcedConcreteColumnApplication(),
    new ReinforcedConcreteIsolatedFootingApplication(),
    new ReinforcedConcreteFoundationBeamApplication(),
    new ReinforcedConcreteBeamColumnJointApplication(),
    new ReinforcedConcreteStrutAndTieApplication(),
    new TimberBeamApplication(),
    new TimberConcreteCompositeBeamApplication(),
    new TimberXlamCompositeBeamApplication(),
    new XlamOutOfPlanePanelApplication(),
    new RCrackedDeflectionApplication(),
    new MasonryOutOfPlaneApplication(),
    new MicropileBromsApplication(),
    new GeotechnicalDeepFoundationApplication(),
    new GeotechnicalEmbeddedRetainingWallApplication(),
    new GeotechnicalGroundAnchorApplication(),
    new GeotechnicalLateralPileApplication(),
    new GeotechnicalEarthPressureApplication(),
    new GeotechnicalShallowFoundationApplication(),
    new GeotechnicalRetainingWallApplication(),
    new GeotechnicalSlopeStabilityApplication(),
  ]);
}
