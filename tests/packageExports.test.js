import test from "node:test";
import assert from "node:assert/strict";

import * as PublicApi from "strutture-js";
import * as ApplicationsApi from "strutture-js/applications";
import * as GlobalFemPostprocessingApi from
  "strutture-js/applications/global-fem-postprocessing";
import * as MasonryPiersApi from "strutture-js/applications/masonry-piers";
import * as RcDeflectionApi from "strutture-js/applications/rc-cracked-deflection";
import * as RcPlatesApi from "strutture-js/applications/reinforced-concrete-plates";
import * as RcPunchingApi from "strutture-js/applications/reinforced-concrete-punching";
import * as RcColumnsApi from "strutture-js/applications/reinforced-concrete-columns";
import * as RcFootingsApi from "strutture-js/applications/reinforced-concrete-isolated-footings";
import * as RcFoundationBeamsApi from "strutture-js/applications/reinforced-concrete-foundation-beams";
import * as RcBeamColumnJointsApi from "strutture-js/applications/reinforced-concrete-beam-column-joints";
import * as RcStrutAndTieApi from "strutture-js/applications/reinforced-concrete-strut-and-tie";
import * as SlopeStabilityApi from
  "strutture-js/applications/geotechnical-slope-stability";
import * as ShallowFoundationApi from
  "strutture-js/applications/geotechnical-shallow-foundations";
import * as RetainingWallApi from
  "strutture-js/applications/geotechnical-retaining-walls";
import * as DeepFoundationApi from
  "strutture-js/applications/geotechnical-deep-foundations";
import * as LateralPileApi from
  "strutture-js/applications/geotechnical-lateral-piles";
import * as EmbeddedRetainingWallApi from
  "strutture-js/applications/geotechnical-embedded-retaining-walls";
import * as GroundAnchorApi from
  "strutture-js/applications/geotechnical-ground-anchors";
import * as FemApi from "strutture-js/domain/fem";
import * as MathApi from "strutture-js/domain/math";
import * as TerrainApi from "strutture-js/domain/terrain";
import * as GeotechnicsApi from "strutture-js/domain/geotechnics";
import * as StrutAndTieApi from "strutture-js/domain/strut-and-tie";
import * as SoilTypesApi from "strutture-js/catalogs/soil-types";
import * as WallInterfaceTypesApi from
  "strutture-js/catalogs/wall-interface-types";
import * as SteelProfilesApi from "strutture-js/catalogs/steel-profiles";
import * as ItalianHistoricalApi from "strutture-js/norms/italian-historical";
import * as Ntc2018Api from "strutture-js/norms/ntc2018";
import * as En1992Api from "strutture-js/norms/en1992";

