import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { createNTC2018SeismicAction } from "./createNTC2018Action.js";

const GRAVITY_METERS_PER_SECOND_SQUARED = 9.81;
const MAXIMUM_HORIZONTAL_SPECTRUM_PERIOD = 4;
const AG_UNIT = "g";
const PERIOD_UNIT = "s";

export const NTC2018_SEISMIC_REFERENCES = Object.freeze({
  hazardParameters:
    "D.M. 17/01/2018, NTC 2018, section 3.2; D.M. 14/01/2008, Annexes A and B",
  limitStates: "D.M. 17/01/2018, NTC 2018, section 3.2.1, Table 3.2.I",
  horizontalSpectrum:
    "D.M. 17/01/2018, NTC 2018, section 3.2.3.2.1, equations [3.2.2]-[3.2.7]",
  subsoilAmplification:
    "D.M. 17/01/2018, NTC 2018, section 3.2.3.2.1, Table 3.2.IV",
  topographicAmplification:
    "D.M. 17/01/2018, NTC 2018, section 3.2.3.2.1, Table 3.2.V",
});

function freezeDefinitions(definitions) {
  return Object.freeze(Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [
      id,
      Object.freeze({ id, ...definition }),
    ]),
  ));
}

export const NTC2018_SEISMIC_LIMIT_STATES = freezeDefinitions({
  SLO: {
    description: "Operational limit state",
    nominalExceedanceProbabilityInReferencePeriod: 0.81,
  },
  SLD: {
    description: "Damage limitation state",
    nominalExceedanceProbabilityInReferencePeriod: 0.63,
  },
  SLV: {
    description: "Life-safety limit state",
    nominalExceedanceProbabilityInReferencePeriod: 0.10,
  },
  SLC: {
    description: "Collapse-prevention limit state",
    nominalExceedanceProbabilityInReferencePeriod: 0.05,
  },
});

export const NTC2018_SITE_HAZARD_SOURCE_KINDS = Object.freeze([
  "manual-entry",
  "external-service",
  "documented-study",
]);

export const NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS = freezeDefinitions({
  A: {
    ssKind: "fixed",
    ssValue: 1,
    ccMultiplier: 1,
    ccExponent: 0,
  },
  B: {
    ssKind: "bounded-linear",
    ssMinimum: 1,
    ssMaximum: 1.2,
    ssIntercept: 1.4,
    ssScale: 0.4,
    ccMultiplier: 1.1,
    ccExponent: -0.2,
  },
  C: {
    ssKind: "bounded-linear",
    ssMinimum: 1,
    ssMaximum: 1.5,
    ssIntercept: 1.7,
    ssScale: 0.6,
    ccMultiplier: 1.05,
    ccExponent: -0.33,
  },
  D: {
    ssKind: "bounded-linear",
    ssMinimum: 0.9,
    ssMaximum: 1.8,
    ssIntercept: 2.4,
    ssScale: 1.5,
    ccMultiplier: 1.25,
    ccExponent: -0.5,
  },
  E: {
    ssKind: "bounded-linear",
    ssMinimum: 1,
    ssMaximum: 1.6,
    ssIntercept: 2,
    ssScale: 1.1,
    ccMultiplier: 1.15,
    ccExponent: -0.4,
  },
});

