import test from "node:test";
import assert from "node:assert/strict";

import * as PublicApi from "classi-strutturali";
import * as ApplicationsApi from "classi-strutturali/applications";
import * as Ntc2018Api from "classi-strutturali/norms/ntc2018";

test("package root export exposes the main public API", () => {
  assert.equal(typeof PublicApi.SingleBeamAnalysis, "function");
  assert.equal(typeof PublicApi.CalculationResult, "function");
  assert.equal(typeof PublicApi.RESULT_STATUS, "object");
});

test("applications subpath export exposes application registry helpers", () => {
  assert.equal(typeof ApplicationsApi.createDefaultApplicationRegistry, "function");
  assert.equal(typeof ApplicationsApi.SingleBeamDesignApplication, "function");
  assert.equal(typeof ApplicationsApi.MasonryWallOpeningsApplication, "function");
});

test("ntc2018 subpath export exposes normative adapters", () => {
  assert.equal(typeof Ntc2018Api.createNTC2018ConcreteMaterial, "function");
  assert.equal(typeof Ntc2018Api.createNTC2018BeamCombinations, "function");
  assert.equal(typeof Ntc2018Api.NTC2018_CONCRETE_CLASSES, "object");
});
