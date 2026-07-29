/**
 * NTC 2018 structural behaviour and behaviour-factor rules for RC buildings.
 *
 * The module contains no solver assumptions. Structural classification and
 * topology data must be supplied by the consumer or by a solver-neutral
 * post-processor.
 */

import { withNormativeReferences } from "../../normativeReference.js";
import {
  NTC2018_RC_CHAPTER_7_4_REFERENCES,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../normativeReferences.js";

export const NTC2018_STRUCTURAL_BEHAVIOR = Object.freeze({
  NON_DISSIPATIVE: "non-dissipative",
  CD_A: "cd-a",
  CD_B: "cd-b",
});

export const NTC2018_STRUCTURAL_TYPE = Object.freeze({
  FRAME: "frame",
  WALL: "wall",
  COUPLED_WALL: "coupled-wall",
  DUAL: "dual",
  CORE: "core",
  TORSIONALLY_FLEXIBLE: "torsionally-flexible",
  INVERTED_PENDULUM: "inverted-pendulum",
  SINGLE_STOREY_FRAMED_INVERTED_PENDULUM:
    "single-storey-framed-inverted-pendulum",
});

export const NTC2018_PLAN_REGULARITY = Object.freeze({
  REGULAR: "regular",
  NON_REGULAR: "non-regular",
});

export const NTC2018_ELEVATION_REGULARITY = Object.freeze({
  REGULAR: "regular",
  NON_REGULAR: "non-regular",
});

export const NTC2018_ANALYSIS_METHOD = Object.freeze({
  LINEAR_STATIC: "linear-static",
  LINEAR_DYNAMIC: "linear-dynamic",
  NONLINEAR_STATIC: "nonlinear-static",
  NONLINEAR_DYNAMIC: "nonlinear-dynamic",
});

export const NTC2018_STRUCTURAL_BEHAVIOR_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§§ 7.2.2, 7.3.1, 7.3.2, 7.3.3.2, 7.4.1, 7.4.3.1 e 7.4.3.2; Tab. 7.3.II",
  }),
  Object.freeze({
    source: "Circolare 21 gennaio 2019, n. 7 C.S.LL.PP.",
    citation: "§§ C7.2.2, C7.3.1, C7.3.2 e C7.4.3",
  }),
]);

export const NTC2018_OVERSTRENGTH_FACTORS = Object.freeze({
  "cd-a": Object.freeze({
    beamShear: 1.20,
    columnBending: 1.30,
    columnShear: 1.30,
    jointShear: 1.20,
    wallShear: 1.20,
  }),
  "cd-b": Object.freeze({
    beamShear: 1.10,
    columnBending: 1.30,
    columnShear: 1.10,
    jointShear: 1.10,
    wallShear: null,
  }),
});

// @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.3
const Q0_CDA = Object.freeze({
  frame: 4.5,
  wall: 4.0,
  "coupled-wall": 4.5,
  dual: 4.5,
  core: 4.0,
  "torsionally-flexible": 3.0,
  "inverted-pendulum": 2.0,
  "single-storey-framed-inverted-pendulum": 3.5,
});

const Q0_CDB = Object.freeze({
  frame: 3.0,
  wall: 3.0,
  "coupled-wall": 3.0,
  dual: 3.0,
  core: 3.0,
  "torsionally-flexible": 2.0,
  "inverted-pendulum": 1.5,
  "single-storey-framed-inverted-pendulum": 2.5,
});

export const NTC2018_BASE_Q_FACTORS = Object.freeze({
  "cd-a": Q0_CDA,
  "cd-b": Q0_CDB,
});

export const NTC2018_Q_LIMITS = Object.freeze({
  SLO: Object.freeze({ max: 1.0 }),
  SLD: Object.freeze({ max: 1.5 }),
  SLV: Object.freeze({
    dissipativeMin: 1.5,
    nonDissipativeMin: 1.0,
    nonDissipativeMax: 1.5,
  }),
});

export const NTC2018_REGULARITY_REDUCTION = Object.freeze({
  regular: 1.0,
  "non-regular": 0.8,
});

const VALID_BEHAVIORS = new Set(Object.values(NTC2018_STRUCTURAL_BEHAVIOR));
const VALID_TYPES = new Set(Object.values(NTC2018_STRUCTURAL_TYPE));
const VALID_PLAN_REGULARITY = new Set(Object.values(NTC2018_PLAN_REGULARITY));
const VALID_ELEVATION_REGULARITY = new Set(
  Object.values(NTC2018_ELEVATION_REGULARITY),
);

function validateEnum(value, allowed, label) {
  const raw = String(value ?? "").trim();
  const key = raw
    .replaceAll("\u201C", "")
    .replaceAll("\u201D", "")
    .replaceAll("\u2018", "")
    .replaceAll("\u2019", "")
    .replaceAll('"', "")
    .replaceAll("'", "")
    .replaceAll("-", "")
    .replaceAll(/\s/g, "")
    .toLowerCase();

  for (const candidate of allowed) {
    if (candidate.replaceAll("-", "").toLowerCase() === key) {
      return candidate;
    }
  }

  throw new Error(
    `${label} must be one of [${[...allowed].join(", ")}]; got "${raw}".`,
  );
}