export const NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA = freezeDefinitions({
  T1: {
    description: "Flat surface, isolated slopes and reliefs with mean inclination <= 15 degrees",
    referenceLocation: "not-applicable",
    maximumCoefficient: 1,
  },
  T2: {
    description: "Slope with mean inclination greater than 15 degrees",
    referenceLocation: "slope-summit",
    maximumCoefficient: 1.2,
  },
  T3: {
    description: "Relief with narrow crest and mean inclination between 15 and 30 degrees",
    referenceLocation: "relief-crest",
    maximumCoefficient: 1.2,
  },
  T4: {
    description: "Relief with narrow crest and mean inclination greater than 30 degrees",
    referenceLocation: "relief-crest",
    maximumCoefficient: 1.4,
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }

  return value;
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }

  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalNonEmptyString(value, label) {
  return value == null ? null : nonEmptyString(value, label);
}

function limitStateDefinition(limitState) {
  const definition = NTC2018_SEISMIC_LIMIT_STATES[limitState];
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 seismic limit state: ${limitState}.`);
  }

  return definition;
}

function subsoilDefinition(subsoilCategory) {
  const definition = NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS[subsoilCategory];
  if (!definition) {
    throw new Error(
      `Unsupported NTC 2018 simplified-spectrum subsoil category: ${subsoilCategory}.`,
    );
  }

  return definition;
}

function topographicDefinition(topographicCategory) {
  const definition = NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA[
    topographicCategory
  ];
  if (!definition) {
    throw new Error(`Unsupported NTC 2018 topographic category: ${topographicCategory}.`);
  }

  return definition;
}

function normalizeSource(source) {
  if (source == null || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("hazardParameters.source must be an object.");
  }
  if (!NTC2018_SITE_HAZARD_SOURCE_KINDS.includes(source.kind)) {
    throw new Error(
      `hazardParameters.source.kind must be one of: ${NTC2018_SITE_HAZARD_SOURCE_KINDS.join(", ")}.`,
    );
  }

  return {
    kind: source.kind,
    reference: nonEmptyString(
      source.reference,
      "hazardParameters.source.reference",
    ),
    datasetVersion: optionalNonEmptyString(
      source.datasetVersion,
      "hazardParameters.source.datasetVersion",
    ),
    resultId: optionalNonEmptyString(
      source.resultId,
      "hazardParameters.source.resultId",
    ),
  };
}

export function getNTC2018SeismicLimitStateDefinition(limitState) {
  return clone(limitStateDefinition(limitState));
}

export function getNTC2018SubsoilSpectrumCoefficientDefinition(
  subsoilCategory,
) {
  return clone(subsoilDefinition(subsoilCategory));
}

export function getNTC2018TopographicAmplificationDefinition(
  topographicCategory,
) {
  return clone(topographicDefinition(topographicCategory));
}

export function normalizeNTC2018SiteHazardParameters({
  siteReference,
  limitState,
  returnPeriodYears,
  ag,
  agUnit = null,
  f0,
  tcStar,
  tcStarUnit = null,
  source,
} = {}) {
  const definition = limitStateDefinition(limitState);
  if (agUnit !== AG_UNIT) {
    throw new Error(`hazardParameters.agUnit must be '${AG_UNIT}'.`);
  }
  if (tcStarUnit !== PERIOD_UNIT) {
    throw new Error(`hazardParameters.tcStarUnit must be '${PERIOD_UNIT}'.`);
  }

  const normalizedAg = finitePositive(ag, "hazardParameters.ag");
  const normalizedF0 = finitePositive(f0, "hazardParameters.f0");
  if (normalizedF0 < 2.2) {
    throw new Error("hazardParameters.f0 must not be lower than the NTC 2018 minimum of 2.2.");
  }

  return {
    schemaVersion: "ntc2018-site-hazard-parameters/v1",
    siteReference: nonEmptyString(
      siteReference,
      "hazardParameters.siteReference",
    ),
    limitState,
    limitStateDescription: definition.description,
    nominalExceedanceProbabilityInReferencePeriod:
      definition.nominalExceedanceProbabilityInReferencePeriod,
    returnPeriodYears: finitePositive(
      returnPeriodYears,
      "hazardParameters.returnPeriodYears",
    ),
    ag: normalizedAg,
    agUnit: AG_UNIT,
    agOverG: normalizedAg,
    agMetersPerSecondSquared:
      normalizedAg * GRAVITY_METERS_PER_SECOND_SQUARED,
    f0: normalizedF0,
    tcStar: finitePositive(tcStar, "hazardParameters.tcStar"),
    tcStarUnit: PERIOD_UNIT,
    source: normalizeSource(source),
    reference: NTC2018_SEISMIC_REFERENCES.hazardParameters,
  };
}

export function calculateNTC2018StratigraphicSpectrumCoefficients({
  subsoilCategory,
  agOverG,
  f0,
  tcStar,
} = {}) {
  const definition = subsoilDefinition(subsoilCategory);
  const accelerationRatio = finitePositive(agOverG, "agOverG");
  const maximumAmplification = finitePositive(f0, "f0");
  if (maximumAmplification < 2.2) {
    throw new Error("f0 must not be lower than the NTC 2018 minimum of 2.2.");
  }
  const referencePeriod = finitePositive(tcStar, "tcStar");

  if (definition.ssKind === "fixed") {
    return {
      subsoilCategory,
      ss: definition.ssValue,
      ssUnbounded: definition.ssValue,
      ssLimitApplied: "fixed",
      cc: 1,
      formulas: {
        ss: "SS = 1",
        cc: "CC = 1",
      },
      reference: NTC2018_SEISMIC_REFERENCES.subsoilAmplification,
    };
  }

  const ssUnbounded = definition.ssIntercept
    - definition.ssScale * maximumAmplification * accelerationRatio;
  const ss = Math.min(
    Math.max(ssUnbounded, definition.ssMinimum),
    definition.ssMaximum,
  );
  const ssLimitApplied = ss === definition.ssMinimum
    ? "minimum"
    : ss === definition.ssMaximum
      ? "maximum"
      : "none";
  const cc = definition.ccMultiplier * referencePeriod ** definition.ccExponent;

  return {
    subsoilCategory,
    ss,
    ssUnbounded,
    ssLimitApplied,
    cc,
    formulas: {
      ss: "SS = clamp(ssIntercept - ssScale * F0 * ag/g, ssMinimum, ssMaximum)",
      cc: "CC = ccMultiplier * TCstar^ccExponent",
    },
    operands: {
      agOverG: accelerationRatio,
      f0: maximumAmplification,
      tcStar: referencePeriod,
      ssMinimum: definition.ssMinimum,
      ssMaximum: definition.ssMaximum,
      ssIntercept: definition.ssIntercept,
      ssScale: definition.ssScale,
      ccMultiplier: definition.ccMultiplier,
      ccExponent: definition.ccExponent,
    },
    reference: NTC2018_SEISMIC_REFERENCES.subsoilAmplification,
  };
}

export function resolveNTC2018TopographicAmplification({
  topographicCategory,
  atReferenceLocation = null,
  coefficient = null,
  coefficientSource = null,
} = {}) {
  const definition = topographicDefinition(topographicCategory);
  const hasExplicitCoefficient = coefficient != null;

  if (topographicCategory === "T1") {
    if (
      atReferenceLocation != null
      || hasExplicitCoefficient
      || coefficientSource != null
    ) {
      throw new Error(
        "atReferenceLocation, coefficient and coefficientSource must be omitted for topographic category T1.",
      );
    }

    return {
      topographicCategory,
      value: 1,
      selection: "ntc2018-tabulated",
      location: definition.referenceLocation,
      sourceReference: null,
      reference: NTC2018_SEISMIC_REFERENCES.topographicAmplification,
    };
  }

  if ((atReferenceLocation === true) === hasExplicitCoefficient) {
    throw new Error(
      "For topographic categories T2-T4 provide exactly one of atReferenceLocation=true or an explicit coefficient.",
    );
  }
  if (atReferenceLocation != null && atReferenceLocation !== true) {
    throw new Error("atReferenceLocation must be true when provided.");
  }

  if (atReferenceLocation === true) {
    if (coefficientSource != null) {
      throw new Error(
        "coefficientSource must be omitted when the tabulated maximum coefficient is used.",
      );
    }

    return {
      topographicCategory,
      value: definition.maximumCoefficient,
      selection: "ntc2018-tabulated-maximum-at-reference-location",
      location: definition.referenceLocation,
      sourceReference: null,
      reference: NTC2018_SEISMIC_REFERENCES.topographicAmplification,
    };
  }

  const explicitCoefficient = finitePositive(coefficient, "coefficient");
  if (explicitCoefficient < 1 || explicitCoefficient > definition.maximumCoefficient) {
    throw new Error(
      `coefficient for ${topographicCategory} must be between 1 and ${definition.maximumCoefficient}.`,
    );
  }

  return {
    topographicCategory,
    value: explicitCoefficient,
    selection: "documented-explicit-within-tabulated-range",
    location: "between-base-and-reference-location",
    sourceReference: nonEmptyString(coefficientSource, "coefficientSource"),
    reference: NTC2018_SEISMIC_REFERENCES.topographicAmplification,
  };
}

export function calculateNTC2018HorizontalSpectrumParameters({
  agOverG,
  f0,
  tcStar,
  subsoilCategory,
  topographicCategory,
  topographicAtReferenceLocation = null,
  topographicCoefficient = null,
  topographicCoefficientSource = null,
  viscousDampingPercent = 5,
} = {}) {
  const accelerationRatio = finitePositive(agOverG, "agOverG");
  const maximumAmplification = finitePositive(f0, "f0");
  const referencePeriod = finitePositive(tcStar, "tcStar");
  const damping = finiteNonNegative(
    viscousDampingPercent,
    "viscousDampingPercent",
  );
  const stratigraphic = calculateNTC2018StratigraphicSpectrumCoefficients({
    subsoilCategory,
    agOverG: accelerationRatio,
    f0: maximumAmplification,
    tcStar: referencePeriod,
  });
  const topographic = resolveNTC2018TopographicAmplification({
    topographicCategory,
    atReferenceLocation: topographicAtReferenceLocation,
    coefficient: topographicCoefficient,
    coefficientSource: topographicCoefficientSource,
  });
  const dampingUnbounded = Math.sqrt(10 / (5 + damping));
  const eta = Math.max(dampingUnbounded, 0.55);
  const tc = stratigraphic.cc * referencePeriod;
  const tb = tc / 3;
  const td = 4 * accelerationRatio + 1.6;

  return {
    agOverG: accelerationRatio,
    f0: maximumAmplification,
    tcStar: referencePeriod,
    ss: stratigraphic.ss,
    st: topographic.value,
    s: stratigraphic.ss * topographic.value,
    cc: stratigraphic.cc,
    eta,
    dampingUnbounded,
    viscousDampingPercent: damping,
    tb,
    tc,
    td,
    periodUnit: PERIOD_UNIT,
    formulas: {
      s: "S = SS * ST",
      eta: "eta = max(sqrt(10 / (5 + xi)), 0.55)",
      tc: "TC = CC * TCstar",
      tb: "TB = TC / 3",
      td: "TD = 4 * ag/g + 1.6",
    },
    stratigraphic,
    topographic,
    reference: NTC2018_SEISMIC_REFERENCES.horizontalSpectrum,
  };
}

function normalizePeriods(periods) {
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new Error("periods must be a non-empty array.");
  }

  return periods.map((period, index) => finiteNonNegative(
    period,
    `periods[${index}]`,
  ));
}

function calculateHorizontalElasticSpectrumPoint(period, parameters) {
  const { agOverG, f0, s, eta, tb, tc, td } = parameters;
  let value;
  let branch;

  if (period < tb) {
    value = agOverG * s * eta * f0 * (
      period / tb
      + (1 / (eta * f0)) * (1 - period / tb)
    );
    branch = "rising-acceleration";
  } else if (period < tc) {
    value = agOverG * s * eta * f0;
    branch = "constant-acceleration";
  } else if (period < td) {
    value = agOverG * s * eta * f0 * (tc / period);
    branch = "constant-velocity";
  } else {
    value = agOverG * s * eta * f0 * (tc * td / period ** 2);
    branch = "constant-displacement";
  }

  return {
    period,
    periodUnit: PERIOD_UNIT,
    value,
    accelerationUnit: AG_UNIT,
    metersPerSecondSquared: value * GRAVITY_METERS_PER_SECOND_SQUARED,
    branch,
  };
}

export function calculateNTC2018HorizontalElasticSpectrum({
  actionId = "NTC2018-SEISMIC-HORIZONTAL",
  hazardParameters,
  subsoilCategory,
  topographicCategory,
  topographicAtReferenceLocation = null,
  topographicCoefficient = null,
  topographicCoefficientSource = null,
  viscousDampingPercent = 5,
  periods,
} = {}) {
  const normalizedActionId = nonEmptyString(actionId, "actionId");
  const hazard = normalizeNTC2018SiteHazardParameters(hazardParameters);
  const normalizedPeriods = normalizePeriods(periods);
  const spectrumParameters = calculateNTC2018HorizontalSpectrumParameters({
    agOverG: hazard.agOverG,
    f0: hazard.f0,
    tcStar: hazard.tcStar,
    subsoilCategory,
    topographicCategory,
    topographicAtReferenceLocation,
    topographicCoefficient,
    topographicCoefficientSource,
    viscousDampingPercent,
  });
  const unsupportedPeriods = normalizedPeriods.filter(
    (period) => period > MAXIMUM_HORIZONTAL_SPECTRUM_PERIOD,
  );
  const commonOutputs = {
    schemaVersion: "ntc2018-horizontal-elastic-spectrum/v1",
    hazardParameters: hazard,
    spectrumParameters,
  };
  const metadata = {
    method: "ntc2018-horizontal-elastic-acceleration-spectrum",
    normativePreset: "NTC2018",
    references: { ...NTC2018_SEISMIC_REFERENCES },
    accelerationUnit: AG_UNIT,
    periodUnit: PERIOD_UNIT,
  };

  if (unsupportedPeriods.length > 0) {
    return new CalculationResult({
      applicationId: "ntc2018-horizontal-elastic-spectrum",
      status: "not-supported",
      summary: "The requested periods exceed the NTC 2018 applicability limit for this spectrum.",
      outputs: {
        ...commonOutputs,
        maximumSupportedPeriod: MAXIMUM_HORIZONTAL_SPECTRUM_PERIOD,
        unsupportedPeriods,
      },
      warnings: [
        "For fundamental periods above 4.0 s, NTC 2018 requires dedicated analyses or ground-motion time histories.",
      ],
      assumptions: [
        "The caller supplied the site hazard parameters; no geographic lookup or interpolation was performed.",
      ],
      metadata,
    });
  }

  const points = normalizedPeriods.map(
    (period) => calculateHorizontalElasticSpectrumPoint(
      period,
      spectrumParameters,
    ),
  );
  const action = createNTC2018SeismicAction({
    id: normalizedActionId,
    name: `NTC 2018 horizontal seismic action - ${hazard.limitState}`,
    metadata: {
      component: "horizontal",
      limitState: hazard.limitState,
      returnPeriodYears: hazard.returnPeriodYears,
      siteReference: hazard.siteReference,
      hazardSource: { ...hazard.source },
      spectrumSchemaVersion: "ntc2018-horizontal-elastic-spectrum/v1",
      reference: NTC2018_SEISMIC_REFERENCES.horizontalSpectrum,
    },
  });

  return new CalculationResult({
    applicationId: "ntc2018-horizontal-elastic-spectrum",
    status: "ok",
    summary: "Calculated the NTC 2018 horizontal elastic acceleration spectrum.",
    outputs: {
      ...commonOutputs,
      spectrum: {
        component: "horizontal",
        quantity: "elastic-spectral-acceleration",
        accelerationUnit: AG_UNIT,
        periodUnit: PERIOD_UNIT,
        maximumSupportedPeriod: MAXIMUM_HORIZONTAL_SPECTRUM_PERIOD,
        points,
      },
      action: action.toJSON(),
    },
    warnings: [
      "The workflow does not determine ag, F0 or TCstar from coordinates and does not interpolate the national hazard grid.",
      "Only the horizontal elastic acceleration spectrum is generated; vertical, displacement, design and time-history representations are excluded.",
    ],
    assumptions: [
      "The supplied subsoil category is applicable to the simplified NTC 2018 approach.",
      `The equivalent viscous damping ratio is ${spectrumParameters.viscousDampingPercent} percent.`,
      spectrumParameters.topographic.selection.startsWith("ntc2018-tabulated")
        ? "The NTC 2018 tabulated topographic coefficient applies to the declared location."
        : "The documented topographic coefficient was supplied by the caller.",
    ],
    metadata,
  });
}
