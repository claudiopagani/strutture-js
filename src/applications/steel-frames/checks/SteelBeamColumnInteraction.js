import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const I_H_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);
const DOUBLY_SYMMETRIC_METHOD_B_FAMILIES = new Set([
  ...I_H_FAMILIES,
  "CHS",
  "SHS",
  "RHS",
  "ROUND",
  "FLAT",
]);
const FORCE_TOLERANCE = 1e-9;

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function normalizedFamily(section) {
  return String(section?.family ?? section?.catalogProperties?.family ?? "")
    .trim()
    .toUpperCase();
}

function compressionAxialForce(nEd, convention = "absolute") {
  if (!Number.isFinite(nEd)) {
    return 0;
  }

  if (Math.abs(nEd) <= FORCE_TOLERANCE) {
    return 0;
  }

  if (convention === "compression-positive") {
    return Math.max(nEd, 0);
  }

  if (convention === "compression-negative") {
    return Math.max(-nEd, 0);
  }

  return Math.abs(nEd);
}

function gammaM1FromMaterial(material, gammaM1) {
  return (
    gammaM1 ??
    material?.metadata?.gammaM1 ??
    material?.metadata?.gammaM0 ??
    1.05
  );
}

function methodBCoefficientKyy({
  sectionClass,
  lambdaY,
  axialRatioY,
  alphaMy,
}) {
  if (sectionClass <= 2) {
    return Math.min(
      alphaMy * (1 + (lambdaY - 0.2) * axialRatioY),
      alphaMy * (1 + 0.8 * axialRatioY),
    );
  }

  return Math.min(
    alphaMy * (1 + 0.6 * lambdaY * axialRatioY),
    alphaMy * (1 + 0.6 * axialRatioY),
  );
}

function methodBCoefficientKzy({
  sectionClass,
  lambdaZ,
  axialRatioZ,
  alphaMLT,
}) {
  const denominator = alphaMLT - 0.25;

  if (!isFinitePositive(denominator)) {
    return null;
  }

  if (sectionClass <= 2) {
    const interaction = 1 - (0.1 * lambdaZ * axialRatioZ) / denominator;

    if (lambdaZ >= 0.4) {
      return Math.max(
        interaction,
        1 - (0.1 * axialRatioZ) / denominator,
      );
    }

    return Math.min(0.6 + lambdaZ, interaction);
  }

  return Math.max(
    1 - (0.05 * lambdaZ * axialRatioZ) / denominator,
    1 - (0.05 * axialRatioZ) / denominator,
  );
}

export function calculateSteelMethodBInteractionCoefficients({
  sectionClass,
  relativeSlendernessY,
  relativeSlendernessZ,
  axialRatioY,
  axialRatioZ,
  alphaMy = 1,
  alphaMLT = 1,
} = {}) {
  if (
    !Number.isFinite(sectionClass) ||
    !Number.isFinite(relativeSlendernessY) ||
    !Number.isFinite(relativeSlendernessZ) ||
    !Number.isFinite(axialRatioY) ||
    !Number.isFinite(axialRatioZ) ||
    !isFinitePositive(alphaMy) ||
    !isFinitePositive(alphaMLT)
  ) {
    return null;
  }

  const kyy = methodBCoefficientKyy({
    sectionClass,
    lambdaY: relativeSlendernessY,
    axialRatioY,
    alphaMy,
  });
  const kzy = methodBCoefficientKzy({
    sectionClass,
    lambdaZ: relativeSlendernessZ,
    axialRatioZ,
    alphaMLT,
  });

  if (!Number.isFinite(kyy) || !Number.isFinite(kzy)) {
    return null;
  }

  return {
    kyy: round(kyy),
    kzy: round(kzy),
    alphaMy: round(alphaMy),
    alphaMLT: round(alphaMLT),
  };
}