test("package root export exposes the main public API", () => {
  assert.equal(typeof PublicApi.SingleBeamAnalysis, "function");
  assert.equal(typeof PublicApi.CalculationResult, "function");
  assert.equal(typeof PublicApi.getSteelVerificationCapabilities, "function");
  assert.equal(typeof PublicApi.validateSteelMemberFem3DResult, "function");
  assert.equal(typeof PublicApi.verifySteelWebShearBuckling, "function");
  assert.equal(typeof PublicApi.runRcServiceDeflectionAnalysis, "function");
  assert.equal(typeof PublicApi.runScaRcDeflectionAnalysis, "function");
  assert.equal(typeof PublicApi.ReinforcedConcretePlateApplication, "function");
  assert.equal(typeof PublicApi.PunchingConnectionModel, "function");
  assert.equal(typeof PublicApi.PunchingControlPerimeter, "function");
  assert.equal(typeof PublicApi.PunchingActionState, "function");
  assert.equal(typeof PublicApi.resolvePunchingTransferFromJointActions, "function");
  assert.equal(typeof PublicApi.PunchingVerificationRequest, "function");
  assert.equal(typeof PublicApi.PunchingVerification, "function");
  assert.equal(typeof PublicApi.ReinforcedConcretePunchingApplication, "function");
  assert.equal(typeof PublicApi.verifyPunching, "function");
  assert.equal(typeof PublicApi.RC_PUNCHING_DESIGN_CODE_IDS, "object");
  assert.equal(typeof PublicApi.rotatePlateMoments, "function");
  assert.equal(typeof PublicApi.ReinforcedConcreteColumnApplication, "function");
  assert.equal(
    typeof PublicApi.ReinforcedConcreteIsolatedFootingApplication,
    "function",
  );
  assert.equal(typeof PublicApi.RectangularFootingContactAnalysis, "function");
  assert.equal(typeof PublicApi.FoundationBeamAnalysis, "function");
  assert.equal(typeof PublicApi.GroundProfile, "function");
  assert.equal(typeof PublicApi.GroundSection2D, "function");
  assert.equal(typeof PublicApi.PorePressureField2D, "function");
  assert.equal(typeof PublicApi.GroundModel, "function");
  assert.equal(typeof PublicApi.GeotechnicalDesignSituation, "function");
  assert.equal(typeof PublicApi.SoilStructureInterface, "function");
  assert.equal(
    typeof PublicApi.calculateNTC2018RetainingWallSeismicCoefficients,
    "function",
  );
  assert.equal(typeof PublicApi.LateralEarthPressureAnalysis, "function");
  assert.equal(typeof PublicApi.CircularSlipSurface2D, "function");
  assert.equal(typeof PublicApi.CircularSlopeStabilityAnalysis, "function");
  assert.equal(typeof PublicApi.spencerMethod, "function");
  assert.equal(
    typeof PublicApi.GeotechnicalSlopeStabilityApplication,
    "function",
  );
  assert.equal(
    typeof PublicApi.GeotechnicalShallowFoundationApplication,
    "function",
  );
  assert.equal(typeof PublicApi.ShallowFoundationModel, "function");
  assert.equal(typeof PublicApi.ShallowFoundationActionState, "function");
  assert.equal(typeof PublicApi.RetainingWallModel, "function");
  assert.equal(typeof PublicApi.RetainingWallLoadScenario, "function");
  assert.equal(typeof PublicApi.RetainingWallAnalysis, "function");
  assert.equal(
    typeof PublicApi.GeotechnicalRetainingWallApplication,
    "function",
  );
  assert.equal(typeof PublicApi.DeepFoundationModel, "function");
  assert.equal(typeof PublicApi.AxialPileLoadScenario, "function");
  assert.equal(typeof PublicApi.AxialPileCapacityAnalysis, "function");
  assert.equal(typeof PublicApi.LateralPileLoadScenario, "function");
  assert.equal(typeof PublicApi.LateralPileCapacityAnalysis, "function");
  assert.equal(typeof PublicApi.PileTransferLaw, "function");
  assert.equal(typeof PublicApi.WallSoilReactionLaw, "function");
  assert.equal(typeof PublicApi.EmbeddedRetainingWallModel, "function");
  assert.equal(typeof PublicApi.EmbeddedRetainingWallScenario, "function");
  assert.equal(typeof PublicApi.EmbeddedRetainingWallAnalysis, "function");
  assert.equal(typeof PublicApi.LateralPileResponseScenario, "function");
  assert.equal(
    typeof PublicApi.LateralPileBeamOnSpringsAnalysis,
    "function",
  );
  assert.equal(
    typeof PublicApi.GeotechnicalDeepFoundationApplication,
    "function",
  );
  assert.equal(
    typeof PublicApi.GeotechnicalLateralPileApplication,
    "function",
  );
  assert.equal(
    typeof PublicApi.GeotechnicalEmbeddedRetainingWallApplication,
    "function",
  );
  assert.equal(typeof PublicApi.GroundAnchorModel, "function");
  assert.equal(typeof PublicApi.GroundAnchorDesignScenario, "function");
  assert.equal(typeof PublicApi.GroundAnchorAnalysis, "function");
  assert.equal(
    typeof PublicApi.GeotechnicalGroundAnchorApplication,
    "function",
  );
  assert.equal(
    typeof PublicApi.ShallowFoundationServiceabilityAnalysis,
    "function",
  );
  assert.equal(
    typeof PublicApi.calculateShallowFoundationDifferentialMovement,
    "function",
  );
  assert.equal(
    typeof PublicApi.coulombPassiveEarthPressureCoefficient,
    "function",
  );
  assert.equal(
    typeof PublicApi.ReinforcedConcreteFoundationBeamApplication,
    "function",
  );
  assert.equal(
    typeof PublicApi.ReinforcedConcreteBeamColumnJointApplication,
    "function",
  );
  assert.equal(typeof PublicApi.calculateNTC2018JointShearDemand, "function");
  assert.equal(typeof PublicApi.StrutAndTieAnalysis2D, "function");
  assert.equal(
    typeof PublicApi.ReinforcedConcreteStrutAndTieApplication,
    "function",
  );
  assert.equal(typeof PublicApi.ReinforcedConcreteTorsionVerification, "function");
  assert.equal(typeof PublicApi.HyperstaticDeflectionIteration, "function");
  assert.equal(typeof PublicApi.SectionMomentCurvatureCurve, "function");
  assert.equal(typeof PublicApi.CyclicMasonryCompressionMaterial, "function");
  assert.equal(typeof PublicApi.CyclicMasonryShearMaterial, "function");
  assert.equal(typeof PublicApi.MasonryFiberInterface2D, "function");
  assert.equal(typeof PublicApi.CyclicMasonryPier2D, "function");
  assert.equal(typeof PublicApi.CyclicMasonryPierAnalysis2D, "function");
  assert.equal(typeof PublicApi.cyclicMasonryPierHistoryToCsv, "function");
  assert.equal(typeof PublicApi.createFemCapabilitiesContract, "function");
  assert.equal(typeof PublicApi.createGlobalFemModelContract, "function");
  assert.equal(typeof PublicApi.createGlobalFemAnalysisContract, "function");
  assert.equal(typeof PublicApi.createFemEntityMappingContract, "function");
  assert.equal(typeof PublicApi.createGlobalFemResultContract, "function");
  assert.equal(typeof PublicApi.validateGlobalFemContractSet, "function");
  assert.equal(typeof PublicApi.GlobalFemPostProcessingApplication, "function");
  assert.equal(typeof PublicApi.classifyGlobalFemStructuralEntities, "function");
  assert.equal(typeof PublicApi.extractGlobalFemDemands, "function");
  assert.equal(typeof PublicApi.NTC2018MasonryPierModel, "function");
  assert.equal(typeof PublicApi.NTC2018MasonryPierAnalysis, "function");
  assert.equal(typeof PublicApi.evaluateNTC2018MasonryPier, "function");
  assert.equal(typeof PublicApi.calculateNTC2018PermanentAreaLoads, "function");
  assert.equal(typeof PublicApi.resolveNTC2018ImposedLoadDefinition, "function");
  assert.equal(typeof PublicApi.calculateNTC2018ImposedLoadAreaReduction, "function");
  assert.equal(typeof PublicApi.calculateNTC2018HorizontalElasticSpectrum, "function");
  assert.equal(typeof PublicApi.classifyNTC2018Topography, "function");
  assert.equal(typeof PublicApi.normalizeTerrainElevationGrid, "function");
  assert.equal(typeof PublicApi.calculateNTC2018SnowAreaLoad, "function");
  assert.equal(typeof PublicApi.calculateNTC2018BuildingThermalActions, "function");
  assert.equal(typeof PublicApi.calculateNTC2018WindAreaLoad, "function");
  assert.equal(typeof PublicApi.NTC2018_UNIT_WEIGHT_CATALOG, "object");
  assert.equal(typeof PublicApi.NTC2018_IMPOSED_LOAD_CATALOG, "object");
  assert.equal(typeof PublicApi.SLAB_MATERIAL_WEIGHT_PRESET_METADATA, "object");
  assert.equal(typeof PublicApi.NTC2018_SEISMIC_LIMIT_STATES, "object");
  assert.equal(typeof PublicApi.NTC2018_SNOW_GROUND_ZONES, "object");
  assert.equal(typeof PublicApi.NTC2018_THERMAL_EXPANSION_COEFFICIENTS, "object");
  assert.equal(typeof PublicApi.NTC2018_WIND_ZONES, "object");
  assert.equal(typeof PublicApi.RESULT_STATUS, "object");
});

