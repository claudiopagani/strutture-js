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
    availability: "automatic",
    message,
    ...extra,
  };
}

function automatic(message = null, extra = {}) {
  return {
    status: "automatic",
    availability: "automatic",
    message,
    ...extra,
  };
}

function requiresInput(requiredInputs, message = null, extra = {}) {
  return {
    status: "requires-input",
    availability: "requires-input",
    requiredInputs,
    message,
    ...extra,
  };
}

function requiresOverride(requiredInputs, message = null, extra = {}) {
  return {
    status: "requires-override",
    availability: "requires-input",
    requiredInputs,
    message,
    ...extra,
  };
}

function notRequired(message = null, extra = {}) {
  return {
    status: "not-required",
    availability: "automatic",
    message,
    ...extra,
  };
}

function notSupported(message = null, extra = {}) {
  return {
    status: "not-supported",
    availability: "not-supported",
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
      domains: ["N+My", "N+My+Mz"],
      excludes: ["torsion", "torsional interactions"],
    });
  }

  if (family === "UPN") {
    return requiresOverride(
      ["allowSinglySymmetric"],
      "UPN interaction requires an explicit override or a dedicated singly symmetric extension.",
      {
        domains: ["N+My"],
        excludes: ["Mz by default", "torsion", "torsional interactions"],
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
    webShearBuckling: I_H_FAMILIES.has(family)
      ? requiresInput(
          ["web panels", "panel lengths", "end-post type", "transverse stiffeners"],
          "I/H web shear buckling is automatic after the panel and stiffener layout is supplied.",
          { method: "NTC 2018 §4.2.4.1.2.6 / EN 1993-1-5 §5" },
        )
      : notRequired("The implemented web-panel shear-buckling model applies only to rolled/welded I/H sections."),
    concentratedWebLoads: I_H_FAMILIES.has(family)
      ? requiresInput(
          ["load station", "bearing length", "load type", "containing web panel"],
          "Transverse concentrated web-load resistance is automatic with load-introduction data.",
          { method: "NTC 2018 §4.2.4.1.2.6 / EN 1993-1-5 §6" },
        )
      : notSupported("Concentrated transverse web loads are currently implemented only for I/H sections."),
    bendingShearInteraction: automatic(
      "The bending resistance is reduced automatically when VEd exceeds 0.5 VRd.",
      { method: "NTC 2018 §4.2.4.1.2.5 / EN 1993-1-1 §6.2.8" },
    ),
    shearTorsionInteraction: requiresInput(
      ["Saint-Venant torque T", "torsional section modulus WT", "zero bimoment B"],
      "Only uniform Saint-Venant torsion is supported; warping torsion is blocked.",
      { method: "NTC 2018 §4.2.4.1.2.7 / EN 1993-1-1 §6.2.7" },
    ),
    vibration: requiresInput(
      ["modal frequencies", "modal masses", "damping", "excitation model", "response limits"],
      "The FEM contract is vibration-ready, but the acceptance check is not implemented.",
    ),
  };

  const unsupportedCount = Object.entries(checks).filter(
    ([key, item]) => ["classification", "sectionResistance", "compressionBuckling", "lateralTorsionalBuckling", "beamColumnInteraction", "serviceability"].includes(key) && item.status === "not-supported",
  ).length;

  return {
    status: unsupportedCount === 0 ? "supported" : "partially-supported",
    family,
    profileName: profileNameOf(resolvedSection, profileName),
    checks,
    compound: compoundCapability(family),
    unsupported: {
      warpingTorsionAndBimoment: notSupported(
        "No approximate capacity is returned; sectorial stresses and warping restraints require a dedicated model.",
        { requiredInputs: ["sectorial coordinates", "warping stresses", "warping restraints"], reference: "NTC 2018 §4.2.4.1.2.7 / EN 1993-1-1 §6.2.7" },
      ),
      torsionalAndFlexuralTorsionalBuckling: notSupported(
        "Open sections that are not doubly symmetric require critical torsional/flexural-torsional loads.",
        { requiredInputs: ["shear centre", "Iw", "Lcr,T", "warping restraints", "Ncr,T/Ncr,TF"], reference: "Circolare 2019 C4.2.4.1.3.1 / EN 1993-1-1 §6.3.1.4" },
      ),
      class4EffectiveProperties: notSupported(
        "Gross-section capacities are not substituted for effective class-4 properties.",
        { requiredInputs: ["Aeff", "Weff,y", "Weff,z", "neutral-axis shift"], reference: "NTC 2018 §4.2.4.1.2.2 / EN 1993-1-5 §4" },
      ),
      fatigue: notSupported("Fatigue is outside this verifier.", { requiredInputs: ["detail category", "stress ranges", "cycle spectrum"], reference: "NTC 2018 §4.2.4.1.4 / EN 1993-1-9" }),
      builtUpAndColdFormed: notSupported("Built-up members and cold-formed profiles require dedicated models.", { requiredInputs: ["connector layout", "built-up shear stiffness", "local/distortional buckling data"], reference: "EN 1993-1-1 §6.4 / EN 1993-1-3" }),
    },
    limitations: [
      "Class 4 effective section properties and stability are not implemented; no gross-property approximation is returned.",
      "Only uniform Saint-Venant torsion may be checked; warping torsion/bimoment is not supported.",
      "Torsional and flexural-torsional buckling of non-doubly-symmetric open sections is not supported.",
      "Fatigue and cold-formed/built-up member verification are not supported.",
      "Connection verification is intentionally outside this application.",
      "Compound profile verification is geometric/elastic until a dedicated built-up member verifier is added.",
    ],
  };
}
