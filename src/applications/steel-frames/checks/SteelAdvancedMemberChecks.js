import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const I_H_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);
const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;
const positive = (value) => Number.isFinite(value) && value > 0;

function familyOf(section) {
  return String(section?.family ?? section?.catalogProperties?.family ?? "").toUpperCase();
}

function gamma(material, key, fallback = 1.05) {
  return material?.metadata?.[key] ?? material?.metadata?.gammaM1 ?? fallback;
}

function uniformCheck({ id, description, demand, capacity, metadata = {}, warnings = [], assumptions = [] }) {
  const ratio = positive(capacity) ? Math.abs(demand) / capacity : null;
  return {
    status: Number.isFinite(ratio) && ratio <= 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id,
      description,
      demand: round(Math.abs(demand)),
      capacity: round(capacity),
      utilizationRatio: round(ratio),
      ok: Number.isFinite(ratio) && ratio <= 1,
      metadata,
      warnings: [...warnings],
      assumptions: [...assumptions],
    },
    warnings,
    assumptions,
  };
}

export function steelNotSupportedCheck({ id, description, missingInputs = [], reference, metadata = {}, warnings = [] }) {
  const message = `${description} is not supported; no resistance has been calculated.`;
  return {
    id,
    description,
    demand: null,
    capacity: null,
    utilizationRatio: null,
    ok: null,
    status: RESULT_STATUS.NOT_SUPPORTED,
    metadata: {
      norm: "NTC 2018 / Circolare 2019",
      method: "not-supported",
      reference,
      missingInputs: [...missingInputs],
      ...metadata,
    },
    warnings: [message, ...warnings],
    assumptions: [],
  };
}

export function calculateSteelMomentDiagramFactor(samples = [], axis = "My", segment = null) {
  const key = String(axis).toUpperCase() === "MZ" ? "Mz" : "My";
  const selected = samples.filter((sample) => {
    const station = sample.station;
    return (!segment || !Number.isFinite(segment.from) || station >= segment.from - 1e-9) &&
      (!segment || !Number.isFinite(segment.to) || station <= segment.to + 1e-9);
  });
  if (selected.length < 2) return null;

  const moment = (sample) =>
    sample.actions?.[key] ?? sample[key] ?? sample[key === "My" ? "mY" : "mZ"] ??
    sample.principalActions?.[key === "My" ? "mY" : "mZ"] ??
    (key === "My" ? sample.m : 0);
  const first = moment(selected[0]);
  const last = moment(selected[selected.length - 1]);
  const max = selected.reduce((value, sample) =>
    Math.abs(moment(sample)) > Math.abs(value) ? moment(sample) : value, first);
  if (!Number.isFinite(first) || !Number.isFinite(last) || Math.abs(max) <= 1e-12) return null;

  const endWithMax = Math.abs(first) >= Math.abs(last) ? first : last;
  const otherEnd = Math.abs(first) >= Math.abs(last) ? last : first;
  const psi = Math.abs(endWithMax) > 1e-12 ? otherEnd / endWithMax : 1;
  const cm = Math.min(1, Math.max(0.4, 0.6 + 0.4 * psi));
  return { factor: round(cm), psi: round(psi), source: "fem-end-moment-diagram" };
}

function webGeometry(section) {
  const h = section?.height;
  const tw = section?.webThickness;
  const tf = section?.flangeThickness;
  const r = section?.rootRadius ?? 0;
  return { h, tw, tf, hw: positive(h) && positive(tf) ? h - 2 * tf - 2 * r : null };
}

