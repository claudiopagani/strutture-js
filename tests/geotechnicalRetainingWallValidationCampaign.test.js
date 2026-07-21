import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGeotechnicalRetainingWallValidationReport,
  runGeotechnicalRetainingWallValidationCampaign,
} from "../validation/geotechnicalRetainingWallValidationCampaign.js";

test("retaining-wall validation campaign passes independent checks", () => {
  const campaign = runGeotechnicalRetainingWallValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 3);
  assert.equal(campaign.passed, 3);
  assert.equal(campaign.failed, 0);
  assert.ok(campaign.results.every(({ sourceKind }) =>
    sourceKind.includes("independent")));
  assert.ok(campaign.results.every(({ checks }) => checks.length > 0));

  const report = formatGeotechnicalRetainingWallValidationReport(campaign);
  assert.match(report, /Status: ok/);
  assert.match(report, /dry-rankine-rigid-body-equilibrium: ok/);
  assert.match(report, /linear-uplift-resultant: ok/);
});
