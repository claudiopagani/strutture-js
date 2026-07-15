import {
  isFinitePositive,
  normalizeCombinationType,
  round,
  utilizationCheck,
} from "../../shared/rcCommon.js";
import { normalizeEnvironment } from "./serviceabilityOptions.js";

const CRACK_WIDTH_BY_COMBINATION = Object.freeze({
  ordinary: {
    SLE_FREQUENT: "w3",
    SLE_QUASI_PERMANENT: "w2",
  },
  aggressive: {
    SLE_FREQUENT: "w2",
    SLE_QUASI_PERMANENT: "w1",
  },
  very_aggressive: {
    SLE_FREQUENT: "w1",
    SLE_QUASI_PERMANENT: "w1",
  },
});

const MAX_BAR_DIAMETER_TABLE = Object.freeze([
  { sigma: 160, w3: 40, w2: 32, w1: 25 },
  { sigma: 200, w3: 32, w2: 25, w1: 16 },
  { sigma: 240, w3: 20, w2: 16, w1: 12 },
  { sigma: 280, w3: 16, w2: 12, w1: 8 },
  { sigma: 320, w3: 12, w2: 10, w1: 6 },
  { sigma: 360, w3: 10, w2: 8, w1: 5 },
]);

const MAX_BAR_SPACING_TABLE = Object.freeze([
  { sigma: 160, w3: 300, w2: 300, w1: 200 },
  { sigma: 200, w3: 300, w2: 250, w1: 150 },
  { sigma: 240, w3: 250, w2: 200, w1: 100 },
  { sigma: 280, w3: 200, w2: 150, w1: 50 },
  { sigma: 320, w3: 150, w2: 100, w1: null },
  { sigma: 360, w3: 100, w2: 50, w1: null },
]);

export function crackWidthLimit({ environment, combinationType }) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const normalizedCombination = normalizeCombinationType(combinationType);

  return CRACK_WIDTH_BY_COMBINATION[normalizedEnvironment]?.[
    normalizedCombination
  ] ?? null;
}

function interpolateTable(table, sigma, widthClass) {
  if (!Number.isFinite(sigma) || sigma < 0) {
    return null;
  }

  const first = table[0];
  const last = table[table.length - 1];

  if (sigma <= first.sigma) {
    return first[widthClass];
  }

  if (sigma >= last.sigma) {
    return last[widthClass];
  }

  for (let index = 0; index < table.length - 1; index += 1) {
    const lower = table[index];
    const upper = table[index + 1];

    if (sigma >= lower.sigma && sigma <= upper.sigma) {
      const lowerValue = lower[widthClass];
      const upperValue = upper[widthClass];

      if (lowerValue == null || upperValue == null) {
        return null;
      }

      const t = (sigma - lower.sigma) / (upper.sigma - lower.sigma);
      return lowerValue + t * (upperValue - lowerValue);
    }
  }

  return null;
}

export function tensionBars(state, section) {
  const barsById = new Map(
    section.getReinforcementBars().map((bar, index) => [
      String(bar.id ?? `bar-${index + 1}`),
      {
        id: bar.id ?? `bar-${index + 1}`,
        name: bar.name,
        diameter: bar.diameter,
        area: bar.area,
        y: bar.y,
        z: bar.z,
      },
    ]),
  );

  return state.steel.bars
    .filter((bar) => bar.stress > 0)
    .map((bar, index) => ({
      ...bar,
      ...(barsById.get(String(bar.id ?? `bar-${index + 1}`)) ?? {}),
      id: bar.id ?? `bar-${index + 1}`,
    }));
}

function reinforcementGroups(section, serviceability = {}) {
  return [
    ...(serviceability.longitudinalReinforcementGroups ?? []),
    ...(section?.metadata?.longitudinalReinforcementGroups ?? []),
  ];
}

function tensionFaceFromMoment(mEd) {
  return (mEd ?? 0) >= 0 ? "bottom" : "top";
}

