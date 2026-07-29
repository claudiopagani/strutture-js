/**
 * Solver-neutral NTC 2018 regularity checks for buildings.
 */

import {
  NTC2018_ELEVATION_REGULARITY,
  NTC2018_PLAN_REGULARITY,
  NTC2018_REGULARITY_REDUCTION,
  selectNTC2018AllowedAnalysisMethods,
} from "./structuralBehavior.js";
import { withNormativeReferences } from "../../normativeReference.js";
import { NTC2018_RC_OUTSIDE_CORPUS_REFERENCES } from "../normativeReferences.js";

const STRUCTURAL_REGULARITY_NORMATIVE_REFERENCES = Object.freeze([
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.structuralRegularity,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.structuralRegularityGuidance,
]);

export const NTC2018_REGULARITY_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§ 7.2.1 (regolarità in pianta e in altezza) e § 7.3.1 (fattore ηR)",
  }),
  Object.freeze({
    source: "Circolare 21 gennaio 2019, n. 7 C.S.LL.PP.",
    citation: "§ C7.2.1",
  }),
]);

function regularityMetadata(metadata = {}) {
  return withNormativeReferences(metadata, [
    ...STRUCTURAL_REGULARITY_NORMATIVE_REFERENCES,
  ]);
}

function regularityCheck(check) {
  return {
    ...check,
    metadata: regularityMetadata(check.metadata),
  };
}

function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be finite and positive; got ${value}.`);
  }
  return number;
}

function ratio01(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${label} must be between 0 and 1; got ${value}.`);
  }
  return number;
}

function requiredBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be explicitly true or false.`);
  }
  return value;
}

function normalizeFloorPlans(input) {
  if (Array.isArray(input.floors) && input.floors.length > 0) {
    return input.floors;
  }
  if (input.planLengthX !== undefined || input.planLengthY !== undefined) {
    return [{
      storeyId: input.storeyId ?? "plan",
      planLengthX: input.planLengthX,
      planLengthY: input.planLengthY,
      contourConvex: input.contourConvex,
      reentrantAreaRatios: input.reentrantAreaRatios,
      reentrantInfluenceNegligible: input.reentrantInfluenceNegligible,
      diaphragmInPlaneRigidityAdequate:
        input.diaphragmInPlaneRigidityAdequate,
      diaphragmInPlaneStrengthAdequate:
        input.diaphragmInPlaneStrengthAdequate,
    }];
  }
  throw new Error("At least one floor plan is required.");
}

/**
 * Evaluate every condition a), b) and c) of NTC 2018 § 7.2.1.
 *
 * Missing qualitative assessments are rejected rather than interpreted as
 * compliance.
 */
export function evaluateNTC2018PlanRegularity(input = {}) {
  const symmetry = requiredBoolean(
    input.massAndStiffnessApproximatelySymmetric,
    "massAndStiffnessApproximatelySymmetric",
  );
  const floors = normalizeFloorPlans(input);
  // @see https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg
  const checks = [regularityCheck({
    check: "plan-mass-stiffness-symmetry",
    ok: symmetry,
    reference: "NTC 2018 § 7.2.1, lettera a)",
  })];
  const floorDetails = [];

  for (let index = 0; index < floors.length; index++) {
    const floor = floors[index];
    const storeyId = floor.storeyId ?? `floor-${index + 1}`;
    const lengthX = positive(
      floor.planLengthX,
      `floors[${index}].planLengthX`,
    );
    const lengthY = positive(
      floor.planLengthY,
      `floors[${index}].planLengthY`,
    );
    const slenderness = Math.max(lengthX, lengthY) / Math.min(lengthX, lengthY);
    const slendernessOk = slenderness < 4;
    const contourConvex = requiredBoolean(
      floor.contourConvex,
      `floors[${index}].contourConvex`,
    );

    let maximumReentrantAreaRatio = 0;
    let compactnessOk = contourConvex;
    if (!contourConvex) {
      if (
        !Array.isArray(floor.reentrantAreaRatios) ||
        floor.reentrantAreaRatios.length === 0
      ) {
        throw new Error(
          `floors[${index}].reentrantAreaRatios is required for a non-convex plan.`,
        );
      }
      maximumReentrantAreaRatio = Math.max(
        ...floor.reentrantAreaRatios.map((value, reentrantIndex) =>
          ratio01(
            value,
            `floors[${index}].reentrantAreaRatios[${reentrantIndex}]`,
          )),
      );
      compactnessOk =
        maximumReentrantAreaRatio <= 0.05 &&
        requiredBoolean(
          floor.reentrantInfluenceNegligible,
          `floors[${index}].reentrantInfluenceNegligible`,
        );
    }

    const rigidityOk = requiredBoolean(
      floor.diaphragmInPlaneRigidityAdequate,
      `floors[${index}].diaphragmInPlaneRigidityAdequate`,
    );
    const strengthOk = requiredBoolean(
      floor.diaphragmInPlaneStrengthAdequate,
      `floors[${index}].diaphragmInPlaneStrengthAdequate`,
    );
    const floorChecks = [
      {
        check: "plan-compactness",
        storeyId,
        ok: compactnessOk,
        maximumReentrantAreaRatio,
        reference: "NTC 2018 § 7.2.1, lettera a)",
      },
      {
        check: "plan-bounding-rectangle-ratio",
        storeyId,
        ok: slendernessOk,
        value: slenderness,
        limit: 4,
        comparison: "<",
        reference: "NTC 2018 § 7.2.1, lettera b)",
      },
      {
        check: "plan-diaphragm-in-plane-rigidity",
        storeyId,
        ok: rigidityOk,
        reference: "NTC 2018 § 7.2.1, lettera c)",
      },
      {
        check: "plan-diaphragm-in-plane-strength",
        storeyId,
        ok: strengthOk,
        reference: "NTC 2018 § 7.2.1, lettera c)",
      },
    ].map(regularityCheck);
    checks.push(...floorChecks);
    floorDetails.push({
      storeyId,
      slenderness,
      maximumReentrantAreaRatio,
      checks: floorChecks,
    });
  }

  const allChecksOk = checks.every((check) => check.ok === true);
  const governingFloor = floorDetails.reduce(
    (governing, floor) =>
      governing == null || floor.slenderness > governing.slenderness
        ? floor
        : governing,
    null,
  );

  return {
    regularity: allChecksOk
      ? NTC2018_PLAN_REGULARITY.REGULAR
      : NTC2018_PLAN_REGULARITY.NON_REGULAR,
    allChecksOk,
    checks,
    floors: floorDetails,
    slenderness: governingFloor?.slenderness ?? null,
    maximumReentrantAreaRatio: Math.max(
      ...floorDetails.map((floor) => floor.maximumReentrantAreaRatio),
    ),
    reentrantRatioX: null,
    reentrantRatioY: null,
    eccentricityRatioX: null,
    eccentricityRatioY: null,
    metadata: regularityMetadata({
      normativeConformityClaimed: false,
    }),
  };
}

function pairCheck({
  check,
  storeyId,
  comparedTo,
  value,
  minimum,
  maximum,
  reference,
}) {
  return regularityCheck({
    check,
    storeyId,
    comparedTo,
    ok: value >= minimum && value <= maximum,
    value,
    minimum,
    maximum,
    reference,
  });
}

function positiveStoreyValue(storey, key, index) {
  return positive(storey[key], `storeys[${index}].${key}`);
}

/**
 * Evaluate conditions d), e), f) and g) of NTC 2018 § 7.2.1.
 */
export function evaluateNTC2018ElevationRegularity({
  storeys,
  continuousVerticalSystems,
  stiffnessCriterionExempt = false,
  isFrameStructure = false,
} = {}) {
  if (!Array.isArray(storeys) || storeys.length < 2) {
    throw new Error(
      "At least two storeys ordered from base to top are required.",
    );
  }
  requiredBoolean(continuousVerticalSystems, "continuousVerticalSystems");
  requiredBoolean(stiffnessCriterionExempt, "stiffnessCriterionExempt");
  requiredBoolean(isFrameStructure, "isFrameStructure");

  const normalized = storeys.map((storey, index) => {
    const topResistanceException =
      isFrameStructure && storeys.length >= 3 &&
      index === storeys.length - 1;
    return {
      ...storey,
      storeyId: storey.storeyId ?? `storey-${index + 1}`,
      mass: positiveStoreyValue(storey, "mass", index),
      planLengthX: positiveStoreyValue(storey, "planLengthX", index),
      planLengthY: positiveStoreyValue(storey, "planLengthY", index),
      stiffnessX: stiffnessCriterionExempt
        ? null
        : positiveStoreyValue(storey, "stiffnessX", index),
      stiffnessY: stiffnessCriterionExempt
        ? null
        : positiveStoreyValue(storey, "stiffnessY", index),
      capacityDemandRatioX: topResistanceException
        ? null
        : positiveStoreyValue(storey, "capacityDemandRatioX", index),
      capacityDemandRatioY: topResistanceException
        ? null
        : positiveStoreyValue(storey, "capacityDemandRatioY", index),
    };
  });

  // @see https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg
  const checks = [regularityCheck({
    check: "elevation-continuous-horizontal-resisting-systems",
    ok: continuousVerticalSystems,
    reference: "NTC 2018 § 7.2.1, lettera d)",
  })];
  const storeyDetails = [];
  const first = normalized[0];

  for (let index = 1; index < normalized.length; index++) {
    const current = normalized[index];
    const below = normalized[index - 1];
    const pairChecks = [];

    pairChecks.push(pairCheck({
      check: "elevation-mass-variation",
      storeyId: current.storeyId,
      comparedTo: below.storeyId,
      value: current.mass / below.mass,
      minimum: 0.75,
      maximum: 1.25,
      reference: "NTC 2018 § 7.2.1, lettera e)",
    }));

    if (!stiffnessCriterionExempt) {
      for (const direction of ["X", "Y"]) {
        pairChecks.push(pairCheck({
          check: `elevation-stiffness-${direction.toLowerCase()}`,
          storeyId: current.storeyId,
          comparedTo: below.storeyId,
          value: current[`stiffness${direction}`] /
            below[`stiffness${direction}`],
          minimum: 0.70,
          maximum: 1.10,
          reference: "NTC 2018 § 7.2.1, lettera e)",
        }));
      }
    }

    const topResistanceException =
      isFrameStructure && normalized.length >= 3 &&
      index === normalized.length - 1;
    if (!topResistanceException) {
      for (const direction of ["X", "Y"]) {
        pairChecks.push(pairCheck({
          check: `elevation-capacity-demand-${direction.toLowerCase()}`,
          storeyId: current.storeyId,
          comparedTo: below.storeyId,
          value: current[`capacityDemandRatio${direction}`] /
            below[`capacityDemandRatio${direction}`],
          minimum: 0.70,
          maximum: 1.30,
          reference: "NTC 2018 § 7.2.1, lettera f)",
        }));
      }
    }

    const topSetbackException =
      normalized.length >= 4 && index === normalized.length - 1;
    if (!topSetbackException) {
      for (const direction of ["X", "Y"]) {
        const dimensionKey = `planLength${direction}`;
        const immediateSetback = current[`setback${direction}`] !== undefined
          ? Number(current[`setback${direction}`])
          : Math.max(0, below[dimensionKey] - current[dimensionKey]);
        const firstSetback = current[`setbackFromFirst${direction}`] !== undefined
          ? Number(current[`setbackFromFirst${direction}`])
          : Math.max(0, first[dimensionKey] - current[dimensionKey]);
        if (
          !Number.isFinite(immediateSetback) || immediateSetback < 0 ||
          !Number.isFinite(firstSetback) || firstSetback < 0
        ) {
          throw new Error(
            `Storey ${current.storeyId} setbacks in ${direction} must be finite and non-negative.`,
          );
        }
        pairChecks.push(regularityCheck({
          check: `elevation-setback-${direction.toLowerCase()}`,
          storeyId: current.storeyId,
          comparedTo: below.storeyId,
          ok:
            immediateSetback / below[dimensionKey] <= 0.10 &&
            firstSetback / first[dimensionKey] <= 0.30,
          immediateRatio: immediateSetback / below[dimensionKey],
          fromFirstRatio: firstSetback / first[dimensionKey],
          immediateLimit: 0.10,
          fromFirstLimit: 0.30,
          reference: "NTC 2018 § 7.2.1, lettera g)",
        }));
      }
    }

    checks.push(...pairChecks);
    storeyDetails.push({
      storeyId: current.storeyId,
      comparedTo: below.storeyId,
      checks: pairChecks,
      topResistanceException,
      topSetbackException,
    });
  }

  const allChecksOk = checks.every((check) => check.ok === true);
  return {
    regularity: allChecksOk
      ? NTC2018_ELEVATION_REGULARITY.REGULAR
      : NTC2018_ELEVATION_REGULARITY.NON_REGULAR,
    allChecksOk,
    checks,
    storeyDetails,
    stiffnessCriterionExempt,
    metadata: regularityMetadata({
      normativeConformityClaimed: false,
    }),
  };
}

export function createNTC2018RegularityAssessment({
  planInput,
  elevationInput,
  behavior,
  t1X,
  t1Y,
  tc,
  td,
}) {
  const planResult = evaluateNTC2018PlanRegularity(planInput);
  const elevationResult = evaluateNTC2018ElevationRegularity(elevationInput);
  const reductionFactorKr =
    NTC2018_REGULARITY_REDUCTION[elevationResult.regularity];

  const analysisMethodsX = selectNTC2018AllowedAnalysisMethods({
    behavior,
    planRegularity: planResult.regularity,
    elevationRegularity: elevationResult.regularity,
    t1: t1X,
    tc,
    td,
  });
  const analysisMethodsY = selectNTC2018AllowedAnalysisMethods({
    behavior,
    planRegularity: planResult.regularity,
    elevationRegularity: elevationResult.regularity,
    t1: t1Y,
    tc,
    td,
  });
  const checks = [
    ...planResult.checks.map((check) => ({ ...check, scope: "plan" })),
    ...elevationResult.checks.map((check) => ({
      ...check,
      scope: "elevation",
    })),
  ];

  return {
    planRegularity: planResult.regularity,
    elevationRegularity: elevationResult.regularity,
    reductionFactorKr,
    analysisMethodsX,
    analysisMethodsY,
    planDetails: {
      slenderness: planResult.slenderness,
      maximumReentrantAreaRatio: planResult.maximumReentrantAreaRatio,
      floors: planResult.floors,
    },
    elevationDetails: elevationResult.storeyDetails,
    allChecksOk: checks.every((check) => check.ok === true),
    checks,
    references: NTC2018_REGULARITY_REFERENCES,
    metadata: regularityMetadata({
      normativeConformityClaimed: false,
    }),
  };
}
