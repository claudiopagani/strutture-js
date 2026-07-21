import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGeotechnicalLateralPilePyValidationReport,
  runGeotechnicalLateralPilePyValidationCampaign,
} from "../validation/geotechnicalLateralPilePyValidationCampaign.js";

test("lateral-pile p-y validation campaign passes independent checks", () => {
  const campaign = runGeotechnicalLateralPilePyValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 3);
  assert.equal(campaign.passed, 3);
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.results.every(({ sourceKind }) =>
    sourceKind.includes("independent")));
  assert.ok(campaign.results.every(({ checks }) => checks.length > 0));

  const report = formatGeotechnicalLateralPilePyValidationReport(campaign);
  assert.match(report, /Status: ok/);
  assert.match(report, /py-euler-bernoulli-cantilever: ok/);
  assert.match(report, /py-linear-semi-infinite-winkler: ok/);
  assert.match(report, /py-nonlinear-plateau-equilibrium: ok/);
});
