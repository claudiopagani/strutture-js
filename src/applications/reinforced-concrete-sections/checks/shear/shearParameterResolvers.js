import { createUnitResolver } from "../../../../domain/units/UnitSystem.js";
import {
  COSENZA_METHOD,
  DEFAULT_RC_SHEAR_UNITS,
  isFinitePositive,
} from "./shearUtils.js";

const SUPPORTED_MODES = new Set([
  "without-transverse-reinforcement",
  "with-transverse-reinforcement",
]);
const DEFAULT_METHOD = "ntc2018";
const METHOD_ALIASES = new Map([
  ["ntc2018", DEFAULT_METHOD],
  ["ntc-2018", DEFAULT_METHOD],
  [COSENZA_METHOD, COSENZA_METHOD],
  ["cosenza-2016", COSENZA_METHOD],
]);

function concreteSectionFrom(section) {
  return section?.concreteSection ?? section;
}

function sectionShape(section) {
  return concreteSectionFrom(section)?.metadata?.shape ?? null;
}

function sectionBounds(section) {
  if (typeof section?.getBoundingBox === "function") {
    return section.getBoundingBox();
  }

  const concreteSection = concreteSectionFrom(section);
  const height = concreteSection?.height ?? section?.height;

  return {
    minY: 0,
    maxY: height,
  };
}

export function resolveUnits(section, options = {}) {
  return (
    options.units ??
    options.shear?.units ??
    section?.metadata?.unitSystem ??
    concreteSectionFrom(section)?.metadata?.unitSystem ??
    DEFAULT_RC_SHEAR_UNITS
  );
}

export function resolveMode(shear = {}, fallbackMode = null) {
  const mode = shear.mode ?? fallbackMode;

  if (!SUPPORTED_MODES.has(mode)) {
    return null;
  }

  return mode;
}

export function resolveMethod(shear = {}, fallbackMethod = null) {
  const requested =
    shear.method ??
    shear.formulation ??
    fallbackMethod ??
    DEFAULT_METHOD;

  return METHOD_ALIASES.get(String(requested).trim().toLowerCase()) ?? null;
}

function resolveBw({ section, shear, resolver, warnings, sources }) {
  if (Number.isFinite(shear.bw ?? shear.webWidth)) {
    sources.bw = "explicit";
    return resolver.length(shear.bw ?? shear.webWidth);
  }

  const concreteSection = concreteSectionFrom(section);

  if (Number.isFinite(concreteSection?.webWidth)) {
    sources.bw = "derived-t-section";
    return concreteSection.webWidth;
  }

  if (
    sectionShape(section) === "rectangular" &&
    Number.isFinite(concreteSection?.width)
  ) {
    sources.bw = "derived-rectangular-section";
    return concreteSection.width;
  }

  sources.bw = "missing";
  warnings.push(
    "Shear web width bw cannot be derived for this section; pass shear.bw explicitly.",
  );
  return null;
}

function reinforcementBars(section) {
  return typeof section?.getReinforcementBars === "function"
    ? section.getReinforcementBars()
    : section?.reinforcementBars ?? [];
}

function groupsFrom(section, shear = {}) {
  return [
    ...(shear.longitudinalReinforcementGroups ?? []),
    ...(section?.metadata?.longitudinalReinforcementGroups ?? []),
  ];
}

function resolveLongitudinalGroup(section, shear = {}) {
  if (shear.longitudinalReinforcementGroup) {
    return shear.longitudinalReinforcementGroup;
  }

  const groupId = shear.longitudinalReinforcementGroupId;

  if (!groupId) {
    return null;
  }

  return groupsFrom(section, shear).find((group) => group.id === groupId) ?? null;
}

function barsFromGroup(section, group) {
  if (!group?.barIds?.length) {
    return [];
  }

  const ids = new Set(group.barIds.map(String));

  return reinforcementBars(section).filter((bar, index) =>
    ids.has(String(bar.id ?? `bar-${index + 1}`)),
  );
}

function weightedCentroidY(bars) {
  const area = bars.reduce((sum, bar) => sum + bar.area, 0);

  if (!isFinitePositive(area)) {
    return null;
  }

  return bars.reduce((sum, bar) => sum + bar.area * bar.y, 0) / area;
}

function resolveTensionFace({ shear, group, mEd }) {
  const requested = shear.tensionFace ?? group?.face ?? "bottom";

  if (requested === "auto-from-moment-sign") {
    return (mEd ?? 0) >= 0 ? "bottom" : "top";
  }

  return requested;
}

