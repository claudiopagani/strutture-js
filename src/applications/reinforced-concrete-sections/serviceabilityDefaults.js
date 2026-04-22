export const DEFAULT_RC_SLE_MODULAR_RATIO = 15;

export function resolveRcSleModularRatio(...candidates) {
  for (const candidate of candidates) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return DEFAULT_RC_SLE_MODULAR_RATIO;
}