function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a positive number; got ${value}.`);
  }
  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer; got ${value}.`);
  }
  return number;
}

export function normalizeNTC2018StructuralBehavior(value) {
  return validateEnum(value, VALID_BEHAVIORS, "structuralBehavior");
}

export function normalizeNTC2018StructuralType(value) {
  return validateEnum(value, VALID_TYPES, "structuralType");
}

/**
 * Non-dissipative design is a general NTC 2018 design choice (§ 7.2.2).
 *
 * The `ag*S <= 0.075g` condition belongs to the simplified design regime in
 * § 7.0 and is reported separately. It is not an admissibility condition for
 * non-dissipative behaviour.
 */
export function checkNonDissipativeAdmissibility({
  ag,
  amplificationFactor,
  soilAmplification = 1,
  topographicAmplification = 1,
} = {}) {
  let agSOverG = null;
  let simplifiedRegimeEligible = null;
  const warnings = [];

  if (ag !== undefined) {
    const acceleration = Number(ag);
    if (!Number.isFinite(acceleration) || acceleration < 0) {
      throw new Error(`ag must be a non-negative number in units of g; got ${ag}.`);
    }
    const amplification = amplificationFactor !== undefined
      ? positive(amplificationFactor, "amplificationFactor")
      : positive(soilAmplification, "soilAmplification") *
        positive(topographicAmplification, "topographicAmplification");
    agSOverG = acceleration * amplification;
    simplifiedRegimeEligible = agSOverG <= 0.075 + Number.EPSILON * 10;
  } else {
    warnings.push(
      "ag was not supplied; eligibility for the simplified § 7.0 regime was not assessed.",
    );
  }

  return {
    admissible: true,
    simplifiedRegimeEligible,
    agSOverG,
    warnings,
    reference: "NTC 2018 §§ 7.0 e 7.2.2",
    metadata: withNormativeReferences({}, [
      NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralBehavior,
      NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.globalSeismicAnalysis,
    ]),
  };
}

export function selectNTC2018OverstrengthFactors({ behavior }) {
  const normalized = normalizeNTC2018StructuralBehavior(behavior);
  if (normalized === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    return Object.freeze({
      beamShear: 1,
      columnBending: 1,
      columnShear: 1,
      jointShear: 1,
      wallShear: 1,
    });
  }
  return NTC2018_OVERSTRENGTH_FACTORS[normalized];
}

/**
 * Resolve αu/α1 from the explicit topology rules in NTC 2018 § 7.4.3.2.
 */
export function resolveNTC2018AlphaRatio({
  structuralType,
  alphaRatio,
  frameStoreyCount,
  frameBayCount,
  uncoupledWallCount,
} = {}) {
  const type = normalizeNTC2018StructuralType(structuralType);

  if (alphaRatio !== undefined) {
    return positive(alphaRatio, "alphaRatio");
  }

  if (type === NTC2018_STRUCTURAL_TYPE.FRAME) {
    // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.3
    const storeys = positiveInteger(frameStoreyCount, "frameStoreyCount");
    const bays = positiveInteger(frameBayCount, "frameBayCount");
    if (storeys === 1) return 1.1;
    return bays === 1 ? 1.2 : 1.3;
  }

  if (type === NTC2018_STRUCTURAL_TYPE.WALL ||
      type === NTC2018_STRUCTURAL_TYPE.CORE) {
    const walls = positiveInteger(uncoupledWallCount, "uncoupledWallCount");
    return walls === 2 ? 1.0 : 1.1;
  }

  if (type === NTC2018_STRUCTURAL_TYPE.COUPLED_WALL) {
    return 1.2;
  }

  if (type === NTC2018_STRUCTURAL_TYPE.DUAL) {
    throw new Error(
      "alphaRatio is required for a generic dual system; classify its topology or provide a justified value.",
    );
  }

  return 1.0;
}

function appliesAlphaRatio(behavior, structuralType) {
  if (
    structuralType === NTC2018_STRUCTURAL_TYPE.FRAME ||
    structuralType === NTC2018_STRUCTURAL_TYPE.COUPLED_WALL ||
    structuralType === NTC2018_STRUCTURAL_TYPE.DUAL
  ) {
    return true;
  }
  return behavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A &&
    (structuralType === NTC2018_STRUCTURAL_TYPE.WALL ||
      structuralType === NTC2018_STRUCTURAL_TYPE.CORE);
}

