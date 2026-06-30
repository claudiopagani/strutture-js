import { normalizePostUltimateFractureEnergyDensity } from "../RCSectionStateIntegrator.js";

export const DEFAULT_POST_ULTIMATE_MOMENT_DROP = 0.15;
export const DEFAULT_MAX_POST_ULTIMATE_CURVATURE_RATIO = 1.2;
export const DEFAULT_POST_PEAK_CURVATURE_GROWTH_FACTOR = 1.15;
export const DEFAULT_MAX_POST_PEAK_POINTS = 120;

const SUPPORTED_POST_ULTIMATE_RESPONSES = new Set([
  "retain",
  "linear-softening",
  "zero-stress",
]);

export function resolvePostUltimateOptions({
  postUltimateMomentDrop = null,
  postPeakMomentDrop = null,
  maxPostUltimateCurvatureRatio = DEFAULT_MAX_POST_ULTIMATE_CURVATURE_RATIO,
  postUltimateResponse = "zero-stress",
  postUltimateFractureEnergyDensity = null,
  postPeakCurvatureGrowthFactor =
    DEFAULT_POST_PEAK_CURVATURE_GROWTH_FACTOR,
  maxPostPeakPoints = DEFAULT_MAX_POST_PEAK_POINTS,
} = {}) {
  const resolvedPostUltimateMomentDrop =
    postUltimateMomentDrop ??
    postPeakMomentDrop ??
    DEFAULT_POST_ULTIMATE_MOMENT_DROP;

  if (
    !Number.isFinite(resolvedPostUltimateMomentDrop) ||
    resolvedPostUltimateMomentDrop <= 0 ||
    resolvedPostUltimateMomentDrop >= 1
  ) {
    throw new Error(
      "RCMomentCurvatureAnalyzer postUltimateMomentDrop must be between 0 and 1.",
    );
  }

  if (
    !Number.isFinite(maxPostUltimateCurvatureRatio) ||
    maxPostUltimateCurvatureRatio <= 1
  ) {
    throw new Error(
      "RCMomentCurvatureAnalyzer maxPostUltimateCurvatureRatio must be greater than 1.",
    );
  }

  if (!SUPPORTED_POST_ULTIMATE_RESPONSES.has(postUltimateResponse)) {
    throw new Error(
      `Unsupported RC post-ultimate response: ${postUltimateResponse}.`,
    );
  }

  if (
    !Number.isFinite(postPeakCurvatureGrowthFactor) ||
    postPeakCurvatureGrowthFactor <= 1
  ) {
    throw new Error(
      "RCMomentCurvatureAnalyzer postPeakCurvatureGrowthFactor must be greater than 1.",
    );
  }

  if (!Number.isInteger(maxPostPeakPoints) || maxPostPeakPoints < 1) {
    throw new Error(
      "RCMomentCurvatureAnalyzer maxPostPeakPoints must be a positive integer.",
    );
  }

  const fractureEnergyDensity = normalizePostUltimateFractureEnergyDensity(
    postUltimateFractureEnergyDensity,
  );

  if (
    postUltimateResponse === "linear-softening" &&
    fractureEnergyDensity.concrete <= 0 &&
    fractureEnergyDensity.steel <= 0
  ) {
    throw new Error(
      "RCMomentCurvatureAnalyzer linear softening requires a positive postUltimateFractureEnergyDensity.",
    );
  }

  return {
    postUltimateMomentDrop: resolvedPostUltimateMomentDrop,
    maxPostUltimateCurvatureRatio,
    postUltimateResponse,
    fractureEnergyDensity,
    postPeakCurvatureGrowthFactor,
    maxPostPeakPoints,
  };
}
