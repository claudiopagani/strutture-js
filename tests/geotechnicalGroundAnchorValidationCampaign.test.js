import test from "node:test";
import assert from "node:assert/strict";

import {
  runGeotechnicalGroundAnchorValidationCampaign,
} from "../validation/geotechnicalGroundAnchorValidationCampaign.js";

test("ground-anchor validation campaign passes", () => {
  const campaign = runGeotechnicalGroundAnchorValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 3);
  assert.equal(campaign.failed, 0);
});