function effectiveDepthFromCentroid({ section, centroidY, tensionFace }) {
  const bounds = sectionBounds(section);

  if (tensionFace === "bottom") {
    return bounds.maxY - centroidY;
  }

  if (tensionFace === "top") {
    return centroidY - bounds.minY;
  }

  return null;
}

function resolveDAndAsl({ section, shear, resolver, mEd, warnings, sources }) {
  const group = resolveLongitudinalGroup(section, shear);
  const bars = barsFromGroup(section, group);
  const tensionFace = resolveTensionFace({ shear, group, mEd });
  let effectiveDepth =
    Number.isFinite(shear.effectiveDepth ?? shear.d)
      ? resolver.length(shear.effectiveDepth ?? shear.d)
      : null;
  let longitudinalArea =
    Number.isFinite(shear.longitudinalReinforcementArea ?? shear.asl)
      ? resolver.area(shear.longitudinalReinforcementArea ?? shear.asl)
      : null;

  if (effectiveDepth != null) {
    sources.d = "explicit";
  }

  if (longitudinalArea != null) {
    sources.asl = "explicit";
  }

  if ((effectiveDepth == null || longitudinalArea == null) && group) {
    if (effectiveDepth == null && Number.isFinite(group.effectiveDepth ?? group.d)) {
      effectiveDepth = resolver.length(group.effectiveDepth ?? group.d);
      sources.d = "reinforcement-group-explicit";
    }

    if (
      longitudinalArea == null &&
      Number.isFinite(group.longitudinalReinforcementArea ?? group.area ?? group.asl)
    ) {
      longitudinalArea = resolver.area(
        group.longitudinalReinforcementArea ?? group.area ?? group.asl,
      );
      sources.asl = "reinforcement-group-explicit";
    }

    if ((effectiveDepth == null || longitudinalArea == null) && bars.length > 0) {
      const barArea = bars.reduce((sum, bar) => sum + bar.area, 0);
      const centroidY = weightedCentroidY(bars);

      if (longitudinalArea == null && isFinitePositive(barArea)) {
        longitudinalArea = barArea;
        sources.asl = "derived-from-reinforcement-group";
      }

      if (effectiveDepth == null && Number.isFinite(centroidY)) {
        effectiveDepth = effectiveDepthFromCentroid({
          section,
          centroidY,
          tensionFace,
        });
        sources.d = "derived-from-reinforcement-group";
      }
    }
  }

  if (effectiveDepth == null) {
    sources.d = "missing";
    warnings.push(
      "Effective depth d is required for RC shear verification; pass shear.effectiveDepth or a longitudinal reinforcement group.",
    );
  }

  if (longitudinalArea == null) {
    sources.asl = "missing";
  }

  return {
    effectiveDepth,
    longitudinalArea,
    tensionFace,
    groupId: group?.id ?? null,
    barIds: bars.map((bar, index) => bar.id ?? `bar-${index + 1}`),
  };
}

function resolveConcreteArea({ section, shear, resolver, sources }) {
  if (Number.isFinite(shear.concreteArea ?? shear.ac)) {
    sources.ac = "explicit";
    return resolver.area(shear.concreteArea ?? shear.ac);
  }

  const concreteSection = concreteSectionFrom(section);
  sources.ac = "derived-concrete-section";
  return concreteSection?.area ?? section?.area ?? null;
}

function resolveCompression({
  nEd,
  concreteArea,
  concreteMaterial,
  shear,
  resolver,
  warnings,
  sources,
}) {
  if (Number.isFinite(shear.nEdCompression)) {
    sources.nEdCompression = "explicit";
    return Math.max(resolver.force(shear.nEdCompression), 0);
  }

  const convention = shear.normalForceSignConvention ?? "compression-negative";
  let compression = 0;

  if (convention === "compression-positive") {
    compression = nEd ?? 0;
  } else if (convention === "compression-negative" || convention === "tension-positive") {
    compression = -(nEd ?? 0);
  } else {
    warnings.push(
      `Unsupported shear.normalForceSignConvention ${convention}; compression contribution ignored.`,
    );
    sources.nEdCompression = "ignored";
    return 0;
  }

  sources.nEdCompression = `from-nEd-${convention}`;

  if (compression < 0) {
    warnings.push(
      "Normal force is tensile for the selected convention; compression contribution in shear resistance was set to zero.",
    );
  }

  return Math.max(compression, 0);
}

