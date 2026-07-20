import {
  formatBeamValidationReport,
  runBeamValidationCampaign,
} from "./beamValidationCampaign.js";
import {
  formatPunchingValidationReport,
  runPunchingValidationCampaign,
} from "./punchingValidationCampaign.js";
import {
  formatCyclicMasonryPierValidationReport,
  runCyclicMasonryPierValidationCampaign,
} from "./cyclicMasonryPierValidationCampaign.js";
import {
  formatNTC2018MasonryPierValidationReport,
  runNTC2018MasonryPierValidationCampaign,
} from "./ntc2018MasonryPierValidationCampaign.js";

const campaign = runBeamValidationCampaign();
const punchingCampaign = runPunchingValidationCampaign();
const cyclicMasonryPierCampaign = runCyclicMasonryPierValidationCampaign();
const ntc2018MasonryPierCampaign = runNTC2018MasonryPierValidationCampaign();
const wantsJson = process.argv.includes("--json");

if (wantsJson) {
  console.log(JSON.stringify({
    campaign,
    punchingCampaign,
    cyclicMasonryPierCampaign,
    ntc2018MasonryPierCampaign,
  }, null, 2));
} else {
  console.log(formatBeamValidationReport(campaign));
  console.log("");
  console.log(formatPunchingValidationReport(punchingCampaign));
  console.log("");
  console.log(formatCyclicMasonryPierValidationReport(cyclicMasonryPierCampaign));
  console.log("");
  console.log(formatNTC2018MasonryPierValidationReport(ntc2018MasonryPierCampaign));
}

if (
  campaign.status !== "ok" ||
  punchingCampaign.status !== "ok" ||
  cyclicMasonryPierCampaign.status !== "ok" ||
  ntc2018MasonryPierCampaign.status !== "ok"
) {
  process.exitCode = 1;
}
