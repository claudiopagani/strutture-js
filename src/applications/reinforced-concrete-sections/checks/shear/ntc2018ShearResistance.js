import { createUnitResolver } from "../../../../domain/units/UnitSystem.js";
import { RESULT_STATUS } from "../../../../core/results/resultStatus.js";
import {
  DEFAULT_RC_SHEAR_UNITS,
  clamp,
  isFinitePositive,
  requiredParametersMissing,
  round,
  utilizationCheck,
} from "./shearUtils.js";

export function computeWithoutTransverseResistance(params) {
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

export function verifyWithoutTransverseReinforcement({ vEd, params }) {
  const baseWarnings = [...params.warnings];
  const resistance = computeWithoutTransverseResistance(params);
  const warnings = [...baseWarnings, ...(resistance.warnings ?? [])];

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

function alphaCForShear(params) {
  const ratio =
    Number.isFinite(params.sigmaCp) &&
    Number.isFinite(params.fcd) &&
    params.fcd !== 0
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
    ? createUnitResolver(units, DEFAULT_RC_SHEAR_UNITS).length(shear.leverArm)
    : (shear.leverArmFactor ?? 0.9) * params.effectiveDepth;
  const fcdPrime =
    Number.isFinite(shear.fcdPrime)
      ? createUnitResolver(units, DEFAULT_RC_SHEAR_UNITS).stress(shear.fcdPrime)
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
    cotTheta = clamp(
      Math.sqrt(Math.max(raw, 0)),
      cotThetaRange.min,
      cotThetaRange.max,
    );
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

export function verifyWithTransverseReinforcement({ vEd, params, shear, units }) {
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