test("applications subpath export exposes application registry helpers", () => {
  assert.equal(typeof ApplicationsApi.createDefaultApplicationRegistry, "function");
  assert.equal(typeof ApplicationsApi.SingleBeamDesignApplication, "function");
  assert.equal(typeof ApplicationsApi.MasonryWallOpeningsApplication, "function");
  assert.equal(typeof ApplicationsApi.runRcServiceDeflectionAnalysis, "function");
  assert.equal(typeof ApplicationsApi.runScaRcDeflectionAnalysis, "function");
  assert.equal(typeof ApplicationsApi.HyperstaticDeflectionIteration, "function");
  assert.equal(typeof ApplicationsApi.SectionMomentCurvatureCurve, "function");
  assert.equal(typeof ApplicationsApi.NTC2018MasonryPierModel, "function");
  assert.equal(typeof ApplicationsApi.ReinforcedConcretePlateModel, "function");
  assert.equal(typeof ApplicationsApi.ReinforcedConcreteColumnModel, "function");
  assert.equal(
    typeof ApplicationsApi.ReinforcedConcreteIsolatedFootingModel,
    "function",
  );
  assert.equal(typeof ApplicationsApi.getSteelVerificationCapabilities, "function");
  assert.equal(
    typeof ApplicationsApi.GeotechnicalSlopeStabilityApplication,
    "function",
  );
  assert.equal(
    typeof ApplicationsApi.GeotechnicalShallowFoundationApplication,
    "function",
  );
  assert.equal(
    typeof ApplicationsApi.GeotechnicalRetainingWallApplication,
    "function",
  );
  assert.equal(
    typeof ApplicationsApi.GeotechnicalDeepFoundationApplication,
    "function",
  );
  assert.equal(
    typeof ApplicationsApi.GeotechnicalLateralPileApplication,
    "function",
  );
  assert.equal(
    typeof ApplicationsApi.GeotechnicalEmbeddedRetainingWallApplication,
    "function",
  );
  assert.equal(
    typeof ApplicationsApi.GeotechnicalGroundAnchorApplication,
    "function",
  );
  assert.equal(
    typeof ApplicationsApi.ShallowFoundationServiceabilityAnalysis,
    "function",
  );
});

