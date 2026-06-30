import {
  isFinitePositive,
  round,
  utilizationCheck as createUtilizationCheck,
} from "../../../../core/results/checkUtils.js";

export { isFinitePositive, round };

export const DEFAULT_RC_SHEAR_UNITS = Object.freeze({
  force: "N",
  length: "mm",
});

export const COSENZA_METHOD = "cosenza-et-al-2016";

export function utilizationCheck(options) {
  return createUtilizationCheck({
    ...options,
    strictCapacity: false,
  });
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function requiredParametersMissing(params, requiredKeys, warnings) {
  const missing = requiredKeys.filter((key) => !isFinitePositive(params[key]));

  for (const key of missing) {
    warnings.push(`Required shear parameter ${key} is missing or not positive.`);
  }

  return missing;
}
