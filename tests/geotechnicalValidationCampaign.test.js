import test from "node:test";
import assert from "node:assert/strict";

import {
  formatGeotechnicalValidationReport,
  runGeotechnicalValidationCampaign,
} from "../validation/geotechnicalValidationCampaign.js";

test("geotechnical validation campaign passes its independent benchmarks", () => {
  const campaign = runGeotechnicalValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 13);
  assert.equal(campaign.passed, 13);
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.results.every((result) => result.checks.length > 0));
  assert.ok(campaign.results.every((result) =>
    result.sourceKind.includes("independent")));

  const report = formatGeotechnicalValidationReport(campaign);
  assert.match(report, /Status: ok/);
  assert.match(report, /mononobe-okabe-dry-active: ok/);
});
