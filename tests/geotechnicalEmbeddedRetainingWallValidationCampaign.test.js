import test from "node:test";
import assert from "node:assert/strict";

import {
  runGeotechnicalEmbeddedRetainingWallValidationCampaign,
} from "../validation/geotechnicalEmbeddedRetainingWallValidationCampaign.js";

test("embedded retaining-wall validation campaign passes", () => {
  const campaign = runGeotechnicalEmbeddedRetainingWallValidationCampaign();

  assert.equal(campaign.status, "ok");
  assert.equal(campaign.caseCount, 3);
  assert.equal(campaign.failed, 0);
});
