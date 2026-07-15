import {
  formatBeamValidationReport,
  runBeamValidationCampaign,
} from "./beamValidationCampaign.js";
import {
  formatPunchingValidationReport,
  runPunchingValidationCampaign,
} from "./punchingValidationCampaign.js";

const campaign = runBeamValidationCampaign();
const punchingCampaign = runPunchingValidationCampaign();
const wantsJson = process.argv.includes("--json");

if (wantsJson) {
  console.log(JSON.stringify({ campaign, punchingCampaign }, null, 2));
} else {
  console.log(formatBeamValidationReport(campaign));
  console.log("");
  console.log(formatPunchingValidationReport(punchingCampaign));
}

if (campaign.status !== "ok" || punchingCampaign.status !== "ok") {
  process.exitCode = 1;
}
