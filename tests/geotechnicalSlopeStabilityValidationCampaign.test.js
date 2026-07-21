import test from "node:test";
import assert from "node:assert/strict";

import {
  formatGeotechnicalSlopeStabilityValidationReport,
  runGeotechnicalSlopeStabilityValidationCampaign,
} from "../validation/geotechnicalSlopeStabilityValidationCampaign.js";

test("slope-stability validation campaign passes independent checks", () => {
  const campaign = runGeotechnicalSlopeStabilityValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 7);
  assert.equal(campaign.passed, 7);
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.results.every((result) => result.checks.length > 0));
  assert.ok(campaign.results.every((result) =>
    result.sourceKind.includes("independent")));

  const report = formatGeotechnicalSlopeStabilityValidationReport(campaign);
  assert.match(report, /Status: ok/);
  assert.match(report, /circular-segment-area-and-weight: ok/);
  assert.match(report, /spencer-pseudostatic-phi-zero-closed-form: ok/);
  assert.match(report, /fhwa-ground-anchor-surface-intersection: ok/);
  assert.match(report, /spencer-ground-anchor-point-force-closed-form: ok/);
});