export function filterBarsForCrackControl({
  bars,
  section,
  serviceability,
  mEd,
  warnings,
}) {
  const requestedGroupId =
    serviceability.cracking?.tensionReinforcementGroupId ??
    serviceability.tensionReinforcementGroupId ??
    null;
  const groups = reinforcementGroups(section, serviceability);
  const tensionFace = tensionFaceFromMoment(mEd);
  const group =
    requestedGroupId == null
      ? groups.find((item) => item.face === tensionFace)
      : groups.find((item) => item.id === requestedGroupId);

  if (!group) {
    const shape = section.concreteSection?.metadata?.shape;

    if (shape !== "rectangular" && shape !== "t-section") {
      warnings.push(
        "Crack control for generic RC sections requires explicit top/bottom reinforcement groups.",
      );

      return {
        bars: [],
        groupId: requestedGroupId,
        face: tensionFace,
        spacing: null,
        missingRequiredGroup: true,
      };
    }

    return {
      bars,
      groupId: null,
      face: tensionFace,
      spacing: null,
      missingRequiredGroup: false,
    };
  }

  const allowedIds = new Set((group.barIds ?? []).map(String));
  const filtered = bars.filter((bar) => allowedIds.has(String(bar.id)));

  if (filtered.length === 0) {
    warnings.push(
      `No tensile bars from reinforcement group ${group.id} were active for crack control at this station.`,
    );
  }

  return {
    bars: filtered,
    groupId: group.id,
    face: group.face ?? tensionFace,
    spacing: Number.isFinite(group.spacing) ? group.spacing : null,
    missingRequiredGroup: false,
  };
}

export function localSpacing(bar, bars, rowTolerance) {
  const rowBars = bars
    .filter((candidate) => Math.abs(candidate.y - bar.y) <= rowTolerance)
    .sort((a, b) => a.z - b.z);
  const index = rowBars.findIndex((candidate) => candidate.id === bar.id);

  if (index === -1 || rowBars.length < 2) {
    return null;
  }

  const previous =
    index > 0 ? Math.abs(rowBars[index].z - rowBars[index - 1].z) : null;
  const next =
    index < rowBars.length - 1
      ? Math.abs(rowBars[index + 1].z - rowBars[index].z)
      : null;

  return Math.min(
    ...(previous == null ? [] : [previous]),
    ...(next == null ? [] : [next]),
  );
}

export function createIndirectCrackControlChecks({
  barsInTension,
  widthClass,
  options,
  combinationType,
  selection,
  stressActions,
}) {
  return barsInTension.flatMap((bar) => {
    const sigmaS = Math.max(bar.stress, 0);
    const diameterLimit = interpolateTable(
      MAX_BAR_DIAMETER_TABLE,
      sigmaS,
      widthClass,
    );
    const spacing = isFinitePositive(selection.spacing)
      ? selection.spacing
      : localSpacing(bar, barsInTension, options.rowTolerance);
    const spacingLimit = interpolateTable(
      MAX_BAR_SPACING_TABLE,
      sigmaS,
      widthClass,
    );
    const metadata = {
      combinationType,
      environment: normalizeEnvironment(options.environment),
      crackWidthClass: widthClass,
      groupId: selection.groupId,
      face: selection.face,
      barId: bar.id,
      sigmaS: round(sigmaS),
      momentBasis: "primary-moment-only",
      mEd: round(stressActions.primaryMoment),
      weakAxisMomentNeglected: stressActions.biaxialStress,
      neglectedMyEd: round(stressActions.userMyEd),
      spacingSource: isFinitePositive(selection.spacing)
        ? "reinforcement-group-explicit"
        : "bar-coordinate-distance",
    };
    const checks = [];

    if (isFinitePositive(diameterLimit)) {
      checks.push(
        utilizationCheck({
          id: "rc-sle-crack-bar-diameter",
          description:
            "Indirect crack control through maximum reinforcing bar diameter",
          demand: bar.diameter,
          capacity: diameterLimit,
          metadata: {
            ...metadata,
            method: "circolare-ntc2018-c4.1.ii",
            diameter: round(bar.diameter),
            diameterLimit: round(diameterLimit),
          },
        }),
      );
    }

    if (spacing != null && isFinitePositive(spacingLimit)) {
      checks.push(
        utilizationCheck({
          id: "rc-sle-crack-bar-spacing",
          description:
            "Indirect crack control through maximum reinforcing bar spacing",
          demand: spacing,
          capacity: spacingLimit,
          metadata: {
            ...metadata,
            method: "circolare-ntc2018-c4.1.iii",
            spacing: round(spacing),
            spacingLimit: round(spacingLimit),
            rowTolerance: round(options.rowTolerance),
          },
        }),
      );
    }

    return checks;
  });
}
