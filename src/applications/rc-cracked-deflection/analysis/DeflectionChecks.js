import {
  isFinitePositive,
  round,
} from "../../reinforced-concrete-sections/shared/rcCommon.js";

const SLENDERNESS_LIMITS = Object.freeze({
  simple_span: { k: 1, high: 14, low: 20 },
  continuous_end_span: { k: 1.3, high: 18, low: 26 },
  continuous_internal_span: { k: 1.5, high: 20, low: 30 },
  flat_slab: { k: 1.2, high: 17, low: 24 },
  cantilever: { k: 0.4, high: 6, low: 8 },
});

export const FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS = Object.freeze({
  low: 0.005,
  high: 0.015,
});

function flatSlabLimitFromReinforcementRatio({ ratio, limits }) {
  const lowRatio = FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS.low;
  const highRatio = FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS.high;

  if (ratio <= lowRatio) {
    return { limit: limits.low, stressLevel: "low", interpolationFactor: 0 };
  }

  if (ratio >= highRatio) {
    return { limit: limits.high, stressLevel: "high", interpolationFactor: 1 };
  }

  const interpolationFactor = (ratio - lowRatio) / (highRatio - lowRatio);

  return {
    limit: limits.low + interpolationFactor * (limits.high - limits.low),
    stressLevel: "interpolated-from-rho-l",
    interpolationFactor,
  };
}

export function utilizationCheck({ demand, capacity, metadata }) {
  const utilizationRatio = isFinitePositive(capacity)
    ? demand / capacity
    : null;

  return {
    id: "rc-sle-deflection-curvature",
    description: "RC deflection from curvature integration",
    demand: round(demand),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok: Number.isFinite(utilizationRatio) && utilizationRatio <= 1,
    metadata,
  };
}

export function slendernessCheck({ span, section, serviceability }) {
  const system =
    serviceability.deflection?.slendernessSystem ??
    serviceability.slendernessSystem ??
    "simple_span";
  let stressLevel =
    serviceability.deflection?.slendernessStressLevel ??
    serviceability.slendernessStressLevel ??
    "low";
  const limits = SLENDERNESS_LIMITS[system] ?? SLENDERNESS_LIMITS.simple_span;
  const reinforcementRatio =
    serviceability.deflection?.reinforcementRatio ??
    serviceability.reinforcementRatio ??
    null;
  let limit = limits[stressLevel] ?? limits.low;
  let interpolationFactor = null;

  if (
    system === "flat_slab" &&
    Number.isFinite(reinforcementRatio) &&
    reinforcementRatio >= 0
  ) {
    const resolved = flatSlabLimitFromReinforcementRatio({
      ratio: reinforcementRatio,
      limits,
    });
    limit = resolved.limit;
    stressLevel = resolved.stressLevel;
    interpolationFactor = resolved.interpolationFactor;
  }
  const height = section.concreteSection?.height ?? section.height;

  if (!isFinitePositive(span) || !isFinitePositive(height)) {
    return null;
  }

  const demand = span / height;
  const utilizationRatio = demand / limit;

  return {
    id: "rc-sle-deflection-slenderness",
    description: "Simplified RC span-depth deflection screening",
    demand: round(demand),
    capacity: round(limit),
    utilizationRatio: round(utilizationRatio),
    ok: utilizationRatio <= 1,
    metadata: {
      method: "circolare-ntc2018-c4.1.i-screening",
      system,
      stressLevel,
      k: limits.k,
      span: round(span),
      sectionHeight: round(height),
      slendernessLimit: limit,
      reinforcementRatio,
      reinforcementRatioPercent: Number.isFinite(reinforcementRatio)
        ? round(100 * reinforcementRatio)
        : null,
      reinforcementRatioLow: FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS.low,
      reinforcementRatioHigh: FLAT_SLAB_REINFORCEMENT_RATIO_LIMITS.high,
      interpolationFactor: round(interpolationFactor),
    },
  };
}
