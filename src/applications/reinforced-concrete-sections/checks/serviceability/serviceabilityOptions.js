import {
  DEFAULT_RC_SLE_MODULAR_RATIO,
  resolveRcSleModularRatio,
} from "../../serviceabilityDefaults.js";

export const DEFAULT_SERVICEABILITY_OPTIONS = Object.freeze({
  environment: "ordinary",
  reinforcementSensitivity: "low",
  modularRatio: DEFAULT_RC_SLE_MODULAR_RATIO,
  rowTolerance: 50,
  creepCoefficient: 2,
  includeShrinkage: false,
});

export function normalizeEnvironment(environment) {
  return String(environment ?? "ordinary")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

export function resolveServiceabilityOptions(options = {}) {
  const serviceability = {
    ...DEFAULT_SERVICEABILITY_OPTIONS,
    ...options,
    cracking: {
      ...(options.cracking ?? {}),
    },
    deflection: {
      creepCoefficient:
        options.deflection?.creepCoefficient ??
        options.creepCoefficient ??
        DEFAULT_SERVICEABILITY_OPTIONS.creepCoefficient,
      includeShrinkage:
        options.deflection?.includeShrinkage ??
        options.includeShrinkage ??
        DEFAULT_SERVICEABILITY_OPTIONS.includeShrinkage,
    },
  };

  serviceability.environment =
    options.cracking?.environment ??
    options.environment ??
    DEFAULT_SERVICEABILITY_OPTIONS.environment;
  serviceability.reinforcementSensitivity =
    options.cracking?.reinforcementSensitivity ??
    options.reinforcementSensitivity ??
    DEFAULT_SERVICEABILITY_OPTIONS.reinforcementSensitivity;
  serviceability.modularRatio = resolveRcSleModularRatio(
    options.cracking?.modularRatio,
    options.deflection?.modularRatio,
    options.modularRatio,
  );

  return serviceability;
}