export function calculateSteelMethodBInteractionCoefficientsMyMz({
  sectionClass,
  relativeSlendernessY,
  relativeSlendernessZ,
  axialRatioY,
  axialRatioZ,
  alphaMy = 1,
  alphaMz = 1,
  alphaMLT = 1,
} = {}) {
  if (
    !Number.isFinite(sectionClass) ||
    !Number.isFinite(relativeSlendernessY) ||
    !Number.isFinite(relativeSlendernessZ) ||
    !Number.isFinite(axialRatioY) ||
    !Number.isFinite(axialRatioZ) ||
    !isFinitePositive(alphaMy) ||
    !isFinitePositive(alphaMz) ||
    !isFinitePositive(alphaMLT)
  ) {
    return null;
  }

  const kyy = methodBCoefficientKyy({
    sectionClass,
    lambdaY: relativeSlendernessY,
    axialRatioY,
    alphaMy,
  });
  const kyz = methodBCoefficientKzy({
    sectionClass,
    lambdaZ: relativeSlendernessY,
    axialRatioZ: axialRatioY,
    alphaMLT: alphaMz,
  });
  const kzy = methodBCoefficientKzy({
    sectionClass,
    lambdaZ: relativeSlendernessZ,
    axialRatioZ,
    alphaMLT,
  });
  const kzz = methodBCoefficientKyy({
    sectionClass,
    lambdaY: relativeSlendernessZ,
    axialRatioY: axialRatioZ,
    alphaMy: alphaMz,
  });

  if (
    !Number.isFinite(kyy) ||
    !Number.isFinite(kyz) ||
    !Number.isFinite(kzy) ||
    !Number.isFinite(kzz)
  ) {
    return null;
  }

  return {
    kyy: round(kyy),
    kyz: round(kyz),
    kzy: round(kzy),
    kzz: round(kzz),
    alphaMy: round(alphaMy),
    alphaMz: round(alphaMz),
    alphaMLT: round(alphaMLT),
    source: "method-b-biaxial-mvp",
  };
}

