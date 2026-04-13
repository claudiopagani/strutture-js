import { createUnitResolver } from "../../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const AUTOMATIC_MCR_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizedFamily(section) {
  return String(section?.family ?? section?.catalogProperties?.family ?? "")
    .trim()
    .toUpperCase();
}

function sectionResolver(section) {
  return createUnitResolver(
    section?.metadata?.unitSystem ?? INTERNAL_UNITS,
    INTERNAL_UNITS,
  );
}

function resolveCatalogInertia(section, key, fallback) {
  const value = section?.catalogProperties?.[key];

  if (Number.isFinite(value) && section?.metadata?.unitSystem) {
    return sectionResolver(section).inertia(value);
  }

  return fallback;
}

function resolveWarpingConstant(section) {
  const value = section?.catalogProperties?.Iw;

  if (Number.isFinite(value) && section?.metadata?.unitSystem) {
    return sectionResolver(section).convert(value, { lengthExponent: 6 });
  }

  return section?.warpingConstant ?? null;
}

function shearModulus(material) {
  if (Number.isFinite(material?.shearModulus)) {
    return material.shearModulus;
  }

  if (
    Number.isFinite(material?.elasticModulus) &&
    Number.isFinite(material?.poissonRatio)
  ) {
    return material.elasticModulus / (2 * (1 + material.poissonRatio));
  }

  if (Number.isFinite(material?.elasticModulus)) {
    return material.elasticModulus / (2 * (1 + 0.3));
  }

  return null;
}

function imperfectionFactorFromCurve(curve) {
  const normalized = String(curve ?? "").trim().toLowerCase();
  const values = {
    a: 0.21,
    b: 0.34,
    c: 0.49,
    d: 0.76,
  };

  return values[normalized] ?? null;
}

function defaultLtbCurve(section) {
  const family = normalizedFamily(section);
  const h = sectionResolver(section).length(
    section?.height ?? section?.catalogProperties?.h,
  );
  const b = sectionResolver(section).length(
    section?.width ?? section?.catalogProperties?.b,
  );

  if (AUTOMATIC_MCR_FAMILIES.has(family) && isFinitePositive(h) && isFinitePositive(b)) {
    return h / b <= 2 ? "b" : "c";
  }

  return "d";
}

function reductionFactorLT({
  relativeSlenderness,
  curve,
  imperfectionFactor,
  beta = 1,
  lambda0 = 0.2,
  fFactor = 1,
  kChi = 1,
}) {
  const alphaLT =
    Number.isFinite(imperfectionFactor)
      ? imperfectionFactor
      : imperfectionFactorFromCurve(curve);
  const lambdaLT = relativeSlenderness;

  if (!isFinitePositive(lambdaLT) || !isFinitePositive(alphaLT)) {
    return null;
  }

  const phiLT =
    0.5 * (1 + alphaLT * (lambdaLT - lambda0) + beta * lambdaLT ** 2);
  const radical = phiLT ** 2 - beta * lambdaLT ** 2;
  const baseChi =
    radical >= 0
      ? 1 / (phiLT + Math.sqrt(radical))
      : null;

  if (!Number.isFinite(baseChi)) {
    return null;
  }

  return {
    chiLT: round(clamp(baseChi * fFactor * kChi, 0, 1)),
    baseChiLT: round(baseChi),
    phiLT: round(phiLT),
    alphaLT: round(alphaLT),
    beta: round(beta),
    lambda0: round(lambda0),
    fFactor: round(fFactor),
    kChi: round(kChi),
  };
}

export function calculateElasticCriticalMomentLT({
  section,
  material,
  unbracedLength,
  effectiveLengthFactor = 1,
  warpingLengthFactor = 1,
  momentGradientFactor = 1,
} = {}) {
  const family = normalizedFamily(section);
  const warnings = [];

  if (!AUTOMATIC_MCR_FAMILIES.has(family)) {
    return {
      status: "not-supported",
      value: null,
      warnings: [
        `Automatic Mcr calculation is implemented only for doubly symmetric I/H profiles; profile family ${family || "unknown"} requires user-provided Mcr.`,
      ],
      metadata: {
        method: "ntc2018-en1993-ltb-mcr-ih-simplified",
        family,
      },
    };
  }

  const E = material?.elasticModulus;
  const G = shearModulus(material);
  const Iz = resolveCatalogInertia(section, "Iz", section?.inertiaZ);
  const It = resolveCatalogInertia(section, "IT", section?.torsionalConstant);
  const Iw = resolveWarpingConstant(section);
  const L = unbracedLength * effectiveLengthFactor;
  const kw = warpingLengthFactor;
  const C1 = momentGradientFactor;

  if (
    !isFinitePositive(E) ||
    !isFinitePositive(G) ||
    !isFinitePositive(Iz) ||
    !isFinitePositive(It) ||
    !isFinitePositive(Iw) ||
    !isFinitePositive(L) ||
    !isFinitePositive(kw) ||
    !isFinitePositive(C1)
  ) {
    return {
      status: "not-supported",
      value: null,
      warnings: [
        "Automatic Mcr calculation requires E, G, Iz, IT, Iw, unbraced length and positive factors.",
      ],
      metadata: {
        method: "ntc2018-en1993-ltb-mcr-ih-simplified",
        family,
        E: round(E),
        G: round(G),
        Iz: round(Iz),
        It: round(It),
        Iw: round(Iw),
        unbracedLength: round(unbracedLength),
        effectiveLengthFactor,
        warpingLengthFactor,
        momentGradientFactor,
      },
    };
  }

  const base = (Math.PI ** 2 * E * Iz) / L ** 2;
  const torsionTerm = (L ** 2 * G * It) / (Math.PI ** 2 * E * Iz);
  const warpingTerm = (Iw / Iz) / kw ** 2;
  const mCr = C1 * base * Math.sqrt(warpingTerm + torsionTerm);

  if (!isFinitePositive(mCr)) {
    warnings.push("Automatic Mcr calculation produced a non-positive value.");
  }

  return {
    status: isFinitePositive(mCr) ? "ok" : "not-supported",
    value: isFinitePositive(mCr) ? mCr : null,
    warnings,
    metadata: {
      method: "ntc2018-en1993-ltb-mcr-ih-simplified",
      family,
      E: round(E),
      G: round(G),
      Iz: round(Iz),
      It: round(It),
      Iw: round(Iw),
      unbracedLength: round(unbracedLength),
      effectiveLength: round(L),
      effectiveLengthFactor,
      warpingLengthFactor,
      momentGradientFactor,
      warpingTerm: round(warpingTerm),
      torsionTerm: round(torsionTerm),
    },
  };
}