test("granular ESM subpaths expose applications, solvers and catalogs", () => {
  assert.equal(typeof RcDeflectionApi.CrackedSectionDeflectionAnalysis, "function");
  assert.equal(typeof MasonryPiersApi.NTC2018MasonryPierAnalysis, "function");
  assert.equal(typeof RcPlatesApi.ReinforcedConcretePlateVerification, "function");
  assert.equal(typeof RcPlatesApi.woodArmer, "function");
  assert.equal(typeof RcPunchingApi.PunchingVerificationRequest, "function");
  assert.equal(
    typeof RcPunchingApi.ReinforcedConcretePunchingApplication,
    "function",
  );
  assert.equal(typeof RcPunchingApi.verifyPunching, "function");
  assert.equal(typeof RcPunchingApi.getRcPunchingDesignCodeManifest, "function");
  assert.equal(typeof RcColumnsApi.ReinforcedConcreteColumnVerification, "function");
  assert.equal(
    typeof RcFootingsApi.ReinforcedConcreteIsolatedFootingVerification,
    "function",
  );
  assert.equal(typeof RcFoundationBeamsApi.FoundationBeamAnalysis, "function");
  assert.equal(
    typeof RcFoundationBeamsApi.ReinforcedConcreteFoundationBeamModel,
    "function",
  );
  assert.equal(
    typeof RcBeamColumnJointsApi.ReinforcedConcreteBeamColumnJointVerification,
    "function",
  );
  assert.equal(
    typeof RcStrutAndTieApi.ReinforcedConcreteStrutAndTieVerification,
    "function",
  );
  assert.equal(
    typeof SlopeStabilityApi.GeotechnicalSlopeStabilityApplication,
    "function",
  );
  assert.equal(
    typeof SlopeStabilityApi.CircularSlopeStabilityAnalysis,
    "function",
  );
  assert.equal(typeof SlopeStabilityApi.spencerMethod, "function");
  assert.equal(
    typeof ShallowFoundationApi.GeotechnicalShallowFoundationApplication,
    "function",
  );
  assert.equal(
    typeof ShallowFoundationApi.ShallowFoundationUltimateLimitStateAnalysis,
    "function",
  );
  assert.equal(
    typeof ShallowFoundationApi.ShallowFoundationServiceabilityAnalysis,
    "function",
  );
  assert.equal(
    typeof ShallowFoundationApi.calculateRigidFoundationElasticStiffness,
    "function",
  );
  assert.equal(
    typeof RetainingWallApi.GeotechnicalRetainingWallApplication,
    "function",
  );
  assert.equal(typeof RetainingWallApi.RetainingWallModel, "function");
  assert.equal(typeof RetainingWallApi.RetainingWallAnalysis, "function");
  assert.equal(
    typeof DeepFoundationApi.GeotechnicalDeepFoundationApplication,
    "function",
  );
  assert.equal(typeof DeepFoundationApi.DeepFoundationModel, "function");
  assert.equal(typeof DeepFoundationApi.AxialPileLoadScenario, "function");
  assert.equal(typeof DeepFoundationApi.AxialPileCapacityAnalysis, "function");
  assert.equal(
    typeof LateralPileApi.GeotechnicalLateralPileApplication,
    "function",
  );
  assert.equal(typeof LateralPileApi.DeepFoundationModel, "function");
  assert.equal(typeof LateralPileApi.LateralPileLoadScenario, "function");
  assert.equal(typeof LateralPileApi.LateralPileCapacityAnalysis, "function");
  assert.equal(typeof LateralPileApi.PileTransferLaw, "function");
  assert.equal(typeof LateralPileApi.LateralPileResponseScenario, "function");
  assert.equal(
    typeof LateralPileApi.LateralPileBeamOnSpringsAnalysis,
    "function",
  );
  assert.equal(
    typeof EmbeddedRetainingWallApi
      .GeotechnicalEmbeddedRetainingWallApplication,
    "function",
  );
  assert.equal(
    typeof EmbeddedRetainingWallApi.EmbeddedRetainingWallModel,
    "function",
  );
  assert.equal(
    typeof EmbeddedRetainingWallApi.EmbeddedRetainingWallScenario,
    "function",
  );
  assert.equal(
    typeof EmbeddedRetainingWallApi.EmbeddedRetainingWallAnalysis,
    "function",
  );
  assert.equal(
    typeof EmbeddedRetainingWallApi.WallSoilReactionLaw,
    "function",
  );
  assert.equal(
    typeof GroundAnchorApi.GeotechnicalGroundAnchorApplication,
    "function",
  );
  assert.equal(typeof GroundAnchorApi.GroundAnchorModel, "function");
  assert.equal(typeof GroundAnchorApi.GroundAnchorAnalysis, "function");
  assert.equal(
    typeof GroundAnchorApi.getGroundAnchorBondCatalogEntry,
    "function",
  );
  assert.equal(typeof FemApi.LinearStaticSolver2D, "function");
  assert.equal(typeof FemApi.CyclicMasonryPier2D, "function");
  assert.equal(typeof FemApi.CyclicMasonryPierAnalysis2D, "function");
  assert.equal(typeof FemApi.createFemCapabilitiesContract, "function");
  assert.equal(typeof FemApi.createGlobalFemModelContract, "function");
  assert.equal(typeof FemApi.createGlobalFemAnalysisContract, "function");
  assert.equal(typeof FemApi.createFemEntityMappingContract, "function");
  assert.equal(typeof FemApi.createGlobalFemResultContract, "function");
  assert.equal(typeof FemApi.validateGlobalFemContractSet, "function");
  assert.equal(FemApi.GLOBAL_FEM_CONTRACT_VERSION, 0);
  assert.equal(typeof ApplicationsApi.GlobalFemPostProcessingApplication, "function");
  assert.equal(
    typeof GlobalFemPostprocessingApi.GlobalFemPostProcessingApplication,
    "function",
  );
  assert.equal(
    typeof GlobalFemPostprocessingApi.evaluateGlobalFemVerificationReadiness,
    "function",
  );
  assert.equal(typeof MathApi.BandedLinearSolver, "function");
  assert.equal(typeof MathApi.rayPolygonCapacity, "function");
  assert.equal(typeof GeotechnicsApi.SoilMaterial, "function");
  assert.equal(typeof GeotechnicsApi.GroundSection2D, "function");
  assert.equal(typeof GeotechnicsApi.PorePressureField2D, "function");
  assert.equal(typeof GeotechnicsApi.GroundModel, "function");
  assert.equal(typeof GeotechnicsApi.DeepFoundationModel, "function");
  assert.equal(typeof GeotechnicsApi.AxialPileCapacityAnalysis, "function");
  assert.equal(typeof GeotechnicsApi.LateralPileLoadScenario, "function");
  assert.equal(typeof GeotechnicsApi.LateralPileCapacityAnalysis, "function");
  assert.equal(typeof GeotechnicsApi.PileTransferLaw, "function");
  assert.equal(typeof GeotechnicsApi.WallSoilReactionLaw, "function");
  assert.equal(
    typeof GeotechnicsApi.EmbeddedRetainingWallModel,
    "function",
  );
  assert.equal(
    typeof GeotechnicsApi.EmbeddedRetainingWallScenario,
    "function",
  );
  assert.equal(
    typeof GeotechnicsApi.EmbeddedRetainingWallAnalysis,
    "function",
  );
  assert.equal(
    typeof GeotechnicsApi.LateralPileResponseScenario,
    "function",
  );
  assert.equal(
    typeof GeotechnicsApi.LateralPileBeamOnSpringsAnalysis,
    "function",
  );
  assert.equal(
    typeof GeotechnicsApi.GeotechnicalDesignSituation,
    "function",
  );
  assert.equal(typeof GeotechnicsApi.PressureDiagram2D, "function");
  assert.equal(typeof GeotechnicsApi.CircularSlipSurface2D, "function");
  assert.equal(typeof GeotechnicsApi.SlopeSliceDiscretizer2D, "function");
  assert.equal(typeof GeotechnicsApi.spencerMethod, "function");
  assert.equal(typeof GeotechnicsApi.ShallowFoundationModel, "function");
  assert.equal(typeof GeotechnicsApi.RetainingWallModel, "function");
  assert.equal(
    typeof GeotechnicsApi.ShallowFoundationServiceabilityAnalysis,
    "function",
  );
  assert.equal(typeof GeotechnicsApi.SOIL_DEFORMATION_MODELS, "object");
  assert.equal(
    typeof GeotechnicsApi.calculateShallowFoundationBearingCapacity,
    "function",
  );
  assert.equal(
    typeof GeotechnicsApi.coulombPassiveEarthPressureCoefficient,
    "function",
  );
  assert.equal(typeof SoilTypesApi.createSoilMaterialFromType, "function");
  assert.equal(
    typeof WallInterfaceTypesApi.createSoilStructureInterfaceFromWallSurface,
    "function",
  );
  assert.equal(
    WallInterfaceTypesApi.WALL_SURFACE_TYPE_CATALOG["formed-concrete"]
      .materialType,
    "concrete",
  );
  assert.equal(typeof StrutAndTieApi.StrutAndTieAnalysis2D, "function");
  assert.ok(SteelProfilesApi.STEEL_PROFILE_FAMILIES.includes("IPE"));
  assert.equal(
    SteelProfilesApi.getSteelProfileSectionData("UPN200").family,
    "UPN",
  );
});

