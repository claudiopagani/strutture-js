import { VerificationResult } from "../../../core/results/VerificationResult.js";
import {
  governingCheck,
  round,
  utilizationCheck,
} from "../../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import {
  calculateEn1992AnchorageLength,
  calculateEn1992DesignBondStrength,
} from "../../../norms/en1992/reinforced-concrete/index.js";

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function layer(input, label) {
  if (!input) {
    throw new Error(`${label} is required.`);
  }

  const diameter = positive(Number(input.diameter), `${label}.diameter`);
  const barCount = positive(Number(input.barCount), `${label}.barCount`);
  const area = input.area == null
    ? barCount * Math.PI * diameter ** 2 / 4
    : positive(Number(input.area), `${label}.area`);

  return {
    ...input,
    diameter,
    barCount,
    area,
    continuousArea: positive(
      Number(input.continuousArea ?? area),
      `${label}.continuousArea`,
    ),
  };
}

function minimumCheck(id, description, required, provided, metadata = {}) {
  return utilizationCheck({
    id,
    description,
    demand: required,
    capacity: provided,
    metadata,
  });
}

function maximumCheck(id, description, provided, allowed, metadata = {}) {
  return utilizationCheck({
    id,
    description,
    demand: provided,
    capacity: allowed,
    metadata,
  });
}

function normalizeDuctilityClass(value) {
  const normalized = String(value ?? "")
    .toUpperCase()
    .replaceAll('"', "")
    .replaceAll("-", "");

  if (["CDA", "A"].includes(normalized)) return "CDA";
  if (["CDB", "B"].includes(normalized)) return "CDB";
  throw new Error(`Unsupported NTC 2018 ductility class: ${value}.`);
}

function anchorageChecks({ anchors, fctd, fyk, seismic }) {
  return (anchors ?? []).map((anchor, index) => {
    const id = anchor.id ?? `anchor-${index + 1}`;
    const diameter = positive(Number(anchor.diameter), `${id}.diameter`);
    const availableLength = positive(
      Number(anchor.availableLength),
      `${id}.availableLength`,
    );
    const designSteelStress = positive(
      Number(anchor.designSteelStress ?? (seismic ? 1.25 * fyk : anchor.fyd)),
      `${id}.designSteelStress`,
    );
    const bond = calculateEn1992DesignBondStrength({
      fctd,
      barDiameter: diameter,
      bondConditionFactor: anchor.bondConditionFactor ?? 1,
    });
    const required = calculateEn1992AnchorageLength({
      barDiameter: diameter,
      designSteelStress,
      fbd: bond.fbd,
      tension: anchor.tension !== false,
      alpha1: anchor.alpha1 ?? 1,
      alpha2: anchor.alpha2 ?? 1,
      alpha3: anchor.alpha3 ?? 1,
      alpha4: anchor.alpha4 ?? 1,
      alpha5: anchor.alpha5 ?? 1,
      nationalMinimumDiameterMultiple: 20,
      nationalMinimumLength: 150,
    });

    return minimumCheck(
      `rc-beam-anchorage-${id}`,
      `Available anchorage length for beam bar ${id}`,
      required.designLength,
      availableLength,
      {
        ...required,
        fbd: round(bond.fbd),
        designSteelStress: round(designSteelStress),
        seismicStressAmplification: seismic ? 1.25 : 1,
        references: [
          "NTC2018-4.1.2.3.10",
          ...(seismic ? ["NTC2018-7.4.6.2.1"] : []),
          required.reference,
        ],
      },
    );
  });
}

export class ReinforcedConcreteBeamDetailingVerification {
  constructor({ code = "NTC2018" } = {}) {
    this.code = code;
  }

