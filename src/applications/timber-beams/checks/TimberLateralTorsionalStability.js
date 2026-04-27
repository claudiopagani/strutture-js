import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const DEFAULT_E005_RATIO = 2 / 3;
const FORCE_TOLERANCE = 1e-9;

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hasSignificantAction(value, tolerance = FORCE_TOLERANCE) {
  return Number.isFinite(value) && Math.abs(value) > tolerance;
}

function sectionShape(section) {
  return String(section?.metadata?.shape ?? section?.shape ?? "")
    .trim()
    .toLowerCase();
}

function resolveE005(material, override = null) {
  if (isFinitePositive(override)) {
    return {
      value: override,
      source: "user-provided",
    };
  }

  const materialValue =
    material?.e0_05 ??
    material?.e005 ??
    material?.E0_05 ??
    material?.metadata?.e0_05 ??
    material?.metadata?.e005 ??
    null;

  if (isFinitePositive(materialValue)) {
    return {
      value: materialValue,
      source: material?.metadata?.e0_05Source ?? "material",
    };
  }

  if (isFinitePositive(material?.elasticModulus)) {
    return {
      value: material.elasticModulus * DEFAULT_E005_RATIO,
      source: "mean-elastic-modulus-ratio-2/3",
    };
  }

  return {
    value: null,
    source: "unavailable",
  };
}

export function calculateTimberRectangularCriticalBendingStress({
  width,
  height,
  effectiveLength,
  e0_05,
} = {}) {
  if (
    !isFinitePositive(width) ||
    !isFinitePositive(height) ||
    !isFinitePositive(effectiveLength) ||
    !isFinitePositive(e0_05)
  ) {
    return null;
  }

  return (0.78 * width ** 2 * e0_05) / (height * effectiveLength);
}

export function calculateTimberLateralBucklingReduction(relativeSlenderness) {
  if (!isFinitePositive(relativeSlenderness)) {
    return null;
  }

  if (relativeSlenderness <= 0.75) {
    return 1;
  }

  if (relativeSlenderness <= 1.4) {
    return 1.56 - 0.75 * relativeSlenderness;
  }

  return 1 / relativeSlenderness ** 2;
}

export function verifyTimberLateralTorsionalStability({
  section,
  material,
  myEd = 0,
  mzEd = 0,
  unbracedLength,
  fmD,
  fmK = material?.fmK,
  kcrit = null,
  sigmaMcrit = null,
  e0_05 = null,
  metadata = {},
} = {}) {
  const warnings = [];
  const wy = section?.elasticSectionModulusY;
  const wz = section?.elasticSectionModulusZ;

  if (!isFinitePositive(fmD) || !isFinitePositive(fmK)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "Timber lateral-torsional stability requires design and characteristic bending strengths fmD/fmK.",
      ],
    };
  }

  if (!isFinitePositive(wy) || !isFinitePositive(wz)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "Timber lateral-torsional stability requires elastic section moduli Wy and Wz.",
      ],
    };
  }

  let resolvedKcrit = null;
  let resolvedSigmaMcrit = null;
  let relativeSlenderness = null;
  let criticalStressSource = null;
  let e005 = null;
  let e005Source = null;

  if (isFinitePositive(kcrit)) {
    resolvedKcrit = clamp(kcrit, 0, 1);
    criticalStressSource = "user-provided-kcrit";

    if (kcrit > 1) {
      warnings.push("User-provided timber kcrit was greater than 1 and has been capped to 1.");
    }
  } else {
    if (isFinitePositive(sigmaMcrit)) {
      resolvedSigmaMcrit = sigmaMcrit;
      criticalStressSource = "user-provided-sigma-m-crit";
    } else if (sectionShape(section) === "rectangular") {
      const resolvedE005 = resolveE005(material, e0_05);
      e005 = resolvedE005.value;
      e005Source = resolvedE005.source;
      resolvedSigmaMcrit = calculateTimberRectangularCriticalBendingStress({
        width: section.width,
        height: section.height,
        effectiveLength: unbracedLength,
        e0_05: e005,
      });
      criticalStressSource = "ec5-rectangular-simplified";
    }

    if (!isFinitePositive(resolvedSigmaMcrit)) {
      return {
        status: RESULT_STATUS.NOT_SUPPORTED,
        check: null,
        warnings: [
          "Timber lateral-torsional stability requires kcrit, sigmaMcrit, or a rectangular section with width, height, effective unbraced length and E0,05.",
        ],
        metadata: {
          shape: sectionShape(section),
          unbracedLength: round(unbracedLength),
          e0_05: round(e005),
          e0_05Source: e005Source,
        },
      };
    }

    relativeSlenderness = Math.sqrt(fmK / resolvedSigmaMcrit);
    resolvedKcrit = calculateTimberLateralBucklingReduction(relativeSlenderness);
  }

  if (!isFinitePositive(resolvedKcrit)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "Timber lateral-torsional stability could not compute a positive kcrit.",
      ],
    };
  }

  const capacityY = resolvedKcrit * fmD * wy;
  const capacityZ = fmD * wz;
  const utilizationRatioY = hasSignificantAction(myEd)
    ? Math.abs(myEd) / capacityY
    : 0;
  const utilizationRatioZ = hasSignificantAction(mzEd)
    ? Math.abs(mzEd) / capacityZ
    : 0;
  const utilizationRatio = utilizationRatioY + utilizationRatioZ;

  return {
    status: utilizationRatio <= 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id: "timber-lateral-torsional-stability",
      description: "Timber lateral-torsional stability with weak-axis moment interaction",
      demand: round(utilizationRatio),
      capacity: 1,
      utilizationRatio: round(utilizationRatio),
      ok: utilizationRatio <= 1,
      metadata: {
        method: "ntc2018-ec5-timber-lateral-torsional-stability-mvp",
        criticalStressSource,
        e0_05: round(e005),
        e0_05Source: e005Source,
        fmK: round(fmK),
        fmD: round(fmD),
        width: round(section?.width),
        height: round(section?.height),
        unbracedLength: round(unbracedLength),
        sigmaMcrit: round(resolvedSigmaMcrit),
        relativeSlenderness: round(relativeSlenderness),
        kcrit: round(resolvedKcrit),
        myEd: round(myEd),
        mzEd: round(mzEd),
        bendingCapacityY: round(capacityY),
        bendingCapacityZ: round(capacityZ),
        utilizationRatioY: round(utilizationRatioY),
        utilizationRatioZ: round(utilizationRatioZ),
        weakAxisMomentIncluded: hasSignificantAction(mzEd),
        ...metadata,
      },
    },
    warnings,
  };
}
