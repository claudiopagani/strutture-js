import test from "node:test";
import assert from "node:assert/strict";

import * as PublicApi from "strutture-js";
import * as ApplicationsApi from "strutture-js/applications";
import * as ItalianHistoricalApi from "strutture-js/norms/italian-historical";
import * as Ntc2018Api from "strutture-js/norms/ntc2018";

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