export function verifySteelWebShearBuckling({ section, material, vEd = 0, panel = {}, gammaM1 = null } = {}) {
  const family = familyOf(section);
  const { hw, tw } = webGeometry(section);
  const fy = material?.fyk;
  const E = material?.E ?? material?.elasticModulus ?? 210000;
  const a = panel.length ?? (Number.isFinite(panel.to) && Number.isFinite(panel.from) ? panel.to - panel.from : null);
  const resolvedGamma = gammaM1 ?? gamma(material, "gammaM1");
  if (!I_H_FAMILIES.has(family) || ![hw, tw, fy, E, a, resolvedGamma].every(positive)) {
    return { status: RESULT_STATUS.NOT_SUPPORTED, check: steelNotSupportedCheck({
      id: "steel-web-shear-buckling", description: "Web shear buckling",
      missingInputs: ["I/H web geometry h, tw, tf, r", "panel length a", "steel fyk and E"],
      reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §5",
      metadata: { family, panelId: panel.id ?? null },
    }), warnings: [] };
  }
  const epsilon = Math.sqrt(235 / fy);
  const eta = fy <= 460 ? 1.2 : 1;
  const aspect = a / hw;
  const kTau = aspect >= 1 ? 5.34 + 4 / aspect ** 2 : 4 + 5.34 / aspect ** 2;
  const lambdaW = hw / (37.4 * tw * epsilon * Math.sqrt(kTau));
  const rigidEndPost = panel.endPost === "rigid" || panel.rigidEndPost === true;
  const chiW = Math.min(
    eta,
    lambdaW < 0.83 / eta
      ? eta
      : rigidEndPost
        ? 1.37 / (0.7 + lambdaW)
        : 1.21 / (0.8 + lambdaW),
  );
  const capacity = (chiW * fy * hw * tw) / (Math.sqrt(3) * resolvedGamma);
  const result = uniformCheck({
    id: "steel-web-shear-buckling", description: "I/H web panel shear buckling resistance",
    demand: vEd, capacity,
    metadata: { norm: "NTC 2018 / Circolare 2019", method: "EN-1993-1-5-5.2-web-only", reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §5.2", panelId: panel.id ?? null, endPost: rigidEndPost ? "rigid" : "non-rigid", hw: round(hw), tw: round(tw), a: round(a), kTau: round(kTau), relativeWebSlenderness: round(lambdaW), chiW: round(chiW), eta, gammaM1: resolvedGamma },
    assumptions: ["The resistance includes the web contribution only; no flange contribution is credited."],
  });
  result.check.metadata.shearBucklingRequired = hw / tw > (72 * epsilon) / eta;
  return result;
}

export function verifySteelConcentratedWebLoad({ section, material, load = {}, panel = {}, gammaM1 = null } = {}) {
  const family = familyOf(section);
  const { hw, tw, tf } = webGeometry(section);
  const b = section?.width;
  const fyw = material?.fyk;
  const fyf = material?.fyk;
  const E = material?.E ?? material?.elasticModulus ?? 210000;
  const ss = load.bearingLength ?? load.ss;
  const force = load.force ?? load.FEd ?? 0;
  const a = panel.length ?? load.panelLength;
  const resolvedGamma = gammaM1 ?? gamma(material, "gammaM1");
  if (!I_H_FAMILIES.has(family) || ![hw, tw, tf, b, fyw, E, ss, a, resolvedGamma].every(positive)) {
    return { status: RESULT_STATUS.NOT_SUPPORTED, check: steelNotSupportedCheck({
      id: "steel-concentrated-web-load", description: "Transverse concentrated load on web",
      missingInputs: ["I/H web and flange geometry", "bearingLength", "web panel length", "load position/type", "steel fyk and E"],
      reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §6",
      metadata: { family, loadId: load.id ?? null },
    }), warnings: [] };
  }
  const m1 = (fyf * b) / (fyw * tw);
  const m2 = 0.02 * (hw / tf) ** 2;
  const ly = Math.min(hw, ss + 2 * tf * (1 + Math.sqrt(Math.max(0, m1 + m2))));
  const type = String(load.loadType ?? load.type ?? "internal").toLowerCase();
  const kF = type === "end" ? 2 + 6 * (ss / hw) : 6 + 2 * (hw / a) ** 2;
  const fCr = (0.9 * kF * E * tw ** 3) / hw;
  const lambdaF = Math.sqrt((ly * tw * fyw) / fCr);
  const chiF = Math.min(1, 0.5 / lambdaF);
  const effectiveLength = chiF * ly;
  const capacity = (fyw * effectiveLength * tw) / resolvedGamma;
  return uniformCheck({
    id: "steel-concentrated-web-load", description: "I/H web transverse-force resistance",
    demand: force, capacity,
    metadata: { norm: "NTC 2018 / Circolare 2019", method: "EN-1993-1-5-6.2", reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §6.2", loadId: load.id ?? null, panelId: panel.id ?? null, loadType: type, bearingLength: round(ss), effectiveLoadedLength: round(effectiveLength), kF: round(kF), lambdaF: round(lambdaF), chiF: round(chiF), gammaM1: resolvedGamma },
    assumptions: ["The load is introduced through one flange and the web panel geometry supplied with the FEM member is applicable."],
  });
}

export function verifySteelBendingShearInteraction({ section, material, mEd = 0, vEd = 0, bendingCapacity, shearCapacity, gammaM0 = null } = {}) {
  const { tw } = webGeometry(section);
  const fy = material?.fyk;
  const Wpl = section?.plasticSectionModulusY;
  const resolvedGamma = gammaM0 ?? gamma(material, "gammaM0");
  if (![bendingCapacity, shearCapacity].every(positive)) {
    return { status: RESULT_STATUS.NOT_SUPPORTED, check: steelNotSupportedCheck({ id: "steel-bending-shear-interaction", description: "Bending-shear interaction", missingInputs: ["plastic bending resistance", "shear resistance"], reference: "NTC 2018 §4.2.4.1.2.5; UNI EN 1993-1-1 §6.2.8" }), warnings: [] };
  }
  const shearRatio = Math.abs(vEd) / shearCapacity;
  let capacity = bendingCapacity;
  let rho = 0;
  if (shearRatio > 0.5) {
    rho = Math.min(1, (2 * shearRatio - 1) ** 2);
    if (I_H_FAMILIES.has(familyOf(section)) && positive(Wpl) && positive(tw) && positive(fy)) {
      const webArea = section?.shearAreaY ?? tw * webGeometry(section).hw;
      capacity = Math.min(bendingCapacity, Math.max(0, (Wpl - (rho * webArea ** 2) / (4 * tw)) * fy / resolvedGamma));
    } else {
      capacity = (1 - rho) * bendingCapacity;
    }
  }
  return uniformCheck({ id: "steel-bending-shear-interaction", description: "Bending resistance reduced by high shear", demand: mEd, capacity, metadata: { norm: "NTC 2018 / Circolare 2019", method: "EN-1993-1-1-6.2.8", reference: "NTC 2018 §4.2.4.1.2.5", shearRatio: round(shearRatio), rho: round(rho), reductionApplied: shearRatio > 0.5 } });
}

export function verifySteelShearTorsionInteraction({ section, material, vEd = 0, tEd = 0, shearCapacity } = {}) {
  const WT = section?.torsionalSectionModulus;
  const fy = material?.fyk;
  const resolvedGamma = gamma(material, "gammaM0");
  if (![WT, fy, shearCapacity].every(positive)) {
    return { status: RESULT_STATUS.NOT_SUPPORTED, check: steelNotSupportedCheck({ id: "steel-shear-torsion-interaction", description: "Shear-Saint-Venant torsion interaction", missingInputs: ["torsional section modulus WT", "shear resistance", "steel fyk"], reference: "NTC 2018 §4.2.4.1.2.7; UNI EN 1993-1-1 §6.2.7" }), warnings: [] };
  }
  const tauT = Math.abs(tEd) / WT;
  const tauRd = fy / (Math.sqrt(3) * resolvedGamma);
  const family = familyOf(section);
  const factor = ["CHS", "SHS", "RHS"].includes(family)
    ? Math.sqrt(Math.max(0, 1 - (tauT / tauRd) ** 2))
    : Math.max(0, 1 - tauT / (1.25 * tauRd));
  return uniformCheck({ id: "steel-shear-torsion-interaction", description: "Shear resistance reduced by uniform Saint-Venant torsion", demand: vEd, capacity: factor * shearCapacity, metadata: { norm: "NTC 2018 / Circolare 2019", method: "EN-1993-1-1-6.2.7", reference: "NTC 2018 §4.2.4.1.2.7", torsionalShearStress: round(tauT), torsionalShearResistance: round(tauRd), reductionFactor: round(factor) }, assumptions: ["Only uniform Saint-Venant torsion is considered; warping torsion and bimoment must be absent."] });
}
