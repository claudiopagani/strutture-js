import test from "node:test";
import assert from "node:assert/strict";

import * as PublicApi from "strutture-js";
import * as ApplicationsApi from "strutture-js/applications";
import * as RcDeflectionApi from "strutture-js/applications/rc-cracked-deflection";
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
  assert.equal(typeof PublicApi.runScaRcDeflectionAnalysis, "function");
  assert.equal(typeof PublicApi.HyperstaticDeflectionIteration, "function");
  assert.equal(typeof PublicApi.SectionMomentCurvatureCurve, "function");
  assert.equal(typeof PublicApi.RESULT_STATUS, "object");
});

test("applications subpath export exposes application registry helpers", () => {
  assert.equal(typeof ApplicationsApi.createDefaultApplicationRegistry, "function");
  assert.equal(typeof ApplicationsApi.SingleBeamDesignApplication, "function");
  assert.equal(typeof ApplicationsApi.MasonryWallOpeningsApplication, "function");
  assert.equal(typeof ApplicationsApi.runScaRcDeflectionAnalysis, "function");
  assert.equal(typeof ApplicationsApi.HyperstaticDeflectionIteration, "function");
  assert.equal(typeof ApplicationsApi.SectionMomentCurvatureCurve, "function");
  assert.equal(typeof ApplicationsApi.getSteelVerificationCapabilities, "function");
});

test("granular ESM subpaths expose applications, solvers and catalogs", () => {
  assert.equal(typeof RcDeflectionApi.CrackedSectionDeflectionAnalysis, "function");
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
