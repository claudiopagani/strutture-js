import { VerificationResult } from "../../core/results/VerificationResult.js";
import {
  governingCheck,
  round,
  utilizationCheck,
} from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import {
  calculateEn1992AnchorageLength,
  calculateEn1992DesignBondStrength,
} from "../../norms/en1992/reinforced-concrete/index.js";

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function minCheck(id, description, required, provided, metadata = {}) {
  return utilizationCheck({ id, description, demand: required, capacity: provided, metadata });
}

function maxCheck(id, description, provided, allowed, metadata = {}) {
  return utilizationCheck({ id, description, demand: provided, capacity: allowed, metadata });
}

function ductilityClass(value) {
  const normalized = String(value ?? "").toUpperCase().replaceAll('"', "").replaceAll("-", "");
  if (["CDA", "A"].includes(normalized)) return "CDA";
  if (["CDB", "B"].includes(normalized)) return "CDB";
  throw new Error(`Unsupported NTC 2018 ductility class: ${value}.`);
}

export class ReinforcedConcreteColumnDetailingVerification {
  constructor({ code = "NTC2018" } = {}) {
    this.code = code;
  }

  verify({ model, compression, normalizedAxialForce } = {}) {
    const detailing = model.detailing;

    if (!detailing) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-columns",
        status: RESULT_STATUS.NOT_ANALYZED,
        summary: "Column detailing was not requested.",
        warnings: ["Pass the detailing contract to verify column reinforcement and confinement."],
        metadata: { code: this.code },
      });
    }

    const concrete = model.section.concreteSection ?? model.section;
    const width = positive(Number(concrete.width), "column width");
    const depth = positive(Number(concrete.height), "column depth");
    const area = positive(Number(concrete.area), "column concrete area");
    const longitudinal = detailing.longitudinal ?? {};
    const transverse = detailing.transverse ?? {};
    const reinforcementArea = positive(
      Number(longitudinal.area ?? model.section.totalReinforcementArea?.()),
      "detailing.longitudinal.area",
    );
    const minBarDiameter = positive(
      Number(longitudinal.minimumBarDiameter),
      "detailing.longitudinal.minimumBarDiameter",
    );
    const maxBarDiameter = positive(
      Number(longitudinal.maximumBarDiameter ?? minBarDiameter),
      "detailing.longitudinal.maximumBarDiameter",
    );
    const maxBarSpacing = positive(
      Number(longitudinal.maximumBarSpacing),
      "detailing.longitudinal.maximumBarSpacing",
    );
    const hoopDiameter = positive(Number(transverse.diameter), "detailing.transverse.diameter");
    const hoopSpacing = positive(Number(transverse.spacing), "detailing.transverse.spacing");
    const fyd = positive(Number(model.reinforcementMaterial?.fyd), "reinforcement fyd");
    const fyk = positive(Number(model.reinforcementMaterial?.fyk), "reinforcement fyk");
    const fywd = positive(
      Number(transverse.designStrength ?? model.reinforcementMaterial?.fyd),
      "transverse design strength",
    );
    const minimumArea = Math.max(0.1 * compression / fyd, 0.003 * area);
    const maximumArea = 0.04 * area;
    const ordinaryHoopSpacing = Math.min(12 * minBarDiameter, 250);
    const ordinaryHoopDiameter = Math.max(6, maxBarDiameter / 4);
    const checks = [
      minCheck("rc-column-minimum-longitudinal-area", "Minimum column longitudinal reinforcement", minimumArea, reinforcementArea, { reference: "NTC2018-4.1.46" }),
      maxCheck("rc-column-maximum-longitudinal-area", "Maximum column longitudinal reinforcement outside lap zones", reinforcementArea, maximumArea, { reference: "NTC2018-4.1.6.1.2" }),
      maxCheck("rc-column-maximum-longitudinal-spacing", "Maximum column longitudinal bar spacing", maxBarSpacing, 300, { reference: "NTC2018-4.1.6.1.2" }),
      minCheck("rc-column-minimum-longitudinal-diameter", "Minimum column longitudinal bar diameter", 12, minBarDiameter, { reference: "NTC2018-4.1.6.1.2" }),
      maxCheck("rc-column-ordinary-hoop-spacing", "Ordinary column hoop spacing", hoopSpacing, ordinaryHoopSpacing, { reference: "NTC2018-4.1.6.1.2" }),
      minCheck("rc-column-ordinary-hoop-diameter", "Ordinary column hoop diameter", ordinaryHoopDiameter, hoopDiameter, { reference: "NTC2018-4.1.6.1.2" }),
    ];
    let seismicOutputs = null;

    if (detailing.seismic?.enabled === true) {
      const dc = ductilityClass(detailing.seismic.ductilityClass);
      const isCda = dc === "CDA";
      const clearHeight = positive(
        Number(detailing.seismic.clearHeight ?? model.length),
        "detailing.seismic.clearHeight",
      );
      const sectionDepthInBending = positive(
        Number(detailing.seismic.sectionDepthInBending ?? Math.max(width, depth)),
        "detailing.seismic.sectionDepthInBending",
      );
      const criticalZoneLength = clearHeight < 3 * sectionDepthInBending
        ? clearHeight
        : Math.max(sectionDepthInBending, clearHeight / 6, 450);
      const longitudinalRatio = reinforcementArea / area;
      const seismicHoopDiameter = isCda
        ? Math.max(6, 0.4 * maxBarDiameter * Math.sqrt(fyd / fywd))
        : 6;
      const seismicHoopSpacing = Math.min(
        Math.min(width, depth) / (isCda ? 3 : 2),
        isCda ? 125 : 175,
        (isCda ? 6 : 8) * minBarDiameter,
      );
      const restrainedSpacingLimit = isCda ? 150 : 200;
      const confinement = detailing.confinement ?? {};
      const coreWidth = positive(Number(confinement.coreWidth), "confinement.coreWidth");
      const coreDepth = positive(Number(confinement.coreDepth), "confinement.coreDepth");
      const volumePerSet = positive(Number(confinement.volumePerSet), "confinement.volumePerSet");
      const restrainedSpacings = confinement.restrainedBarSpacings ?? [];

      if (restrainedSpacings.length === 0) {
        throw new Error("confinement.restrainedBarSpacings must not be empty.");
      }

      const alphaN = Math.max(
        0,
        1 - restrainedSpacings.reduce((sum, value) => sum + value ** 2, 0) /
          (6 * coreWidth * coreDepth),
      );
      const alphaS = Math.max(0, 1 - hoopSpacing / (2 * coreWidth)) *
        Math.max(0, 1 - hoopSpacing / (2 * coreDepth));
      const alpha = alphaN * alphaS;
      const volumetricRatio = volumePerSet / (coreWidth * coreDepth * hoopSpacing);
      const omegaWd = volumetricRatio * fywd / model.concreteMaterial.fcd;
      const epsilonSyD = fyd / positive(
        Number(model.reinforcementMaterial.elasticModulus),
        "reinforcement elastic modulus",
      );
      const muPhi = positive(
        Number(detailing.seismic.curvatureDuctilityDemand),
        "detailing.seismic.curvatureDuctilityDemand",
      );
      const ductilityDemand = Math.max(
        0,
        30 * muPhi * epsilonSyD * normalizedAxialForce * (Math.min(width, depth) / Math.min(coreWidth, coreDepth)) - 0.035,
      );
      const omegaMinimum = isCda ? 0.12 : 0.08;

      checks.push(
        minCheck("rc-column-seismic-minimum-dimension", "Minimum dissipative column dimension", 250, Math.min(width, depth), { reference: "NTC2018-7.4.6.1.2" }),
        minCheck("rc-column-seismic-longitudinal-ratio-min", "Minimum seismic longitudinal reinforcement ratio", 0.01, longitudinalRatio, { reference: "NTC2018-7.4.28" }),
        maxCheck("rc-column-seismic-longitudinal-ratio-max", "Maximum seismic longitudinal reinforcement ratio", longitudinalRatio, 0.04, { reference: "NTC2018-7.4.28" }),
        maxCheck("rc-column-seismic-longitudinal-spacing", "Maximum seismic longitudinal bar spacing", maxBarSpacing, 250, { reference: "NTC2018-7.4.6.2.2" }),
        minCheck("rc-column-seismic-hoop-diameter", "Minimum confinement hoop diameter", seismicHoopDiameter, hoopDiameter, { reference: "NTC2018-7.4.6.2.2" }),
        maxCheck("rc-column-seismic-hoop-spacing", "Maximum confinement hoop spacing", hoopSpacing, seismicHoopSpacing, { reference: "NTC2018-7.4.6.2.2" }),
        maxCheck("rc-column-seismic-restrained-bar-spacing", "Maximum spacing between laterally restrained bars", Math.max(...restrainedSpacings), restrainedSpacingLimit, { reference: "NTC2018-7.4.6.2.2" }),
        minCheck("rc-column-seismic-omega-wd", "Minimum mechanical confinement ratio", omegaMinimum, omegaWd, { reference: "NTC2018-7.4.30" }),
        minCheck("rc-column-seismic-ductility-confinement", "Confinement for curvature ductility demand", ductilityDemand, alpha * omegaWd, { reference: "NTC2018-7.4.29-7.4.31" }),
      );
      seismicOutputs = {
        ductilityClass: dc,
        criticalZoneLength,
        longitudinalRatio,
        seismicHoopDiameter,
        seismicHoopSpacing,
        alphaN,
        alphaS,
        alpha,
        volumetricRatio,
        omegaWd,
        omegaMinimum,
        curvatureDuctilityDemand: muPhi,
        ductilityConfinementDemand: ductilityDemand,
      };
    }

    let anchorageOutput = null;
    if (detailing.anchorage) {
      const anchor = detailing.anchorage;
      const fctd = positive(
        Number(anchor.fctd ?? 0.7 * model.concreteMaterial.fctm /
          model.concreteMaterial.metadata.gammaC),
        "anchorage.fctd",
      );
      const bond = calculateEn1992DesignBondStrength({
        fctd,
        barDiameter: anchor.barDiameter,
        bondConditionFactor: anchor.bondConditionFactor ?? 1,
      });
      const base = calculateEn1992AnchorageLength({
        barDiameter: anchor.barDiameter,
        designSteelStress: anchor.designSteelStress ?? fyd,
        fbd: bond.fbd,
        tension: anchor.tension !== false,
        nationalMinimumDiameterMultiple: 20,
        nationalMinimumLength: 150,
      });
      const axialTension = compression <= 0 && Math.abs(model.actions.nEd) > 0;
      const requiredLength = base.designLength * (axialTension ? 1.5 : 1);
      checks.push(minCheck("rc-column-longitudinal-anchorage", "Column longitudinal bar anchorage", requiredLength, anchor.availableLength, { reference: axialTension ? "NTC2018-7.4.6.2.2" : "NTC2018-4.1.2.3.10", fbd: round(bond.fbd), axialTensionFactor: axialTension ? 1.5 : 1 }));
      anchorageOutput = { ...base, requiredLength, fbd: bond.fbd };
    }

    const governing = governingCheck(checks);
    const ok = checks.every((check) => check.ok === true);

    return new VerificationResult({
      applicationId: "reinforced-concrete-columns",
      status: ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary: "NTC 2018 column reinforcement, confinement and ductility verification.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        reinforcementArea,
        longitudinalRatio: reinforcementArea / area,
        seismic: seismicOutputs,
        anchorage: anchorageOutput,
      },
      assumptions: [
        "Confinement volumePerSet is the total steel volume effective in one transverse-reinforcement set inside the core.",
        "restrainedBarSpacings contains every clear centre-line spacing between consecutive laterally restrained longitudinal bars around the core.",
      ],
      metadata: { code: this.code, governingCheckId: governing?.id ?? null },
    });
  }
}
