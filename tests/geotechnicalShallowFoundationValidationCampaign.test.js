import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGeotechnicalShallowFoundationValidationReport,
  runGeotechnicalShallowFoundationValidationCampaign,
} from "../validation/geotechnicalShallowFoundationValidationCampaign.js";

test("shallow-foundation validation campaign passes independent checks", () => {
  const campaign = runGeotechnicalShallowFoundationValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 4);
  assert.equal(campaign.passed, 4);
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.results.every((caseResult) =>
    caseResult.sourceKind.includes("independent")));
  assert.ok(campaign.results.every((caseResult) =>
    caseResult.checks.length > 0));

  const report = formatGeotechnicalShallowFoundationValidationReport(campaign);
  assert.match(report, /Status: ok/);
  assert.match(report, /usace-example-b3-layered-punch-through: ok/);
  assert.match(report, /usace-base-sliding-closed-form: ok/);
});