function resolveTransverseReinforcement({
  shear,
  reinforcementMaterial,
  resolver,
  warnings,
  requireFyd = true,
}) {
  const transverse = shear.transverseReinforcement ?? {};
  const angle = transverse.angle ?? 90;

  if (angle !== 90) {
    warnings.push(
      "Only vertical stirrups with transverseReinforcement.angle = 90 are supported in this MVP.",
    );
    return null;
  }

  const legs = transverse.legs ?? transverse.numberOfLegs;
  const spacing = Number.isFinite(transverse.spacing)
    ? resolver.length(transverse.spacing)
    : null;
  const diameter = Number.isFinite(transverse.diameter)
    ? resolver.length(transverse.diameter)
    : null;
  const areaPerLeg = Number.isFinite(transverse.areaPerLeg ?? transverse.area)
    ? resolver.area(transverse.areaPerLeg ?? transverse.area)
    : diameter == null
      ? null
      : (Math.PI * diameter ** 2) / 4;
  const fyd = Number.isFinite(transverse.fyd)
    ? resolver.stress(transverse.fyd)
    : transverse.material?.fyd ?? reinforcementMaterial?.fyd ?? null;

  if (!isFinitePositive(legs)) {
    warnings.push("A positive transverseReinforcement.legs value is required.");
  }

  if (!isFinitePositive(spacing)) {
    warnings.push("A positive transverseReinforcement.spacing value is required.");
  }

  if (!isFinitePositive(areaPerLeg)) {
    warnings.push(
      "Transverse reinforcement requires either diameter or areaPerLeg.",
    );
  }

  if (requireFyd && !isFinitePositive(fyd)) {
    warnings.push(
      "Transverse reinforcement requires a design yield strength fyd or a reinforcement material with fyd.",
    );
  }

  if (
    !isFinitePositive(legs) ||
    !isFinitePositive(spacing) ||
    !isFinitePositive(areaPerLeg) ||
    (requireFyd && !isFinitePositive(fyd))
  ) {
    return null;
  }

  return {
    type: transverse.type ?? "stirrups",
    angle,
    legs,
    spacing,
    diameter,
    areaPerLeg,
    area: legs * areaPerLeg,
    areaPerSpacing: (legs * areaPerLeg) / spacing,
    fyd,
  };
}

function resolveCircularDiameter({ section, shear, resolver, sources }) {
  if (Number.isFinite(shear.sectionDiameter ?? shear.D)) {
    sources.diameter = "explicit";
    return resolver.length(shear.sectionDiameter ?? shear.D);
  }

  const concreteSection = concreteSectionFrom(section);

  if (Number.isFinite(concreteSection?.diameter)) {
    sources.diameter = "derived-circular-section";
    return concreteSection.diameter;
  }

  sources.diameter = "missing";
  return null;
}

function resolveCosenzaLongitudinalArea({
  section,
  shear,
  resolver,
  sources,
}) {
  if (Number.isFinite(shear.longitudinalReinforcementArea ?? shear.asl)) {
    sources.asl = "explicit";
    return resolver.area(shear.longitudinalReinforcementArea ?? shear.asl);
  }

  const area = reinforcementBars(section).reduce(
    (sum, bar) => sum + (Number.isFinite(bar.area) ? bar.area : 0),
    0,
  );

  if (isFinitePositive(area)) {
    sources.asl = "derived-all-longitudinal-bars";
    return area;
  }

  sources.asl = "missing";
  return null;
}

function resolveCosenzaConcreteStrength({
  concreteMaterial,
  shear,
  resolver,
  sources,
}) {
  const explicitStrength =
    shear.fcPrime ??
    shear.concreteCylinderStrength ??
    shear.fck;

  if (Number.isFinite(explicitStrength)) {
    sources.fcPrime = "explicit";
    return resolver.stress(explicitStrength);
  }

  if (Number.isFinite(concreteMaterial?.fck)) {
    sources.fcPrime = "concrete-material-fck";
    return concreteMaterial.fck;
  }

  if (Number.isFinite(concreteMaterial?.fcm)) {
    sources.fcPrime = "concrete-material-fcm";
    return concreteMaterial.fcm;
  }

  sources.fcPrime = "missing";
  return null;
}

