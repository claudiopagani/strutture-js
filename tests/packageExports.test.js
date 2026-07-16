import test from "node:test";
import assert from "node:assert/strict";

import * as PublicApi from "strutture-js";
import * as ApplicationsApi from "strutture-js/applications";
import * as RcDeflectionApi from "strutture-js/applications/rc-cracked-deflection";
import * as RcPlatesApi from "strutture-js/applications/reinforced-concrete-plates";
import * as RcPunchingApi from "strutture-js/applications/reinforced-concrete-punching";
import * as RcColumnsApi from "strutture-js/applications/reinforced-concrete-columns";
import * as RcFootingsApi from "strutture-js/applications/reinforced-concrete-isolated-footings";
import * as RcFoundationBeamsApi from "strutture-js/applications/reinforced-concrete-foundation-beams";
import * as RcBeamColumnJointsApi from "strutture-js/applications/reinforced-concrete-beam-column-joints";
import * as FemApi from "strutture-js/domain/fem";
import * as MathApi from "strutture-js/domain/math";
import * as SteelProfilesApi from "strutture-js/catalogs/steel-profiles";
import * as ItalianHistoricalApi from "strutture-js/norms/italian-historical";
import * as Ntc2018Api from "strutture-js/norms/ntc2018";

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
  assert.equal(
    typeof PublicApi.ReinforcedConcreteFoundationBeamApplication,
    "function",
  );
  assert.equal(
    typeof PublicApi.ReinforcedConcreteBeamColumnJointApplication,
    "function",
  );
  assert.equal(typeof PublicApi.calculateNTC2018JointShearDemand, "function");
  assert.equal(typeof PublicApi.ReinforcedConcreteTorsionVerification, "function");
  assert.equal(typeof PublicApi.HyperstaticDeflectionIteration, "function");
  assert.equal(typeof PublicApi.SectionMomentCurvatureCurve, "function");
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
  assert.equal(typeof ApplicationsApi.ReinforcedConcretePlateModel, "function");
  assert.equal(typeof ApplicationsApi.ReinforcedConcreteColumnModel, "function");
  assert.equal(
    typeof ApplicationsApi.ReinforcedConcreteIsolatedFootingModel,
    "function",
  );
  assert.equal(typeof ApplicationsApi.getSteelVerificationCapabilities, "function");
});

test("granular ESM subpaths expose applications, solvers and catalogs", () => {
  assert.equal(typeof RcDeflectionApi.CrackedSectionDeflectionAnalysis, "function");
  assert.equal(typeof RcPlatesApi.ReinforcedConcretePlateVerification, "function");
  assert.equal(typeof RcPlatesApi.woodArmer, "function");
  assert.equal(typeof RcPunchingApi.PunchingVerificationRequest, "function");
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
  assert.equal(typeof FemApi.LinearStaticSolver2D, "function");
  assert.equal(typeof MathApi.BandedLinearSolver, "function");
  assert.ok(SteelProfilesApi.STEEL_PROFILE_FAMILIES.includes("IPE"));
  assert.equal(
    SteelProfilesApi.getSteelProfileSectionData("UPN200").family,
    "UPN",
  );
});

test("ntc2018 subpath export exposes normative adapters", () => {
  assert.equal(typeof Ntc2018Api.createNTC2018ConcreteMaterial, "function");
  assert.equal(typeof Ntc2018Api.createNTC2018BeamCombinations, "function");
  assert.equal(typeof Ntc2018Api.NTC2018_CONCRETE_CLASSES, "object");
  assert.equal(typeof Ntc2018Api.calculateNTC2018JointCompressionCapacity, "function");
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
