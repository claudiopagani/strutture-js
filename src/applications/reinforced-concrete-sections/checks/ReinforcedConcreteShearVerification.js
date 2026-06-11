import { VerificationResult } from "../../../core/results/VerificationResult.js";
import {
  governingCheck,
  isFinitePositive,
  round,
  utilizationCheck as createUtilizationCheck,
} from "../../../core/results/checkUtils.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const DEFAULT_SECTION_UNITS = Object.freeze({ force: "N", length: "mm" });
const SUPPORTED_MODES = new Set([
  "without-transverse-reinforcement",
  "with-transverse-reinforcement",
]);
const DEFAULT_METHOD = "ntc2018";
const COSENZA_METHOD = "cosenza-et-al-2016";
const METHOD_ALIASES = new Map([
  ["ntc2018", DEFAULT_METHOD],
  ["ntc-2018", DEFAULT_METHOD],
  [COSENZA_METHOD, COSENZA_METHOD],
  ["cosenza-2016", COSENZA_METHOD],
]);

function utilizationCheck(options) {
  return createUtilizationCheck({
    ...options,
    strictCapacity: false,
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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

function resolveUnits(section, options = {}) {
  return (
    options.units ??
    options.shear?.units ??
    section?.metadata?.unitSystem ??
    concreteSectionFrom(section)?.metadata?.unitSystem ??
    DEFAULT_SECTION_UNITS
  );
}

function resolveMode(shear = {}, fallbackMode = null) {
  const mode = shear.mode ?? fallbackMode;

  if (!SUPPORTED_MODES.has(mode)) {
    return null;
  }

  return mode;
}

function resolveMethod(shear = {}, fallbackMethod = null) {
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

  const positiveCompression = Math.max(compression, 0);
  return positiveCompression;
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
  if (
    Number.isFinite(
      shear.longitudinalReinforcementArea ??
        shear.asl,
    )
  ) {
    sources.asl = "explicit";
    return resolver.area(
      shear.longitudinalReinforcementArea ??
        shear.asl,
    );
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

function resolveCosenzaParameters({
  section,
  concreteMaterial,
  reinforcementMaterial,
  shear,
  nEd,
  units,
  mode,
}) {
  const resolver = createUnitResolver(units, DEFAULT_SECTION_UNITS);
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

function requiredParametersMissing(params, requiredKeys, warnings) {
  const missing = requiredKeys.filter((key) => !isFinitePositive(params[key]));

  for (const key of missing) {
    warnings.push(`Required shear parameter ${key} is missing or not positive.`);
  }

  return missing;
}

function resolveShearParameters({
  section,
  concreteMaterial,
  reinforcementMaterial,
  shear,
  nEd,
  mEd,
  units,
}) {
  const resolver = createUnitResolver(units, DEFAULT_SECTION_UNITS);
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
    isFinitePositive(longitudinalArea) && isFinitePositive(bw) && isFinitePositive(effectiveDepth)
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

function computeWithoutTransverseResistance(params) {
  const warnings = [];
  const missing = requiredParametersMissing(
    {
      bw: params.bw,
      effectiveDepth: params.effectiveDepth,
      longitudinalArea: params.longitudinalArea,
      concreteArea: params.concreteArea,
      fck: params.fck,
      gammaC: params.gammaC,
    },
    ["bw", "effectiveDepth", "longitudinalArea", "concreteArea", "fck", "gammaC"],
    warnings,
  );

  if (missing.length > 0) {
    return {
      available: false,
      missing,
      warnings,
    };
  }

  const k = Math.min(1 + Math.sqrt(200 / params.effectiveDepth), 2);
  const vMin = 0.035 * k ** 1.5 * Math.sqrt(params.fck);
  const vRdcStress =
    (0.18 / params.gammaC) *
      k *
      (100 * params.rhoLEffective * params.fck) ** (1 / 3) +
    0.15 * params.sigmaCp;
  const resistanceStress = Math.max(vRdcStress, vMin + 0.15 * params.sigmaCp);
  const capacity = resistanceStress * params.bw * params.effectiveDepth;

  return {
    available: true,
    capacity,
    k,
    vMin,
    vRdcStress,
    resistanceStress,
    metadata: {
      method: "ntc2018-4.1.2.3.5.1",
      k: round(k),
      vMin: round(vMin),
      vRdcStress: round(vRdcStress),
      resistanceStress: round(resistanceStress),
      bw: round(params.bw),
      d: round(params.effectiveDepth),
      Asl: round(params.longitudinalArea),
      rhoL: round(params.rhoL, 9),
      rhoLEffective: round(params.rhoLEffective, 9),
      sigmaCp: round(params.sigmaCp),
      sources: params.sources,
    },
  };
}

function verifyWithoutTransverseReinforcement({ vEd, params }) {
  const baseWarnings = [...params.warnings];
  const resistance = computeWithoutTransverseResistance(params);
  const warnings = [
    ...baseWarnings,
    ...(resistance.warnings ?? []),
  ];

  if (!resistance.available) {
    return {
      status: RESULT_STATUS.NOT_VERIFIED,
      utilizationRatio: null,
      demand: Math.abs(vEd),
      capacity: null,
      checks: [],
      warnings,
      assumptions: [
        "NTC 2018 4.1.2.3.5.1 shear verification was not run because required parameters are incomplete.",
      ],
      outputs: {
        parameters: params,
      },
      metadata: {
        method: "ntc2018-4.1.2.3.5.1",
        missingParameters: resistance.missing,
      },
    };
  }

  const check = utilizationCheck({
    id: "rc-shear-without-transverse-reinforcement",
    description: "Shear resistance without transverse reinforcement",
    demand: vEd,
    capacity: resistance.capacity,
    metadata: resistance.metadata,
  });

  return {
    status: check.ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    utilizationRatio: check.utilizationRatio,
    demand: check.demand,
    capacity: check.capacity,
    checks: [check],
    warnings,
    assumptions: [
      "NTC 2018 4.1.2.3.5.1 is evaluated with bw, d, Asl and compression stress resolved before formula evaluation.",
      "Tensile normal force does not increase concrete shear resistance.",
    ],
    outputs: {
      parameters: params,
      k: round(resistance.k),
      vMin: round(resistance.vMin),
      vRdcStress: round(resistance.vRdcStress),
      resistanceStress: round(resistance.resistanceStress),
      vRd: round(resistance.capacity),
    },
    metadata: {
      method: "ntc2018-4.1.2.3.5.1",
      governingCheckId: check.id,
    },
  };
}

function verifyCosenzaCircularShear({ vEd, params }) {
  const warnings = [...params.warnings];
  const missing = requiredParametersMissing(
    {
      diameter: params.diameter,
      concreteArea: params.concreteArea,
      longitudinalArea: params.longitudinalArea,
      fcPrime: params.fcPrime,
    },
    ["diameter", "concreteArea", "longitudinalArea", "fcPrime"],
    warnings,
  );

  if (params.shape !== "circular") {
    missing.push("circularSection");
  }

  if (
    params.mode === "with-transverse-reinforcement" &&
    !params.transverseReinforcement
  ) {
    missing.push("transverseReinforcement");
  }

  if (missing.length > 0) {
    return {
      status: RESULT_STATUS.NOT_VERIFIED,
      utilizationRatio: null,
      demand: Math.abs(vEd),
      capacity: null,
      checks: [],
      warnings,
      assumptions: [
        "Cosenza et al. (2016) circular-section shear verification was not run because required parameters are incomplete.",
      ],
      outputs: {
        parameters: params,
      },
      metadata: {
        method: COSENZA_METHOD,
        missingParameters: [...new Set(missing)],
      },
    };
  }

  const baseCoefficient = 0.232;
  const transverseCoefficient = 245;
  const vRdWithoutTransverseReinforcement =
    baseCoefficient *
    params.diameter ** 2 *
    Math.cbrt(100 * params.rhoL * params.fcPrime);
  const amplificationFactor =
    params.mode === "with-transverse-reinforcement"
      ? 1 + transverseCoefficient * params.rhoW
      : 1;
  const capacity =
    vRdWithoutTransverseReinforcement * amplificationFactor;
  const equation =
    params.mode === "with-transverse-reinforcement" ? 5 : 3;
  const check = utilizationCheck({
    id:
      params.mode === "with-transverse-reinforcement"
        ? "rc-shear-resistance"
        : "rc-shear-without-transverse-reinforcement",
    description:
      params.mode === "with-transverse-reinforcement"
        ? "Circular-section shear resistance with transverse reinforcement according to Cosenza et al. (2016)"
        : "Circular-section shear resistance without transverse reinforcement according to Cosenza et al. (2016)",
    demand: vEd,
    capacity,
    metadata: {
      method: `${COSENZA_METHOD}-eq-${equation}`,
      equation,
      baseCoefficient,
      transverseCoefficient,
      diameter: round(params.diameter),
      Ac: round(params.concreteArea),
      Asl: round(params.longitudinalArea),
      rhoL: round(params.rhoL, 9),
      fcPrime: round(params.fcPrime),
      Asw: round(params.transverseReinforcement?.area),
      spacing: round(params.transverseReinforcement?.spacing),
      rhoW: round(params.rhoW, 9),
      amplificationFactor: round(amplificationFactor, 9),
      sources: params.sources,
    },
  });

  warnings.push(
    "Cosenza et al. (2016) is an empirical research formulation and does not introduce a partial safety factor in Equations (3) and (5).",
  );

  return {
    status: check.ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    utilizationRatio: check.utilizationRatio,
    demand: check.demand,
    capacity: check.capacity,
    checks: [check],
    warnings,
    assumptions: [
      "Equation (3) is evaluated as VR = 0.232 D^2 (100 rhoL f'c)^(1/3), with rhoL = Asl / Ac.",
      ...(params.mode === "with-transverse-reinforcement"
        ? [
            "Equation (5) is evaluated by multiplying the unreinforced resistance by (1 + 245 rhoW), with rhoW = Asw / (s D).",
          ]
        : []),
      "The formulation is applied in N, mm and MPa and ignores axial-force effects.",
    ],
    outputs: {
      parameters: params,
      baseCoefficient,
      transverseCoefficient:
        params.mode === "with-transverse-reinforcement"
          ? transverseCoefficient
          : null,
      rhoL: round(params.rhoL, 9),
      rhoW: round(params.rhoW, 9),
      amplificationFactor: round(amplificationFactor, 9),
      vRdWithoutTransverseReinforcement: round(
        vRdWithoutTransverseReinforcement,
      ),
      vRdWithTransverseReinforcement:
        params.mode === "with-transverse-reinforcement"
          ? round(capacity)
          : null,
      vRd: round(capacity),
    },
    metadata: {
      method: `${COSENZA_METHOD}-eq-${equation}`,
      governingCheckId: check.id,
    },
  };
}

function alphaCForShear(params) {
  const ratio =
    Number.isFinite(params.sigmaCp) && Number.isFinite(params.fcd) && params.fcd !== 0
      ? params.sigmaCp / params.fcd
      : 0;

  if (ratio < 0) {
    return 1;
  }

  if (ratio < 0.25) {
    return 1 + ratio;
  }

  if (ratio <= 0.5) {
    return 1.25;
  }

  if (ratio < 1) {
    return 2.5 * (1 - ratio);
  }

  return 0;
}

function resolveCotThetaRange(shear = {}) {
  const min = shear.cotThetaMin ?? shear.cotThetaRange?.min ?? 1;
  const max = shear.cotThetaMax ?? shear.cotThetaRange?.max ?? 2.5;

  if (!isFinitePositive(min) || !isFinitePositive(max) || min > max) {
    return {
      min: 1,
      max: 2.5,
      warning: "Invalid cotTheta range; default range [1, 2.5] was used.",
    };
  }

  return { min, max, warning: null };
}

function computeWithTransverseResistance({ params, shear, units, warnings }) {
  const cotThetaRange = resolveCotThetaRange(shear);

  if (cotThetaRange.warning) {
    warnings.push(cotThetaRange.warning);
  }

  const cotAlpha = shear.cotAlpha ?? 0;

  if (cotAlpha !== 0) {
    warnings.push(
      "Only vertical stirrups are supported; cotAlpha was forced to 0.",
    );
  }

  const verticalCotAlpha = 0;
  const sinAlpha = 1 / Math.sqrt(1 + verticalCotAlpha ** 2);
  const z = Number.isFinite(shear.leverArm)
    ? createUnitResolver(units, DEFAULT_SECTION_UNITS).length(shear.leverArm)
    : (shear.leverArmFactor ?? 0.9) * params.effectiveDepth;
  const fcdPrime =
    Number.isFinite(shear.fcdPrime)
      ? createUnitResolver(units, DEFAULT_SECTION_UNITS).stress(shear.fcdPrime)
      : (shear.fcdPrimeFactor ?? 0.5) * params.fcd;
  const alphaC = shear.alphaC ?? shear.alphaCw ?? alphaCForShear(params);
  const vRsdAt = (cotTheta) =>
    params.transverseReinforcement.areaPerSpacing *
    z *
    params.transverseReinforcement.fyd *
    (verticalCotAlpha + cotTheta) *
    sinAlpha;
  const vRcdAt = (cotTheta) =>
    (params.bw *
      z *
      alphaC *
      fcdPrime *
      (verticalCotAlpha + cotTheta)) /
    (1 + cotTheta ** 2);
  const vRsdMin = vRsdAt(cotThetaRange.min);
  const vRsdMax = vRsdAt(cotThetaRange.max);
  const vRcdAtMinCot = vRcdAt(cotThetaRange.min);
  const vRcdAtMaxCot = vRcdAt(cotThetaRange.max);
  let cotTheta = null;
  let thetaSelection = "optimized-intersection";

  if (shear.thetaSelection === "fixed" && Number.isFinite(shear.cotTheta)) {
    cotTheta = clamp(shear.cotTheta, cotThetaRange.min, cotThetaRange.max);
    thetaSelection = "fixed";
  } else if (vRsdMin > vRcdAtMinCot) {
    cotTheta = cotThetaRange.min;
    thetaSelection = "compression-boundary-min-cot";
  } else if (vRsdMax < vRcdAtMaxCot) {
    cotTheta = cotThetaRange.max;
    thetaSelection = "steel-boundary-max-cot";
  } else {
    const raw =
      (params.bw *
        alphaC *
        fcdPrime *
        params.transverseReinforcement.spacing) /
        (params.transverseReinforcement.area *
          params.transverseReinforcement.fyd *
          sinAlpha) -
      1;
    cotTheta = clamp(Math.sqrt(Math.max(raw, 0)), cotThetaRange.min, cotThetaRange.max);
  }

  const vRsd = vRsdAt(cotTheta);
  const vRcd = vRcdAt(cotTheta);
  const capacity = Math.min(vRsd, vRcd);

  return {
    available: true,
    capacity,
    cotTheta,
    thetaSelection,
    cotThetaRange,
    cotAlpha: verticalCotAlpha,
    sinAlpha,
    z,
    fcdPrime,
    alphaC,
    vRsd,
    vRcd,
    vRsdAtMinCot: vRsdMin,
    vRsdAtMaxCot: vRsdMax,
    vRcdAtMinCot,
    vRcdAtMaxCot,
  };
}

function verifyWithTransverseReinforcement({ vEd, params, shear, units }) {
  const warnings = [...params.warnings];
  const missing = requiredParametersMissing(
    {
      bw: params.bw,
      effectiveDepth: params.effectiveDepth,
      fck: params.fck,
      fcd: params.fcd,
    },
    ["bw", "effectiveDepth", "fck", "fcd"],
    warnings,
  );

  if (!params.transverseReinforcement) {
    missing.push("transverseReinforcement");
  }

  if (missing.length > 0) {
    return {
      status: RESULT_STATUS.NOT_VERIFIED,
      utilizationRatio: null,
      demand: Math.abs(vEd),
      capacity: null,
      checks: [],
      warnings,
      assumptions: [
        "NTC 2018 4.1.2.3.5.2 shear verification was not run because required parameters are incomplete.",
      ],
      outputs: {
        parameters: params,
      },
      metadata: {
        method: "ntc2018-4.1.2.3.5.2",
        missingParameters: missing,
      },
    };
  }

  const withResistance = computeWithTransverseResistance({
    params,
    shear,
    units,
    warnings,
  });
  const withoutResistance = computeWithoutTransverseResistance(params);

  if (!withoutResistance.available) {
    warnings.push(
      "Shear resistance without transverse reinforcement was not considered because required parameters are incomplete.",
    );
  }

  const withoutCapacity = withoutResistance.available
    ? withoutResistance.capacity
    : null;
  const capacity = Math.max(
    withResistance.capacity,
    withoutCapacity ?? Number.NEGATIVE_INFINITY,
  );
  const selectedMechanism =
    withoutCapacity != null && withoutCapacity > withResistance.capacity
      ? "without-transverse-reinforcement"
      : "with-transverse-reinforcement";
  const check = utilizationCheck({
    id: "rc-shear-resistance",
    description:
      "Shear resistance as maximum between stirrup and no-stirrup mechanisms",
    demand: vEd,
    capacity,
    metadata: {
      method: "ntc2018-4.1.2.3.5.2",
      selectedMechanism,
      vRdWithTransverseReinforcement: round(withResistance.capacity),
      vRdWithoutTransverseReinforcement: round(withoutCapacity),
      vRsd: round(withResistance.vRsd),
      vRcd: round(withResistance.vRcd),
      Asw: round(params.transverseReinforcement.area),
      spacing: round(params.transverseReinforcement.spacing),
      AswPerS: round(params.transverseReinforcement.areaPerSpacing, 9),
      fyd: round(params.transverseReinforcement.fyd),
      z: round(withResistance.z),
      cotTheta: round(withResistance.cotTheta),
      thetaSelection: withResistance.thetaSelection,
      cotThetaMin: round(withResistance.cotThetaRange.min),
      cotThetaMax: round(withResistance.cotThetaRange.max),
      bw: round(params.bw),
      d: round(params.effectiveDepth),
      fcd: round(params.fcd),
      fcdPrime: round(withResistance.fcdPrime),
      alphaC: round(withResistance.alphaC),
    },
  });

  warnings.push(
    "Minimum shear reinforcement detailing, spacing limits, anchorage and torsion are not included in this MVP check.",
  );

  return {
    status: check.ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    utilizationRatio: check.utilizationRatio,
    demand: check.demand,
    capacity: check.capacity,
    checks: [check],
    warnings,
    assumptions: [
      "NTC 2018 4.1.2.3.5.2 is evaluated with the variable-angle truss model for vertical stirrups and cotTheta selected to maximize min(VRsd, VRcd).",
      "For reinforced sections the reported shear resistance is the maximum between the stirrup mechanism and the no-stirrup mechanism when both are available.",
      "The lever arm z defaults to 0.9 d unless shear.leverArm is passed explicitly.",
    ],
    outputs: {
      parameters: params,
      z: round(withResistance.z),
      cotTheta: round(withResistance.cotTheta),
      thetaSelection: withResistance.thetaSelection,
      cotThetaRange: {
        min: round(withResistance.cotThetaRange.min),
        max: round(withResistance.cotThetaRange.max),
      },
      alphaC: round(withResistance.alphaC),
      fcdPrime: round(withResistance.fcdPrime),
      vRsd: round(withResistance.vRsd),
      vRcd: round(withResistance.vRcd),
      vRdWithTransverseReinforcement: round(withResistance.capacity),
      vRdWithoutTransverseReinforcement: round(withoutCapacity),
      selectedMechanism,
      vRd: round(capacity),
      thetaBounds: {
        vRsdAtMinCot: round(withResistance.vRsdAtMinCot),
        vRsdAtMaxCot: round(withResistance.vRsdAtMaxCot),
        vRcdAtMinCot: round(withResistance.vRcdAtMinCot),
        vRcdAtMaxCot: round(withResistance.vRcdAtMaxCot),
      },
    },
    metadata: {
      method: "ntc2018-4.1.2.3.5.2",
      governingCheckId: check.id,
    },
  };
}

export class ReinforcedConcreteShearVerification {
  constructor({
    code = "NTC2018",
    mode = null,
    method = null,
    shear = {},
    section = null,
    concreteMaterial = null,
    reinforcementMaterial = null,
    metadata = {},
  } = {}) {
    this.code = code;
    this.mode = mode;
    this.method = method;
    this.shear = { ...shear };
    this.section = section;
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.metadata = { ...metadata };
  }

  verifySectionActions({
    nEd = 0,
    vEd = 0,
    mEd = 0,
    context = {},
    section = context.section ?? this.section,
    concreteMaterial = context.concreteMaterial ?? this.concreteMaterial,
    reinforcementMaterial =
      context.reinforcementMaterial ?? this.reinforcementMaterial,
    shear = context.shear ?? this.shear,
    units = context.units ?? resolveUnits(section, { shear }),
  } = {}) {
    const resolvedShear = {
      ...this.shear,
      ...shear,
      mode: shear?.mode ?? this.mode ?? this.shear.mode,
      method:
        shear?.method ??
        shear?.formulation ??
        this.method ??
        this.shear.method ??
        this.shear.formulation,
    };
    const resolver = createUnitResolver(units, DEFAULT_SECTION_UNITS);
    const convertedNEd = resolver.force(nEd ?? 0);
    const convertedVEd = resolver.force(vEd ?? 0);
    const convertedMEd = resolver.moment(mEd ?? 0);
    const baseWarnings = [];

    if (!section) {
      baseWarnings.push("RC shear verification requires a reinforced concrete section.");
    }

    if (!concreteMaterial) {
      baseWarnings.push("RC shear verification requires a concrete material.");
    }

    const mode = resolveMode(resolvedShear, this.mode);
    const method = resolveMethod(resolvedShear, this.method);

    if (!mode) {
      baseWarnings.push(
        "RC shear verification requires shear.mode: without-transverse-reinforcement or with-transverse-reinforcement.",
      );
    }

    if (!method) {
      baseWarnings.push(
        "Unsupported RC shear method; use ntc2018 or cosenza-et-al-2016.",
      );
    }

    if (baseWarnings.length > 0) {
      return {
        status: RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: null,
        demand: Math.abs(convertedVEd),
        capacity: null,
        checks: [],
        warnings: baseWarnings,
        assumptions: [],
        outputs: {},
        metadata: {
          code: this.code,
          method: method ?? resolvedShear.method ?? resolvedShear.formulation,
        },
      };
    }

    let result;

    if (method === COSENZA_METHOD) {
      const params = resolveCosenzaParameters({
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear: {
          ...resolvedShear,
          mode,
          method,
        },
        nEd: convertedNEd,
        units,
        mode,
      });
      result = verifyCosenzaCircularShear({
        vEd: convertedVEd,
        params,
      });
    } else {
      const params = resolveShearParameters({
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear: {
          ...resolvedShear,
          mode,
        },
        nEd: convertedNEd,
        mEd: convertedMEd,
        units,
      });
      result =
        mode === "without-transverse-reinforcement"
          ? verifyWithoutTransverseReinforcement({
              vEd: convertedVEd,
              params,
            })
          : verifyWithTransverseReinforcement({
              vEd: convertedVEd,
              params,
              shear: resolvedShear,
              units,
            });
    }

    return {
      ...result,
      metadata: {
        code: this.code,
        ...result.metadata,
        ...this.metadata,
      },
    };
  }

  verify({
    section = this.section,
    concreteMaterial = this.concreteMaterial ?? section?.concreteMaterial,
    reinforcementMaterial =
      this.reinforcementMaterial ?? section?.reinforcementMaterial,
    shear = this.shear,
    actions = {},
    units = resolveUnits(section, { shear }),
  } = {}) {
    const result = this.verifySectionActions({
      nEd: actions.nEd ?? 0,
      vEd: actions.vEd ?? actions.v ?? 0,
      mEd: actions.mEd ?? actions.m ?? 0,
      section,
      concreteMaterial,
      reinforcementMaterial,
      shear,
      units,
      context: {
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear,
        units,
      },
    });

    return new VerificationResult({
      applicationId: "reinforced-concrete-shear",
      status: result.status,
      summary: "RC shear verification according to the selected shear formulation.",
      utilizationRatio: result.utilizationRatio,
      demand: result.demand,
      capacity: result.capacity,
      checks: result.checks,
      outputs: result.outputs,
      warnings: result.warnings,
      assumptions: result.assumptions,
      metadata: result.metadata,
    });
  }
}
