import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGeotechnicalDeepFoundationValidationReport,
  runGeotechnicalDeepFoundationValidationCampaign,
} from "../validation/geotechnicalDeepFoundationValidationCampaign.js";

test("deep-foundation validation campaign passes independent checks", () => {
  const campaign = runGeotechnicalDeepFoundationValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 3);
  assert.equal(campaign.passed, 3);
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.results.every(({ sourceKind }) =>
    sourceKind.includes("independent")));
  assert.ok(campaign.results.every(({ checks }) => checks.length > 0));

  const report = formatGeotechnicalDeepFoundationValidationReport(campaign);
  assert.match(report, /Status: ok/);
  assert.match(report, /layered-effective-stress-capacity: ok/);
  assert.match(report, /undrained-alpha-nc-capacity: ok/);
  assert.match(report, /tension-shaft-only-capacity: ok/);
});
