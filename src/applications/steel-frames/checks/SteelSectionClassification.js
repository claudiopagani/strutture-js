import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const I_H_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);
const SUPPORTED_FAMILIES = new Set([...I_H_FAMILIES, "UPN"]);
const FORCE_TOLERANCE = 1e-6;
const MOMENT_TOLERANCE = 1e-6;

const round = (value, decimals = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function zeroTinyAction(value, tolerance) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.abs(value) <= tolerance ? 0 : value;
}

function steelYieldStrength(material) {
  return material?.fyk ?? material?.fyd ?? null;
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

function resolveProfileDimensions(section) {
  const resolver = sectionResolver(section);

  return {
    h: resolver.length(section.height ?? section.catalogProperties?.h),
    b: resolver.length(section.width ?? section.catalogProperties?.b),
    tw: resolver.length(section.webThickness ?? section.catalogProperties?.tw),
    tf: resolver.length(section.flangeThickness ?? section.catalogProperties?.tf),
    r: resolver.length(section.rootRadius ?? section.catalogProperties?.r ?? 0) ?? 0,
  };
}

function classifyByLimits(ratio, limits) {
  if (!Number.isFinite(ratio)) {
    return null;
  }

  if (ratio <= limits.class1) {
    return 1;
  }

  if (ratio <= limits.class2) {
    return 2;
  }

  if (ratio <= limits.class3) {
    return 3;
  }

  return 4;
}

function outstandFlangeLimits(epsilon) {
  return {
    class1: 9 * epsilon,
    class2: 10 * epsilon,
    class3: 14 * epsilon,
  };
}

function internalWebLimits({ epsilon, alpha, psi }) {
  const safeAlpha = clamp(alpha, 1e-6, 1);
  const class1 =
    safeAlpha > 0.5
      ? (396 * epsilon) / (13 * safeAlpha - 1)
      : (36 * epsilon) / safeAlpha;
  const class2 =
    safeAlpha > 0.5
      ? (456 * epsilon) / (13 * safeAlpha - 1)
      : (41.5 * epsilon) / safeAlpha;
  const class3 =
    psi > -1
      ? (42 * epsilon) / (0.67 + 0.33 * psi)
      : 62 * epsilon * (1 - psi) * Math.sqrt(-psi);

  return {
    class1,
    class2,
    class3,
  };
}

function compressionAxialForce(nEd, convention = "absolute") {
  if (!Number.isFinite(nEd)) {
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

function stressAtY({
  nCompression,
  mAbs,
  area,
  inertia,
  y,
}) {
  const axialStress = isFinitePositive(area) ? nCompression / area : 0;
  const bendingStress = isFinitePositive(inertia) ? (mAbs * y) / inertia : 0;

  return axialStress + bendingStress;
}

function webStressParameters({
  section,
  nCompression,
  mAbs,
  clearWebDepth,
}) {
  const y = clearWebDepth / 2;
  const topStress = stressAtY({
    nCompression,
    mAbs,
    area: section.area,
    inertia: section.inertiaY,
    y,
  });
  const bottomStress = stressAtY({
    nCompression,
    mAbs,
    area: section.area,
    inertia: section.inertiaY,
    y: -y,
  });
  const sigmaMax = Math.max(topStress, bottomStress);
  const sigmaMin = Math.min(topStress, bottomStress);

  if (sigmaMax <= 0) {
    return {
      compressionExists: false,
      alpha: 0,
      psi: null,
      topStress,
      bottomStress,
    };
  }

  const alpha =
    sigmaMin >= 0
      ? 1
      : clamp(sigmaMax / (sigmaMax - sigmaMin), 0, 1);
  const psi = sigmaMax === 0 ? 1 : sigmaMin / sigmaMax;

  return {
    compressionExists: true,
    alpha,
    psi,
    topStress,
    bottomStress,
  };
}

function flangeOutstandWidth({ family, dimensions }) {
  const { b, tw, r } = dimensions;

  if (I_H_FAMILIES.has(family)) {
    return {
      c: (b - tw - 2 * r) / 2,
      formula: "(b - tw - 2r) / 2",
    };
  }

  if (family === "UPN") {
    return {
      c: b - tw / 2 - r,
      formula: "b - tw / 2 - r",
    };
  }

  return {
    c: null,
    formula: null,
  };
}

function classifyFlange({
  family,
  dimensions,
  epsilon,
}) {
  const { c, formula } = flangeOutstandWidth({ family, dimensions });
  const ratio = isFinitePositive(dimensions.tf) ? c / dimensions.tf : null;
  const limits = outstandFlangeLimits(epsilon);
  const sectionClass = classifyByLimits(ratio, limits);

  return {
    id: "flange",
    type: "outstand-flange",
    compression: true,
    c: round(c),
    t: round(dimensions.tf),
    ratio: round(ratio),
    limits: {
      class1: round(limits.class1),
      class2: round(limits.class2),
      class3: round(limits.class3),
    },
    class: sectionClass,
    metadata: {
      formula,
    },
  };
}

function classifyWeb({
  section,
  dimensions,
  epsilon,
  nCompression,
  mAbs,
}) {
  const c = dimensions.h - 2 * dimensions.tf - 2 * dimensions.r;
  const ratio = isFinitePositive(dimensions.tw) ? c / dimensions.tw : null;
  const stress = webStressParameters({
    section,
    nCompression,
    mAbs,
    clearWebDepth: c,
  });

  if (!stress.compressionExists) {
    return {
      id: "web",
      type: "internal-web",
      compression: false,
      c: round(c),
      t: round(dimensions.tw),
      ratio: round(ratio),
      limits: null,
      class: 1,
      metadata: {
        topStress: round(stress.topStress),
        bottomStress: round(stress.bottomStress),
      },
    };
  }

  const limits = internalWebLimits({
    epsilon,
    alpha: stress.alpha,
    psi: stress.psi,
  });
  const sectionClass = classifyByLimits(ratio, limits);

  return {
    id: "web",
    type: "internal-web",
    compression: true,
    c: round(c),
    t: round(dimensions.tw),
    ratio: round(ratio),
    limits: {
      class1: round(limits.class1),
      class2: round(limits.class2),
      class3: round(limits.class3),
    },
    class: sectionClass,
    metadata: {
      alpha: round(stress.alpha),
      psi: round(stress.psi),
      topStress: round(stress.topStress),
      bottomStress: round(stress.bottomStress),
    },
  };
}

export function classifySteelSection({
  section,
  material,
  nEd = 0,
  mEd = 0,
  axialForceConvention = "absolute",
} = {}) {
  const family = normalizedFamily(section);
  const warnings = [];
  const fyk = steelYieldStrength(material);

  if (!SUPPORTED_FAMILIES.has(family)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      class: 4,
      epsilon: null,
      family,
      profileName: section?.profileName ?? null,
      parts: [],
      warnings: [
        `Steel section classification is not implemented for profile family ${family || "unknown"}.`,
      ],
      metadata: {
        method: "ntc2018-en1993-section-classification-mvp",
        axialForceConvention,
      },
    };
  }

  if (!isFinitePositive(fyk)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      class: 4,
      epsilon: null,
      family,
      profileName: section?.profileName ?? null,
      parts: [],
      warnings: [
        "Steel section classification requires a positive characteristic yield strength fyk.",
      ],
      metadata: {
        method: "ntc2018-en1993-section-classification-mvp",
        axialForceConvention,
      },
    };
  }

  const dimensions = resolveProfileDimensions(section);
  const missing = Object.entries(dimensions)
    .filter(([key, value]) => key !== "r" && !isFinitePositive(value))
    .map(([key]) => key);

  if (missing.length > 0 || !isFinitePositive(section?.area) || !isFinitePositive(section?.inertiaY)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      class: 4,
      epsilon: null,
      family,
      profileName: section?.profileName ?? null,
      parts: [],
      warnings: [
        `Steel section classification requires complete profile geometry; missing ${missing.join(", ") || "area/inertia"}.`,
      ],
      metadata: {
        method: "ntc2018-en1993-section-classification-mvp",
        axialForceConvention,
      },
    };
  }

  const epsilon = Math.sqrt(235 / fyk);
  const normalizedNEd = zeroTinyAction(nEd ?? 0, FORCE_TOLERANCE);
  const normalizedMEd = zeroTinyAction(mEd ?? 0, MOMENT_TOLERANCE);
  const nCompression = compressionAxialForce(normalizedNEd, axialForceConvention);
  const mAbs = Math.abs(normalizedMEd);
  const parts = [
    classifyFlange({
      family,
      dimensions,
      epsilon,
    }),
    classifyWeb({
      section,
      dimensions,
      epsilon,
      nCompression,
      mAbs,
    }),
  ];
  const sectionClass = Math.max(...parts.map((part) => part.class ?? 4));

  if (sectionClass === 4) {
    warnings.push(
      "Steel section is class 4 for this N-M state; effective section properties are required and are not implemented yet.",
    );
  }

  return {
    status: RESULT_STATUS.OK,
    class: sectionClass,
    epsilon: round(epsilon),
    family,
    profileName: section.profileName ?? null,
    parts,
    warnings,
    metadata: {
      method: "ntc2018-en1993-section-classification-mvp",
      axialForceConvention,
      axialCompressionForce: round(nCompression),
      nEd: round(normalizedNEd),
      mEd: round(normalizedMEd),
      fyk: round(fyk),
      actionTolerances: {
        force: FORCE_TOLERANCE,
        moment: MOMENT_TOLERANCE,
      },
      dimensions: {
        h: round(dimensions.h),
        b: round(dimensions.b),
        tw: round(dimensions.tw),
        tf: round(dimensions.tf),
        r: round(dimensions.r),
      },
    },
  };
}
