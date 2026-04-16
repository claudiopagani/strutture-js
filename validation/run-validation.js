import {
  formatBeamValidationReport,
  runBeamValidationCampaign,
} from "./beamValidationCampaign.js";

const campaign = runBeamValidationCampaign();
const wantsJson = process.argv.includes("--json");

if (wantsJson) {
  console.log(JSON.stringify(campaign, null, 2));
} else {
  console.log(formatBeamValidationReport(campaign));
}

if (campaign.status !== "ok") {
  process.exitCode = 1;
}