  verify({ section, concreteMaterial, reinforcementMaterial, detailing } = {}) {
    if (!detailing) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-beams",
        status: RESULT_STATUS.NOT_ANALYZED,
        summary: "Beam detailing was not requested.",
        warnings: ["Pass the detailing contract to verify beam reinforcement layout and anchorage."],
        metadata: { code: this.code, method: "ntc2018-beam-detailing" },
      });
    }

    if (this.code !== "NTC2018") {
      return new VerificationResult({
        applicationId: "reinforced-concrete-beams",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: `Unsupported beam detailing code: ${this.code}.`,
        metadata: { code: this.code },
      });
    }

    const concrete = section?.concreteSection ?? section;
    const width = positive(
      Number(detailing.geometry?.width ?? concrete?.width),
      "detailing.geometry.width",
    );
    const height = positive(
      Number(detailing.geometry?.height ?? concrete?.height),
      "detailing.geometry.height",
    );
    const effectiveDepth = positive(
      Number(detailing.geometry?.effectiveDepth),
      "detailing.geometry.effectiveDepth",
    );
    const tensionZoneWidth = positive(
      Number(detailing.geometry?.tensionZoneWidth ?? width),
      "detailing.geometry.tensionZoneWidth",
    );
    const top = layer(detailing.longitudinal?.top, "detailing.longitudinal.top");
    const bottom = layer(
      detailing.longitudinal?.bottom,
      "detailing.longitudinal.bottom",
    );
    const transverse = detailing.transverse ?? {};
    const hoopDiameter = positive(
      Number(transverse.diameter),
      "detailing.transverse.diameter",
    );
    const hoopSpacing = positive(
      Number(transverse.spacing),
      "detailing.transverse.spacing",
    );
    const hoopAreaPerSet = positive(
      Number(transverse.areaPerSet),
      "detailing.transverse.areaPerSet",
    );
    const fctm = positive(Number(concreteMaterial?.fctm), "concreteMaterial.fctm");
    const fctd = positive(
      Number(detailing.fctd ??
        (concreteMaterial?.fctm && concreteMaterial?.metadata?.gammaC
          ? 0.7 * concreteMaterial.fctm / concreteMaterial.metadata.gammaC
          : NaN)),
      "detailing.fctd",
    );
    const fyk = positive(Number(reinforcementMaterial?.fyk), "reinforcementMaterial.fyk");
    const concreteArea = positive(Number(concrete?.area ?? width * height), "concrete area");
    const minimumLongitudinalArea = Math.max(
      0.26 * fctm / fyk * tensionZoneWidth * effectiveDepth,
      0.0013 * tensionZoneWidth * effectiveDepth,
    );
    const maximumLayerArea = 0.04 * concreteArea;
    const transverseAreaPerMeter = hoopAreaPerSet * 1000 / hoopSpacing;
    const minimumTransverseAreaPerMeter = 1.5 * width;
    const ordinaryMaximumSpacing = Math.min(1000 / 3, 0.8 * effectiveDepth);
    const checks = [
      minimumCheck("rc-beam-minimum-top-reinforcement", "Minimum top longitudinal reinforcement", minimumLongitudinalArea, top.area, { reference: "NTC2018-4.1.45" }),
      minimumCheck("rc-beam-minimum-bottom-reinforcement", "Minimum bottom longitudinal reinforcement", minimumLongitudinalArea, bottom.area, { reference: "NTC2018-4.1.45" }),
      maximumCheck("rc-beam-maximum-top-reinforcement", "Maximum top longitudinal reinforcement outside lap zones", top.area, maximumLayerArea, { reference: "NTC2018-4.1.6.1.1" }),
      maximumCheck("rc-beam-maximum-bottom-reinforcement", "Maximum bottom longitudinal reinforcement outside lap zones", bottom.area, maximumLayerArea, { reference: "NTC2018-4.1.6.1.1" }),
      minimumCheck("rc-beam-minimum-transverse-reinforcement", "Minimum beam transverse reinforcement per metre", minimumTransverseAreaPerMeter, transverseAreaPerMeter, { reference: "NTC2018-4.1.6.1.1" }),
      maximumCheck("rc-beam-ordinary-hoop-spacing", "Ordinary beam hoop spacing", hoopSpacing, ordinaryMaximumSpacing, { reference: "NTC2018-4.1.6.1.1" }),
    ];
    const seismic = detailing.seismic?.enabled === true;
    let seismicOutputs = null;

    if (seismic) {
      const ductilityClass = normalizeDuctilityClass(
        detailing.seismic.ductilityClass,
      );
      const isCda = ductilityClass === "CDA";
      const criticalZoneLength = (isCda ? 1.5 : 1) * height;
      const rhoTop = top.area / (width * height);
      const rhoBottom = bottom.area / (width * height);
      const rhoMinimum = 1.4 / fyk;
      const rhoMaximumFor = (compressionArea) =>
        compressionArea / (width * height) + 3.5 / fyk;
      const seismicMaximumSpacing = Math.min(
        effectiveDepth / 4,
        isCda ? 175 : 225,
        (isCda ? 6 : 8) * Math.min(top.diameter, bottom.diameter),
        24 * hoopDiameter,
      );
      const firstHoopDistance = positive(
        Number(detailing.seismic.firstHoopDistance),
        "detailing.seismic.firstHoopDistance",
      );
      const hookAngle = positive(
        Number(transverse.hookAngle),
        "detailing.transverse.hookAngle",
      );
      const hookExtension = positive(
        Number(transverse.hookExtension),
        "detailing.transverse.hookExtension",
      );

      checks.push(
        minimumCheck("rc-beam-seismic-minimum-width", "Minimum dissipative beam width", 200, width, { reference: "NTC2018-7.4.6.1.1" }),
        minimumCheck("rc-beam-seismic-width-height-ratio", "Minimum dissipative beam width-to-height ratio", 0.25, width / height, { reference: "NTC2018-7.4.6.1.1" }),
        minimumCheck("rc-beam-seismic-top-bar-count", "Continuous top longitudinal bars", 2, top.barCount, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-bottom-bar-count", "Continuous bottom longitudinal bars", 2, bottom.barCount, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-top-bar-diameter", "Minimum top longitudinal bar diameter", 14, top.diameter, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-bottom-bar-diameter", "Minimum bottom longitudinal bar diameter", 14, bottom.diameter, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-top-rho-min", "Minimum top reinforcement ratio", rhoMinimum, rhoTop, { reference: "NTC2018-7.4.26" }),
        maximumCheck("rc-beam-seismic-top-rho-max", "Maximum top reinforcement ratio", rhoTop, rhoMaximumFor(bottom.area), { reference: "NTC2018-7.4.26" }),
        minimumCheck("rc-beam-seismic-bottom-rho-min", "Minimum bottom reinforcement ratio", rhoMinimum, rhoBottom, { reference: "NTC2018-7.4.26" }),
        maximumCheck("rc-beam-seismic-bottom-rho-max", "Maximum bottom reinforcement ratio", rhoBottom, rhoMaximumFor(top.area), { reference: "NTC2018-7.4.26" }),
        minimumCheck("rc-beam-seismic-compression-ratio-top", "Compression reinforcement relative to top tension reinforcement in critical zones", 0.5 * top.area, bottom.area, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-compression-ratio-bottom", "Compression reinforcement relative to bottom tension reinforcement in critical zones", 0.5 * bottom.area, top.area, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-continuous-top-area", "Top reinforcement maintained over the full beam", 0.25 * top.area, top.continuousArea, { reference: "NTC2018-7.4.6.2.1" }),
        maximumCheck("rc-beam-seismic-first-hoop", "First hoop distance from column face", firstHoopDistance, 50, { reference: "NTC2018-7.4.6.2.1" }),
        maximumCheck("rc-beam-seismic-hoop-spacing", "Hoop spacing in dissipative zones", hoopSpacing, seismicMaximumSpacing, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-hoop-diameter", "Minimum hoop diameter", 6, hoopDiameter, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-hook-angle", "Hoop hook angle", 135, hookAngle, { reference: "NTC2018-7.4.6.2.1" }),
        minimumCheck("rc-beam-seismic-hook-extension", "Hoop hook straight extension", 10 * hoopDiameter, hookExtension, { reference: "NTC2018-7.4.6.2.1" }),
      );
      seismicOutputs = {
        ductilityClass,
        criticalZoneLength,
        rhoTop,
        rhoBottom,
        rhoMinimum,
        seismicMaximumSpacing,
      };
    }

    checks.push(...anchorageChecks({
      anchors: detailing.anchors,
      fctd,
      fyk,
      seismic,
    }));
    const governing = governingCheck(checks);
    const ok = checks.every((check) => check.ok === true);

    return new VerificationResult({
      applicationId: "reinforced-concrete-beams",
      status: ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary: "NTC 2018 beam reinforcement detailing, dissipative-zone and anchorage verification.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        geometry: { width, height, effectiveDepth, tensionZoneWidth },
        longitudinal: { top, bottom },
        transverse: {
          diameter: hoopDiameter,
          spacing: hoopSpacing,
          areaPerSet: hoopAreaPerSet,
          areaPerMeter: transverseAreaPerMeter,
        },
        anchorageCount: detailing.anchors?.length ?? 0,
        seismic: seismicOutputs,
      },
      assumptions: [
        "The supplied longitudinal layers describe the reinforcement effective at every checked beam section.",
        "Anchorage alpha factors and bond conditions are explicit design inputs and are not inferred from a drawing.",
      ],
      metadata: {
        code: this.code,
        method: "ntc2018-4.1.6.1.1-and-7.4.6.1.1-7.4.6.2.1",
        governingCheckId: governing?.id ?? null,
      },
    });
  }
}
