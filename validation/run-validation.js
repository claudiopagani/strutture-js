import {
  formatBeamValidationReport,
  runBeamValidationCampaign,
} from "./beamValidationCampaign.js";
import {
  formatPunchingValidationReport,
  runPunchingValidationCampaign,
} from "./punchingValidationCampaign.js";
import {
  formatGeotechnicalValidationReport,
  runGeotechnicalValidationCampaign,
} from "./geotechnicalValidationCampaign.js";
import {
  formatGeotechnicalSlopeStabilityValidationReport,
  runGeotechnicalSlopeStabilityValidationCampaign,
} from "./geotechnicalSlopeStabilityValidationCampaign.js";
import {
  formatGeotechnicalShallowFoundationValidationReport,
  runGeotechnicalShallowFoundationValidationCampaign,
} from "./geotechnicalShallowFoundationValidationCampaign.js";
import {
  formatGeotechnicalShallowFoundationServiceabilityValidationReport,
  runGeotechnicalShallowFoundationServiceabilityValidationCampaign,
} from
  "./geotechnicalShallowFoundationServiceabilityValidationCampaign.js";
import {
  formatGeotechnicalRetainingWallValidationReport,
  runGeotechnicalRetainingWallValidationCampaign,
} from "./geotechnicalRetainingWallValidationCampaign.js";
import {
  formatGeotechnicalDeepFoundationValidationReport,
  runGeotechnicalDeepFoundationValidationCampaign,
} from "./geotechnicalDeepFoundationValidationCampaign.js";
import {
  formatGeotechnicalLateralPileValidationReport,
  runGeotechnicalLateralPileValidationCampaign,
} from "./geotechnicalLateralPileValidationCampaign.js";
import {
  formatGeotechnicalLateralPilePyValidationReport,
  runGeotechnicalLateralPilePyValidationCampaign,
} from "./geotechnicalLateralPilePyValidationCampaign.js";
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
const geotechnicalCampaign = runGeotechnicalValidationCampaign();
const geotechnicalSlopeStabilityCampaign =
  runGeotechnicalSlopeStabilityValidationCampaign();
const geotechnicalShallowFoundationCampaign =
  runGeotechnicalShallowFoundationValidationCampaign();
const geotechnicalShallowFoundationServiceabilityCampaign =
  runGeotechnicalShallowFoundationServiceabilityValidationCampaign();
const geotechnicalRetainingWallCampaign =
  runGeotechnicalRetainingWallValidationCampaign();
const geotechnicalDeepFoundationCampaign =
  runGeotechnicalDeepFoundationValidationCampaign();
const geotechnicalLateralPileCampaign =
  runGeotechnicalLateralPileValidationCampaign();
const geotechnicalLateralPilePyCampaign =
  runGeotechnicalLateralPilePyValidationCampaign();
const cyclicMasonryPierCampaign = runCyclicMasonryPierValidationCampaign();
const ntc2018MasonryPierCampaign = runNTC2018MasonryPierValidationCampaign();
const wantsJson = process.argv.includes("--json");

if (wantsJson) {
  console.log(JSON.stringify({
    campaign,
    punchingCampaign,
    geotechnicalCampaign,
    geotechnicalSlopeStabilityCampaign,
    geotechnicalShallowFoundationCampaign,
    geotechnicalShallowFoundationServiceabilityCampaign,
    geotechnicalRetainingWallCampaign,
    geotechnicalDeepFoundationCampaign,
    geotechnicalLateralPileCampaign,
    geotechnicalLateralPilePyCampaign,
    cyclicMasonryPierCampaign,
    ntc2018MasonryPierCampaign,
  }, null, 2));
} else {
  console.log(formatBeamValidationReport(campaign));
  console.log("");
  console.log(formatPunchingValidationReport(punchingCampaign));
  console.log("");
  console.log(formatGeotechnicalValidationReport(geotechnicalCampaign));
  console.log("");
  console.log(formatGeotechnicalSlopeStabilityValidationReport(
    geotechnicalSlopeStabilityCampaign,
  ));
  console.log("");
  console.log(formatGeotechnicalShallowFoundationValidationReport(
    geotechnicalShallowFoundationCampaign,
  ));
  console.log("");
  console.log(formatGeotechnicalShallowFoundationServiceabilityValidationReport(
    geotechnicalShallowFoundationServiceabilityCampaign,
  ));
  console.log("");
  console.log(formatGeotechnicalRetainingWallValidationReport(
    geotechnicalRetainingWallCampaign,
  ));
  console.log("");
  console.log(formatGeotechnicalDeepFoundationValidationReport(
    geotechnicalDeepFoundationCampaign,
  ));
  console.log("");
  console.log(formatGeotechnicalLateralPileValidationReport(
    geotechnicalLateralPileCampaign,
  ));
  console.log("");
  console.log(formatGeotechnicalLateralPilePyValidationReport(
    geotechnicalLateralPilePyCampaign,
  ));
  console.log("");
  console.log(formatCyclicMasonryPierValidationReport(cyclicMasonryPierCampaign));
  console.log("");
  console.log(formatNTC2018MasonryPierValidationReport(ntc2018MasonryPierCampaign));
}

if (
  campaign.status !== "ok" ||
  punchingCampaign.status !== "ok" ||
  geotechnicalCampaign.status !== "ok" ||
  geotechnicalSlopeStabilityCampaign.status !== "ok" ||
  geotechnicalShallowFoundationCampaign.status !== "ok" ||
  geotechnicalShallowFoundationServiceabilityCampaign.status !== "ok" ||
  geotechnicalRetainingWallCampaign.status !== "ok" ||
  geotechnicalDeepFoundationCampaign.status !== "ok" ||
  geotechnicalLateralPileCampaign.status !== "ok" ||
  geotechnicalLateralPilePyCampaign.status !== "ok" ||
  cyclicMasonryPierCampaign.status !== "ok" ||
  ntc2018MasonryPierCampaign.status !== "ok"
) {
  process.exitCode = 1;
}
