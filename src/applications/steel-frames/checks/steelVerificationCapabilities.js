import { createSteelProfileSection } from "../../../domain/geometry/createSteelProfileSection.js";

const I_H_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);
const U_SECTION_FAMILIES = new Set(["UPN"]);
const CLOSED_HOLLOW_FAMILIES = new Set(["CHS", "SHS", "RHS"]);
const AXISYMMETRIC_OR_SQUARE_FAMILIES = new Set(["CHS", "SHS", "ROUND"]);
const DOUBLY_SYMMETRIC_METHOD_B_FAMILIES = new Set([
  ...I_H_FAMILIES,
  "CHS",
  "SHS",
  "RHS",
  "ROUND",
  "FLAT",
]);
const CLASSIFICATION_FAMILIES = new Set([
  ...I_H_FAMILIES,
  ...U_SECTION_FAMILIES,
  ...CLOSED_HOLLOW_FAMILIES,
  "ROUND",
  "FLAT",
  "L",
  "LU",
  "T",
]);
const AUTOMATIC_COMPRESSION_BUCKLING_FAMILIES = new Set([
  ...I_H_FAMILIES,
  ...U_SECTION_FAMILIES,
  ...CLOSED_HOLLOW_FAMILIES,
  "ROUND",
  "FLAT",
]);
const OPEN_UNSYMMETRIC_FAMILIES = new Set(["L", "LU", "T"]);
const AUTOMATIC_MCR_FAMILIES = new Set([...I_H_FAMILIES, "RHS"]);

function normalizedFamily(section) {
  return String(section?.family ?? section?.catalogProperties?.family ?? "")
    .trim()
    .toUpperCase();
}

function resolveSection({ section = null, profileName = null, units = null } = {}) {
  if (section) {
    return section;
  }

  if (!profileName) {
    return null;
  }

  return createSteelProfileSection({ profileName, units });
}

function profileNameOf(section, fallback = null) {
  return section?.profileName ?? section?.metadata?.profileName ?? fallback;
}

function supported(message = null, extra = {}) {
  return {
    status: "supported",
    message,
    ...extra,
  };
}

function automatic(message = null, extra = {}) {
  return {
    status: "automatic",
    message,
    ...extra,
  };
}

function requiresInput(requiredInputs, message = null, extra = {}) {
  return {
    status: "requires-input",
    requiredInputs,
    message,
    ...extra,
  };
}

function requiresOverride(requiredInputs, message = null, extra = {}) {
  return {
    status: "requires-override",
    requiredInputs,
    message,
    ...extra,
  };
}

function notRequired(message = null, extra = {}) {
  return {
    status: "not-required",
    message,
    ...extra,
  };
}

function notSupported(message = null, extra = {}) {
  return {
    status: "not-supported",
    message,
    ...extra,
  };
}

function classificationCapability(family) {
  if (CLASSIFICATION_FAMILIES.has(family)) {
    return supported("Local section classification is implemented for this profile family.", {
      class4EffectiveProperties: "not-supported",
    });
  }

  if (family === "COMPOUND") {
    return notSupported(
      "Compound profile classification requires a dedicated local-component classification model.",
      {
        class4EffectiveProperties: "not-supported",
      },
    );
  }

  return notSupported(`Local section classification is not implemented for family ${family || "unknown"}.`);
}

function compressionBucklingCapability(family) {
  if (AUTOMATIC_COMPRESSION_BUCKLING_FAMILIES.has(family)) {
    return automatic("Flexural compression buckling can be checked automatically about y and z.", {
      requiredInputs: ["effective lengths or member lengths about y and z"],
      excludes: ["torsional buckling", "flexural-torsional buckling"],
    });
  }

  if (OPEN_UNSYMMETRIC_FAMILIES.has(family)) {
    return requiresOverride(
      ["allowOpenSectionFlexuralBuckling", "effective lengths or member lengths about y and z"],
      "Only flexural y/z buckling is available; torsional and flexural-torsional buckling must be checked separately.",
      {
        excludes: ["torsional buckling", "flexural-torsional buckling"],
      },
    );
  }

  if (family === "COMPOUND") {
    return notSupported(
      "Compound member buckling needs a dedicated model for built-up member spacing, connectors and global/local modes.",
    );
  }

  return notSupported(`Compression buckling is not enabled for family ${family || "unknown"}.`);
}