export function verifySteelBeamColumnInteractionMy({
  section,
  material,
  nEd = 0,
  myEd = 0,
  sectionClass = 1,
  bendingSectionModulus,
  compressionBucklingResult,
  chiLT = 1,
  alphaMy = 1,
  alphaMLT = 1,
  gammaM1 = null,
  axialForceConvention = "absolute",
  allowSinglySymmetric = false,
} = {}) {
  const warnings = [];
  const family = normalizedFamily(section);
  const resolvedGammaM1 = gammaM1FromMaterial(material, gammaM1);
  const fyk = material?.fyk;
  const area = section?.area;
  const demandN = compressionAxialForce(nEd, axialForceConvention);
  const demandMy = Math.abs(myEd ?? 0);

  if (!DOUBLY_SYMMETRIC_METHOD_B_FAMILIES.has(family) && !allowSinglySymmetric) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        `N+Mzz Method B stability interaction is enabled for supported doubly symmetric profiles; profile family ${family || "unknown"} requires a dedicated extension or explicit override.`,
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        family,
        domain: "N+Mzz",
        legacyDomain: "N+My",
      },
    };
  }

  if (sectionClass > 3) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+Mzz Method B stability interaction is blocked for class 4 sections until effective properties are implemented.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        family,
        sectionClass,
      },
    };
  }

  const axisY = compressionBucklingResult?.axisResults?.y;
  const axisZ = compressionBucklingResult?.axisResults?.z;

  if (
    !axisY ||
    !axisZ ||
    !isFinitePositive(axisY.reductionFactor) ||
    !isFinitePositive(axisZ.reductionFactor) ||
    !Number.isFinite(axisY.relativeSlenderness) ||
    !Number.isFinite(axisZ.relativeSlenderness) ||
    !isFinitePositive(chiLT) ||
    !isFinitePositive(area) ||
    !isFinitePositive(fyk) ||
    !isFinitePositive(resolvedGammaM1) ||
    !isFinitePositive(bendingSectionModulus)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+Mzz Method B interaction requires compression buckling reductions, chiLT, A, fyk, gammaM1 and Wzz.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        family,
        sectionClass,
      },
    };
  }

  const axialRatioY =
    (demandN * resolvedGammaM1) / (axisY.reductionFactor * area * fyk);
  const axialRatioZ =
    (demandN * resolvedGammaM1) / (axisZ.reductionFactor * area * fyk);
  const bendingRatio =
    (demandMy * resolvedGammaM1) / (chiLT * bendingSectionModulus * fyk);
  const coefficients = calculateSteelMethodBInteractionCoefficients({
    sectionClass,
    relativeSlendernessY: axisY.relativeSlenderness,
    relativeSlendernessZ: axisZ.relativeSlenderness,
    axialRatioY,
    axialRatioZ,
    alphaMy,
    alphaMLT,
  });

  if (!coefficients) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+Mzz Method B interaction coefficients could not be computed; check alphaMy/alphaMLT and slenderness inputs.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        family,
        sectionClass,
      },
    };
  }

  const equationY = axialRatioY + coefficients.kyy * bendingRatio;
  const equationZ = axialRatioZ + coefficients.kzy * bendingRatio;
  const utilizationRatio = Math.max(equationY, equationZ);
  const governingEquation = equationY >= equationZ ? "y" : "z";

  return {
    status: utilizationRatio <= 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id: "steel-beam-column-interaction-n-my",
      description: "N+Mzz member stability interaction by Method B",
      demand: round(utilizationRatio),
      capacity: 1,
      utilizationRatio: round(utilizationRatio),
      ok: utilizationRatio <= 1,
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my",
        interactionTable: "C4.2.V-method-b-supported-family",
        domain: "N+Mzz",
        legacyDomain: "N+My",
        primaryMomentAxis: "z",
        primaryMomentSymbol: "Mzz",
        legacyPrimaryMomentParameter: "myEd",
        excludedActions: "Myy, torsion, torsional-interactions",
        family,
        sectionClass,
        axialForceConvention,
        gammaM1: round(resolvedGammaM1),
        fyk: round(fyk),
        area: round(area),
        bendingSectionModulus: round(bendingSectionModulus),
        chiY: axisY.reductionFactor,
        chiZ: axisZ.reductionFactor,
        chiLT: round(chiLT),
        relativeSlendernessY: axisY.relativeSlenderness,
        relativeSlendernessZ: axisZ.relativeSlenderness,
        axialRatioY: round(axialRatioY),
        axialRatioZ: round(axialRatioZ),
        bendingRatio: round(bendingRatio),
        equationY: round(equationY),
        equationZ: round(equationZ),
        governingEquation,
        ...coefficients,
      },
    },
    warnings,
  };
}