export function resolveCosenzaParameters({
  section,
  concreteMaterial,
  reinforcementMaterial,
  shear,
  nEd,
  units,
  mode,
}) {
  const resolver = createUnitResolver(units, DEFAULT_RC_SHEAR_UNITS);
  const warnings = [];
  const sources = {};
  const shape = sectionShape(section);
  const diameter = resolveCircularDiameter({
    section,
    shear,
    resolver,
    sources,
  });
  const concreteArea = resolveConcreteArea({
    section,
    shear,
    resolver,
    sources,
  });
  const longitudinalArea = resolveCosenzaLongitudinalArea({
    section,
    shear,
    resolver,
    sources,
  });
  const fcPrime = resolveCosenzaConcreteStrength({
    concreteMaterial,
    shear,
    resolver,
    sources,
  });
  const rhoL =
    isFinitePositive(longitudinalArea) && isFinitePositive(concreteArea)
      ? longitudinalArea / concreteArea
      : null;
  const transverseReinforcement =
    mode === "with-transverse-reinforcement"
      ? resolveTransverseReinforcement({
          shear,
          reinforcementMaterial,
          resolver,
          warnings,
          requireFyd: false,
        })
      : null;
  const rhoW =
    transverseReinforcement &&
    isFinitePositive(diameter)
      ? transverseReinforcement.area /
        (transverseReinforcement.spacing * diameter)
      : null;

  if (shape !== "circular") {
    warnings.push(
      "Cosenza et al. (2016) shear resistance is available only for circular concrete sections.",
    );
  }

  if (Math.abs(nEd ?? 0) > 1e-9) {
    warnings.push(
      "Cosenza et al. (2016) does not include axial-force effects; nEd was ignored.",
    );
  }

  return {
    mode,
    shape,
    diameter,
    concreteArea,
    longitudinalArea,
    rhoL,
    fcPrime,
    transverseReinforcement,
    rhoW,
    sources,
    warnings,
  };
}

export function resolveShearParameters({
  section,
  concreteMaterial,
  reinforcementMaterial,
  shear,
  nEd,
  mEd,
  units,
}) {
  const resolver = createUnitResolver(units, DEFAULT_RC_SHEAR_UNITS);
  const warnings = [];
  const sources = {};
  const mode = resolveMode(shear);

  if (!mode) {
    warnings.push(
      "RC shear verification requires shear.mode: without-transverse-reinforcement or with-transverse-reinforcement.",
    );
  }

  const bw = resolveBw({ section, shear, resolver, warnings, sources });
  const {
    effectiveDepth,
    longitudinalArea,
    tensionFace,
    groupId,
    barIds,
  } = resolveDAndAsl({ section, shear, resolver, mEd, warnings, sources });
  const concreteArea = resolveConcreteArea({ section, shear, resolver, sources });
  const nEdCompression = resolveCompression({
    nEd,
    concreteArea,
    concreteMaterial,
    shear,
    resolver,
    warnings,
    sources,
  });
  const sigmaCpRaw =
    isFinitePositive(concreteArea) ? nEdCompression / concreteArea : 0;
  const gammaC = shear.gammaC ?? concreteMaterial?.metadata?.gammaC ?? 1.5;
  const alphaCc = shear.alphaCc ?? concreteMaterial?.metadata?.alphaCc ?? 0.85;
  const fck =
    Number.isFinite(shear.fck)
      ? resolver.stress(shear.fck)
      : concreteMaterial?.fck ?? null;
  const fcd =
    Number.isFinite(shear.fcd)
      ? resolver.stress(shear.fcd)
      : (Number.isFinite(shear.gammaC) || Number.isFinite(shear.alphaCc)) &&
          Number.isFinite(fck)
        ? (alphaCc * fck) / gammaC
        : concreteMaterial?.fcd ??
          (Number.isFinite(fck) ? (alphaCc * fck) / gammaC : null);
  const sigmaCpLimit =
    Number.isFinite(fcd) ? 0.2 * fcd : Number.POSITIVE_INFINITY;
  const sigmaCp = Math.min(sigmaCpRaw, sigmaCpLimit);
  const rhoL =
    isFinitePositive(longitudinalArea) &&
    isFinitePositive(bw) &&
    isFinitePositive(effectiveDepth)
      ? longitudinalArea / (bw * effectiveDepth)
      : null;
  const rhoLEffective = Number.isFinite(rhoL) ? Math.min(rhoL, 0.02) : null;
  const transverseReinforcement =
    mode === "with-transverse-reinforcement"
      ? resolveTransverseReinforcement({
          shear,
          reinforcementMaterial,
          resolver,
          warnings,
        })
      : null;

  if (sigmaCpRaw > sigmaCpLimit) {
    warnings.push(
      "Concrete compression stress contribution was capped at 0.2 fcd for shear verification.",
    );
  }

  return {
    ok: warnings.length === 0,
    mode,
    bw,
    effectiveDepth,
    concreteArea,
    longitudinalArea,
    rhoL,
    rhoLEffective,
    nEdCompression,
    sigmaCpRaw,
    sigmaCp,
    fck,
    fcd,
    gammaC,
    alphaCc,
    tensionFace,
    groupId,
    barIds,
    transverseReinforcement,
    sources,
    warnings,
  };
}