function lateralTorsionalBucklingCapability(family) {
  if (AUTOMATIC_MCR_FAMILIES.has(family)) {
    return automatic("Elastic critical moment Mcr can be estimated automatically.", {
      requiredInputs: ["unbraced length"],
    });
  }

  if (AXISYMMETRIC_OR_SQUARE_FAMILIES.has(family)) {
    return notRequired("Classic lateral-torsional buckling check is treated as not governing for this family.", {
      chiLT: 1,
    });
  }

  if (family === "COMPOUND") {
    return requiresInput(
      ["sectionClass", "criticalMoment"],
      "Compound profile LTB can be checked only when classification and Mcr are supplied by a dedicated model.",
    );
  }

  return requiresInput(
    ["criticalMoment"],
    "Automatic Mcr is not implemented for this family; provide a user critical moment or disable LTB only when physically restrained.",
  );
}

function beamColumnInteractionCapability(family) {
  if (DOUBLY_SYMMETRIC_METHOD_B_FAMILIES.has(family)) {
    return automatic("Method B N+M interaction is available for this supported doubly symmetric family.", {
      domains: ["N+Mzz", "N+Mzz+Myy"],
      legacyDomains: ["N+My", "N+My+Mz"],
      excludes: ["torsion", "torsional interactions"],
    });
  }

  if (family === "UPN") {
    return requiresOverride(
      ["allowSinglySymmetric"],
      "UPN interaction requires an explicit override or a dedicated singly symmetric extension.",
      {
        domains: ["N+Mzz"],
        legacyDomains: ["N+My"],
        excludes: ["Myy by default", "torsion", "torsional interactions"],
      },
    );
  }

  if (OPEN_UNSYMMETRIC_FAMILIES.has(family)) {
    return requiresOverride(
      ["allowSinglySymmetric or dedicated unsymmetric interaction model"],
      "Open unsymmetric profiles need a dedicated stability interaction model for production use.",
      {
        excludes: ["torsion", "torsional interactions"],
      },
    );
  }

  if (family === "COMPOUND") {
    return notSupported(
      "Compound profile interaction needs a dedicated built-up member verification model.",
    );
  }

  return notSupported(`Beam-column interaction is not enabled for family ${family || "unknown"}.`);
}

function compoundCapability(family) {
  if (family !== "COMPOUND") {
    return {
      geometry: "not-applicable",
      normativeVerification: "not-applicable",
    };
  }

  return {
    geometry: "supported",
    elasticStiffness: "supported",
    normativeVerification: "not-supported",
    message:
      "Compound sections expose geometric properties, but local classification, built-up buckling and connector checks require a dedicated verifier.",
  };
}

export function getSteelVerificationCapabilities({
  section = null,
  profileName = null,
  units = null,
} = {}) {
  let resolvedSection = null;

  try {
    resolvedSection = resolveSection({ section, profileName, units });
  } catch (error) {
    return {
      status: "not-supported",
      family: "",
      profileName,
      checks: {
        classification: notSupported(error.message),
        sectionResistance: notSupported(error.message),
        compressionBuckling: notSupported(error.message),
        lateralTorsionalBuckling: notSupported(error.message),
        beamColumnInteraction: notSupported(error.message),
        serviceability: notSupported(error.message),
      },
      compound: compoundCapability(""),
      limitations: [error.message],
    };
  }

  const family = normalizedFamily(resolvedSection);

  if (!resolvedSection) {
    return {
      status: "not-supported",
      family: "",
      profileName,
      checks: {
        classification: notSupported("A steel section or profileName is required."),
        sectionResistance: notSupported("A steel section or profileName is required."),
        compressionBuckling: notSupported("A steel section or profileName is required."),
        lateralTorsionalBuckling: notSupported("A steel section or profileName is required."),
        beamColumnInteraction: notSupported("A steel section or profileName is required."),
        serviceability: notSupported("A steel section or profileName is required."),
      },
      compound: compoundCapability(family),
    };
  }

  const checks = {
    classification: classificationCapability(family),
    sectionResistance: supported("Elastic/plastic section resistance uses available section area and section moduli.", {
      class4EffectiveProperties: "not-supported",
    }),
    compressionBuckling: compressionBucklingCapability(family),
    lateralTorsionalBuckling: lateralTorsionalBucklingCapability(family),
    beamColumnInteraction: beamColumnInteractionCapability(family),
    serviceability: supported("SLE vertical deflection checks are available from FEM beam results.", {
      requiredInputs: ["SLE combination", "deflection limit ratio"],
    }),
  };

  const unsupportedCount = Object.values(checks).filter(
    (item) => item.status === "not-supported",
  ).length;

  return {
    status: unsupportedCount === 0 ? "supported" : "partially-supported",
    family,
    profileName: profileNameOf(resolvedSection, profileName),
    checks,
    compound: compoundCapability(family),
    limitations: [
      "Class 4 effective section properties are not implemented.",
      "Torsion and torsional interactions are excluded from the current steel member verifier.",
      "Compound profile verification is geometric/elastic until a dedicated built-up member verifier is added.",
    ],
  };
}