export function verifySteelBeamColumnInteractionMyMz({
  section,
  material,
  nEd = 0,
  myEd = 0,
  mzEd = 0,
  sectionClass = 1,
  bendingSectionModulusY,
  bendingSectionModulusZ,
  compressionBucklingResult,
  chiLT = 1,
  alphaMy = 1,
  alphaMz = 1,
  alphaMLT = 1,
  gammaM1 = null,
  axialForceConvention = "absolute",
  allowSinglySymmetric = false,
} = {}) {
  const warnings = [];
  const family = normalizedFamily(section);
  const resolvedGammaM1 = gammaM1FromMaterial(material, gammaM1);
  const fyk = material?.fyk;
  const area = section?.area;
  const demandN = compressionAxialForce(nEd, axialForceConvention);
  const demandMy = Math.abs(myEd ?? 0);
  const demandMz = Math.abs(mzEd ?? 0);

  if (!DOUBLY_SYMMETRIC_METHOD_B_FAMILIES.has(family) && !allowSinglySymmetric) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        `N+Mzz+Myy Method B stability interaction is enabled for supported doubly symmetric profiles; profile family ${family || "unknown"} requires a dedicated extension or explicit override.`,
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        family,
        domain: "N+Mzz+Myy",
        legacyDomain: "N+My+Mz",
      },
    };
  }

  if (sectionClass > 3) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+Mzz+Myy Method B stability interaction is blocked for class 4 sections until effective properties are implemented.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        family,
        sectionClass,
      },
    };
  }

  const axisY = compressionBucklingResult?.axisResults?.y;
  const axisZ = compressionBucklingResult?.axisResults?.z;

  if (
    !axisY ||
    !axisZ ||
    !isFinitePositive(axisY.reductionFactor) ||
    !isFinitePositive(axisZ.reductionFactor) ||
    !Number.isFinite(axisY.relativeSlenderness) ||
    !Number.isFinite(axisZ.relativeSlenderness) ||
    !isFinitePositive(chiLT) ||
    !isFinitePositive(area) ||
    !isFinitePositive(fyk) ||
    !isFinitePositive(resolvedGammaM1) ||
    !isFinitePositive(bendingSectionModulusY) ||
    !isFinitePositive(bendingSectionModulusZ)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+Mzz+Myy Method B interaction requires compression buckling reductions, chiLT, A, fyk, gammaM1, Wzz and Wyy.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        family,
        sectionClass,
      },
    };
  }

  const axialRatioY =
    (demandN * resolvedGammaM1) / (axisY.reductionFactor * area * fyk);
  const axialRatioZ =
    (demandN * resolvedGammaM1) / (axisZ.reductionFactor * area * fyk);
  const bendingRatioYLT =
    (demandMy * resolvedGammaM1) / (chiLT * bendingSectionModulusY * fyk);
  const bendingRatioZ =
    (demandMz * resolvedGammaM1) / (bendingSectionModulusZ * fyk);
  const coefficients = calculateSteelMethodBInteractionCoefficientsMyMz({
    sectionClass,
    relativeSlendernessY: axisY.relativeSlenderness,
    relativeSlendernessZ: axisZ.relativeSlenderness,
    axialRatioY,
    axialRatioZ,
    alphaMy,
    alphaMz,
    alphaMLT,
  });

  if (!coefficients) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      warnings: [
        "N+Mzz+Myy Method B interaction coefficients could not be computed; check alphaMy/alphaMz/alphaMLT and slenderness inputs.",
      ],
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        family,
        sectionClass,
      },
    };
  }

  const equationY =
    axialRatioY +
    coefficients.kyy * bendingRatioYLT +
    coefficients.kyz * bendingRatioZ;
  const equationZ =
    axialRatioZ +
    coefficients.kzy * bendingRatioYLT +
    coefficients.kzz * bendingRatioZ;
  const utilizationRatio = Math.max(equationY, equationZ);
  const governingEquation = equationY >= equationZ ? "y" : "z";

  return {
    status: utilizationRatio <= 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id: "steel-beam-column-interaction-n-my-mz",
      description: "N+Mzz+Myy member stability interaction by Method B",
      demand: round(utilizationRatio),
      capacity: 1,
      utilizationRatio: round(utilizationRatio),
      ok: utilizationRatio <= 1,
      metadata: {
        method: "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
        interactionTable: "C4.2.V-method-b-supported-family",
        domain: "N+Mzz+Myy",
        legacyDomain: "N+My+Mz",
        primaryMomentAxis: "z",
        primaryMomentSymbol: "Mzz",
        secondaryMomentAxis: "y",
        secondaryMomentSymbol: "Myy",
        legacyPrimaryMomentParameter: "myEd",
        legacySecondaryMomentParameter: "mzEd",
        excludedActions: "torsion, torsional-interactions",
        coefficientModel: "biaxial-method-b-mvp",
        family,
        sectionClass,
        axialForceConvention,
        gammaM1: round(resolvedGammaM1),
        fyk: round(fyk),
        area: round(area),
        bendingSectionModulusY: round(bendingSectionModulusY),
        bendingSectionModulusZ: round(bendingSectionModulusZ),
        chiY: axisY.reductionFactor,
        chiZ: axisZ.reductionFactor,
        chiLT: round(chiLT),
        relativeSlendernessY: axisY.relativeSlenderness,
        relativeSlendernessZ: axisZ.relativeSlenderness,
        axialRatioY: round(axialRatioY),
        axialRatioZ: round(axialRatioZ),
        bendingRatioYLT: round(bendingRatioYLT),
        bendingRatioZ: round(bendingRatioZ),
        equationY: round(equationY),
        equationZ: round(equationZ),
        governingEquation,
        ...coefficients,
      },
    },
    warnings,
  };
}