export function verifySteelLateralTorsionalBuckling({
  section,
  material,
  mEd,
  sectionClass,
  bendingSectionModulus,
  unbracedLength,
  criticalMoment = null,
  criticalMomentSource = null,
  gammaM1 = null,
  curve = null,
  imperfectionFactor = null,
  beta = 1,
  lambda0 = 0.2,
  fFactor = 1,
  kChi = 1,
  effectiveLengthFactor = 1,
  warpingLengthFactor = 1,
  momentGradientFactor = 1,
} = {}) {
  const warnings = [];
  const selectedCurve = curve ?? defaultLtbCurve(section);
  const resolvedGammaM1 =
    gammaM1 ?? material?.metadata?.gammaM1 ?? material?.metadata?.gammaM0 ?? 1.05;
  const fyk = material?.fyk;
  let mCr = criticalMoment;
  let mCrMetadata = {};
  let source = criticalMomentSource ?? "user-provided";

  if (!isFinitePositive(mCr)) {
    const automatic = calculateElasticCriticalMomentLT({
      section,
      material,
      unbracedLength,
      effectiveLengthFactor,
      warpingLengthFactor,
      momentGradientFactor,
    });

    mCr = automatic.value;
    mCrMetadata = automatic.metadata;
    source = "automatic-simplified";
    warnings.push(...automatic.warnings);
  }

  if (!isFinitePositive(mCr)) {
    return {
      status: "not-supported",
      check: null,
      warnings,
      metadata: {
        method: "ntc2018-en1993-lateral-torsional-buckling-mvp",
        family: normalizedFamily(section),
        criticalMomentSource: source,
        ...mCrMetadata,
      },
    };
  }

  if (
    !isFinitePositive(fyk) ||
    !isFinitePositive(resolvedGammaM1) ||
    !isFinitePositive(bendingSectionModulus)
  ) {
    return {
      status: "not-supported",
      check: null,
      warnings: [
        ...warnings,
        "LTB verification requires fyk, gammaM1 and a positive bending section modulus.",
      ],
      metadata: {
        method: "ntc2018-en1993-lateral-torsional-buckling-mvp",
        family: normalizedFamily(section),
      },
    };
  }

  if (sectionClass > 3) {
    return {
      status: "not-supported",
      check: null,
      warnings: [
        ...warnings,
        "LTB verification is blocked for class 4 sections until effective section properties are implemented.",
      ],
      metadata: {
        method: "ntc2018-en1993-lateral-torsional-buckling-mvp",
        family: normalizedFamily(section),
        sectionClass,
      },
    };
  }

  const referenceMoment = bendingSectionModulus * fyk;
  const relativeSlenderness = Math.sqrt(referenceMoment / mCr);
  const reduction = reductionFactorLT({
    relativeSlenderness,
    curve: selectedCurve,
    imperfectionFactor,
    beta,
    lambda0,
    fFactor,
    kChi,
  });

  if (!reduction) {
    return {
      status: "not-supported",
      check: null,
      warnings: [
        ...warnings,
        "LTB verification could not compute a valid reduction factor.",
      ],
      metadata: {
        method: "ntc2018-en1993-lateral-torsional-buckling-mvp",
        family: normalizedFamily(section),
        relativeSlenderness: round(relativeSlenderness),
      },
    };
  }

  const capacity = reduction.chiLT * referenceMoment / resolvedGammaM1;
  const utilizationRatio = Math.abs(mEd) / capacity;

  return {
    status: utilizationRatio <= 1 ? "ok" : "not-verified",
    check: {
      id: "steel-lateral-torsional-buckling",
      description: "Lateral-torsional buckling resistance of the steel beam segment",
      demand: round(Math.abs(mEd)),
      capacity: round(capacity),
      utilizationRatio: round(utilizationRatio),
      ok: utilizationRatio <= 1,
      metadata: {
        ...mCrMetadata,
        method: "ntc2018-en1993-lateral-torsional-buckling-mvp",
        criticalMomentMethod: mCrMetadata.method ?? null,
        family: normalizedFamily(section),
        sectionClass,
        curve: selectedCurve,
        gammaM1: round(resolvedGammaM1),
        fyk: round(fyk),
        bendingSectionModulus: round(bendingSectionModulus),
        referenceMoment: round(referenceMoment),
        criticalMoment: round(mCr),
        criticalMomentSource: source,
        relativeSlenderness: round(relativeSlenderness),
        ...reduction,
      },
    },
    warnings,
  };
}
