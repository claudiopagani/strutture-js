import assert from "node:assert/strict";
import test from "node:test";

import {
  formatGeotechnicalShallowFoundationServiceabilityValidationReport,
  runGeotechnicalShallowFoundationServiceabilityValidationCampaign,
} from
  "../validation/geotechnicalShallowFoundationServiceabilityValidationCampaign.js";

test("shallow-foundation SLS validation campaign passes independent checks", () => {
  const campaign =
    runGeotechnicalShallowFoundationServiceabilityValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 4);
  assert.equal(campaign.passed, 4);
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.results.every((caseResult) =>
    caseResult.sourceKind.includes("independent")));
  assert.ok(campaign.results.every((caseResult) =>
    caseResult.checks.length > 0));

  const report =
    formatGeotechnicalShallowFoundationServiceabilityValidationReport(campaign);
  assert.match(report, /Status: ok/);
  assert.match(report, /usace-schmertmann-c7-equation-path: ok/);
  assert.match(report, /nist-pais-kausel-rigid-rectangle: ok/);
});
