import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGeotechnicalLateralPileValidationReport,
  runGeotechnicalLateralPileValidationCampaign,
} from "../validation/geotechnicalLateralPileValidationCampaign.js";

test("lateral-pile validation campaign passes independent Broms checks", () => {
  const campaign = runGeotechnicalLateralPileValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 3);
  assert.equal(campaign.passed, 3);
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.results.every(({ sourceKind }) =>
    sourceKind.includes("independent")));
  assert.ok(campaign.results.every(({ checks }) => checks.length > 0));

  const report = formatGeotechnicalLateralPileValidationReport(campaign);
  assert.match(report, /Status: ok/);
  assert.match(report, /broms-cohesive-short-pile: ok/);
  assert.match(report, /broms-cohesionless-short-pile: ok/);
  assert.match(report, /broms-submerged-cohesionless-pile: ok/);
});