test("ntc2018 subpath export exposes normative adapters", () => {
  assert.equal(typeof Ntc2018Api.createNTC2018ConcreteMaterial, "function");
  assert.equal(typeof Ntc2018Api.evaluateNTC2018MasonryPier, "function");
  assert.equal(
    typeof Ntc2018Api.calculateNTC2018MasonryPierSlidingCapacity,
    "function",
  );
  assert.equal(typeof Ntc2018Api.createNTC2018BeamCombinations, "function");
  assert.equal(typeof Ntc2018Api.NTC2018_CONCRETE_CLASSES, "object");
  assert.equal(typeof Ntc2018Api.calculateNTC2018JointCompressionCapacity, "function");
  assert.equal(
    typeof Ntc2018Api.calculateNTC2018PermanentAreaLoads,
    "function",
  );
  assert.equal(typeof Ntc2018Api.NTC2018_UNIT_WEIGHT_CATALOG, "object");
  assert.equal(typeof Ntc2018Api.NTC2018_IMPOSED_LOAD_CATALOG, "object");
  assert.equal(
    typeof Ntc2018Api.resolveNTC2018ImposedLoadDefinition,
    "function",
  );
  assert.equal(
    typeof Ntc2018Api.calculateNTC2018ImposedLoadMultiStoreyReduction,
    "function",
  );
  assert.equal(
    typeof Ntc2018Api.calculateNTC2018HorizontalElasticSpectrum,
    "function",
  );
  assert.equal(typeof Ntc2018Api.NTC2018_SEISMIC_LIMIT_STATES, "object");
  assert.equal(typeof Ntc2018Api.classifyNTC2018Topography, "function");
  assert.equal(
    typeof Ntc2018Api.NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD,
    "object",
  );
  assert.equal(typeof Ntc2018Api.calculateNTC2018SnowAreaLoad, "function");
  assert.equal(typeof Ntc2018Api.NTC2018_SNOW_GROUND_ZONES, "object");
  assert.equal(
    typeof Ntc2018Api.calculateNTC2018BuildingThermalActions,
    "function",
  );
  assert.equal(
    typeof Ntc2018Api.NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES,
    "object",
  );
  assert.equal(typeof Ntc2018Api.calculateNTC2018WindAreaLoad, "function");
  assert.equal(typeof Ntc2018Api.NTC2018_WIND_ZONES, "object");
});

test("terrain subpath export exposes the serializable elevation grid contract", () => {
  assert.equal(typeof TerrainApi.normalizeTerrainElevationGrid, "function");
  assert.equal(
    TerrainApi.TERRAIN_ELEVATION_GRID_SCHEMA_VERSION,
    "terrain-elevation-grid/v1",
  );
});

test("en1992 subpath export exposes strut-and-tie normative helpers", () => {
  assert.equal(typeof En1992Api.calculateEn1992StrutDesignStrength, "function");
  assert.equal(typeof En1992Api.calculateEn1992NodalDesignStrength, "function");
});

test("italian historical subpath export exposes reinforcement steel adapters", () => {
  assert.equal(
    typeof ItalianHistoricalApi.createItalianHistoricalReinforcementSteelMaterial,
    "function",
  );
  assert.equal(
    typeof ItalianHistoricalApi.ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES,
    "object",
  );
});
