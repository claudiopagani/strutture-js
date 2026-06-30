import {
  governingCheck,
  isFinitePositive,
  round,
  utilizationCheck,
} from "../../../core/results/checkUtils.js";

export { governingCheck, isFinitePositive, round, utilizationCheck };

export const DEFAULT_RC_SECTION_UNITS = Object.freeze({
  force: "N",
  length: "mm",
});

export const roundNullable = (value, decimals = 6) =>
  Number.isFinite(value) ? round(value, decimals) : null;

export function hasSignificantAction(value, reference = 0, tolerance = 1e-9) {
  return (
    Number.isFinite(value) &&
    Math.abs(value) > Math.max(tolerance, Math.abs(reference) * tolerance)
  );
}

export function normalizeCombinationType(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_");
}

export function resolveReferencePoint(section, referencePoint = null) {
  const type = referencePoint?.type ?? "concrete-centroid";
  const coordinates = referencePoint?.coordinates ?? null;
  return section.getReferencePoint(type, coordinates);
}

export function summarizeConcreteCompressionEdge(edge) {
  if (edge == null) {
    return null;
  }

  return {
    strain: round(edge.strain, 12),
    demand: round(edge.demand, 12),
    y: round(edge.y, 6),
    z: round(edge.z, 6),
  };
}

export function resolveServiceStressSolverActions(actions = {}) {
  const userMxEd = actions?.mxEd ?? actions?.mEd ?? 0;
  const userMyEd = actions?.myEd ?? 0;

  return {
    nEd: actions?.nEd ?? actions?.axialForce,
    mxEd: userMxEd,
    myEd: userMyEd,
  };
}
