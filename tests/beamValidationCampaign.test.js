import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBeamValidationReport,
  runBeamValidationCampaign,
} from "../validation/beamValidationCampaign.js";

test("beam validation campaign runs declared numerical cases", () => {
  const campaign = runBeamValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.caseCount >= 4);
  assert.ok(
    campaign.results.every(
      (result) =>
        result.source &&
        result.sourceKind &&
        result.checks.length > 0 &&
        result.checks.every((check) => check.status === "ok"),
    ),
  );
});

test("beam validation campaign can produce a markdown summary", () => {
  const campaign = runBeamValidationCampaign();
  const markdown = formatBeamValidationReport(campaign);

  assert.ok(markdown.includes("# Beam Validation Campaign"));
  assert.ok(markdown.includes("## Summary by Category"));
  assert.ok(markdown.includes("## Case Details"));
  assert.ok(markdown.includes("| Check | Quantity path | Status | Actual | Expected | Tolerance |"));
  assert.ok(markdown.includes("beam-eb-simply-supported-udl"));
  assert.ok(markdown.includes("rc-shear-stirrups-cottheta-optimization"));
});