export function selectNTC2018BaseQFactor({
  behavior,
  structuralType,
  alphaRatio,
  frameStoreyCount,
  frameBayCount,
  uncoupledWallCount,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  const type = normalizeNTC2018StructuralType(structuralType);

  if (normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    const cdBMinimum = NTC2018_BASE_Q_FACTORS["cd-b"][type];
    return Math.min(1.5, Math.max(1, (2 / 3) * cdBMinimum));
  }

  const tableValue = NTC2018_BASE_Q_FACTORS[normalizedBehavior][type];
  if (!appliesAlphaRatio(normalizedBehavior, type)) {
    return tableValue;
  }

  const resolvedAlphaRatio = resolveNTC2018AlphaRatio({
    structuralType: type,
    alphaRatio,
    frameStoreyCount,
    frameBayCount,
    uncoupledWallCount,
  });
  return tableValue * resolvedAlphaRatio;
}

export function computeNTC2018EffectiveQFactor({
  behavior,
  structuralType,
  elevationRegularity,
  alphaRatio,
  frameStoreyCount,
  frameBayCount,
  uncoupledWallCount,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  const q0 = selectNTC2018BaseQFactor({
    behavior: normalizedBehavior,
    structuralType,
    alphaRatio,
    frameStoreyCount,
    frameBayCount,
    uncoupledWallCount,
  });

  if (normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    return q0;
  }

  const regularity = validateEnum(
    elevationRegularity,
    VALID_ELEVATION_REGULARITY,
    "elevationRegularity",
  );
  return q0 * NTC2018_REGULARITY_REDUCTION[regularity];
}

/**
 * Determine method availability without coupling it to dissipative behaviour.
 *
 * Modal response-spectrum analysis is the reference linear method. Linear
 * static analysis is admitted only when T1 <= min(2.5*TC, TD) and the
 * construction is regular in elevation (§ 7.3.3.2). Nonlinear methods are
 * available for dissipative and non-dissipative systems (§§ 7.3.1 and 7.3.4).
 */
export function selectNTC2018AllowedAnalysisMethods({
  behavior,
  planRegularity,
  elevationRegularity,
  t1,
  tc,
  td,
} = {}) {
  normalizeNTC2018StructuralBehavior(behavior);
  if (planRegularity !== undefined) {
    validateEnum(planRegularity, VALID_PLAN_REGULARITY, "planRegularity");
  }
  const elevation = validateEnum(
    elevationRegularity,
    VALID_ELEVATION_REGULARITY,
    "elevationRegularity",
  );

  const allowed = new Set([
    NTC2018_ANALYSIS_METHOD.LINEAR_DYNAMIC,
    NTC2018_ANALYSIS_METHOD.NONLINEAR_STATIC,
    NTC2018_ANALYSIS_METHOD.NONLINEAR_DYNAMIC,
  ]);
  const checks = [];

  let periodLimit = null;
  let periodCheck = false;
  if (t1 !== undefined && tc !== undefined && td !== undefined) {
    const fundamentalPeriod = positive(t1, "t1");
    const cornerPeriod = positive(tc, "tc");
    const displacementPeriod = positive(td, "td");
    periodLimit = Math.min(2.5 * cornerPeriod, displacementPeriod);
    periodCheck = fundamentalPeriod <= periodLimit;
  }

  const elevationCheck =
    elevation === NTC2018_ELEVATION_REGULARITY.REGULAR;
  const linearStaticAllowed = elevationCheck && periodCheck;
  if (linearStaticAllowed) {
    allowed.add(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC);
  }

  checks.push({
    check: "linear-static-elevation-regularity",
    ok: elevationCheck,
    reference: "NTC 2018 § 7.3.3.2",
  });
  checks.push({
    check: "linear-static-period",
    ok: periodCheck,
    evaluated: periodLimit != null,
    t1: t1 ?? null,
    limit: periodLimit,
    reference: "NTC 2018 § 7.3.3.2",
  });

  return {
    allowed: [...allowed],
    recommended: NTC2018_ANALYSIS_METHOD.LINEAR_DYNAMIC,
    linearStaticAllowed,
    checks,
    metadata: withNormativeReferences(
      {},
      [NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.globalSeismicAnalysis],
    ),
  };
}

export function createNTC2018StructuralBehavior({
  behavior,
  structuralType,
  regularity = {},
  alphaRatio,
  frameStoreyCount,
  frameBayCount,
  uncoupledWallCount,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  const type = normalizeNTC2018StructuralType(structuralType);
  const q0 = selectNTC2018BaseQFactor({
    behavior: normalizedBehavior,
    structuralType: type,
    alphaRatio,
    frameStoreyCount,
    frameBayCount,
    uncoupledWallCount,
  });

  let kr = 1;
  if (normalizedBehavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    const elevation = validateEnum(
      regularity.elevation,
      VALID_ELEVATION_REGULARITY,
      "regularity.elevation",
    );
    kr = NTC2018_REGULARITY_REDUCTION[elevation];
  }

  return {
    behavior: normalizedBehavior,
    structuralType: type,
    isDissipative:
      normalizedBehavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
    ductilityClass:
      normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE
        ? null
        : normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A
          ? 'CD"A"'
          : 'CD"B"',
    overstrengthFactors: {
      ...selectNTC2018OverstrengthFactors({ behavior: normalizedBehavior }),
    },
    q0,
    q: normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE
      ? q0
      : q0 * kr,
    kr,
    references: NTC2018_STRUCTURAL_BEHAVIOR_REFERENCES,
    metadata: withNormativeReferences({}, [
      NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralBehavior,
      NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralTypesAndQ,
      NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.globalSeismicAnalysis,
    ]),
  };
}
