/**
 * NTC 2018 capacity-design demand transformations for cast-in-place RC.
 */

import {
  NTC2018_STRUCTURAL_BEHAVIOR,
  normalizeNTC2018StructuralBehavior,
  selectNTC2018OverstrengthFactors,
} from "./structuralBehavior.js";
import { withNormativeReferences } from "../../normativeReference.js";
import { NTC2018_RC_CHAPTER_7_4_REFERENCES } from "../normativeReferences.js";

export const NTC2018_CAPACITY_DESIGN_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§§ 7.4.4.1.1, 7.4.4.2.1 e 7.4.4.3.1; Eqs. [7.4.4]-[7.4.7]",
  }),
  Object.freeze({
    source: "Circolare 21 gennaio 2019, n. 7 C.S.LL.PP.",
    citation: "§ C7.4.4",
  }),
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite; got ${value}.`);
  }
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) {
    throw new Error(`${label} must be positive; got ${value}.`);
  }
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) {
    throw new Error(`${label} must be non-negative; got ${value}.`);
  }
  return number;
}

function finiteArray(values, label, { minimumLength = 1, maximumLength } = {}) {
  if (
    !Array.isArray(values) ||
    values.length < minimumLength ||
    (maximumLength !== undefined && values.length > maximumLength)
  ) {
    const maximumText = maximumLength === undefined ? "" : ` and at most ${maximumLength}`;
    throw new Error(
      `${label} must contain at least ${minimumLength}${maximumText} values.`,
    );
  }
  return values.map((value, index) => finite(value, `${label}[${index}]`));
}

/**
 * Verify Eq. [7.4.4] for one direction and one sense of the seismic action.
 *
 * Signed column resistances are required so the discordant-column rule can
 * be applied. Beam values are the concordant capacities for that same
 * direction and sense.
 */
export function verifyBeamColumnHierarchy({
  beamMomentResistances,
  columnMomentResistances,
  behavior,
  isTopStoreyColumnJoint = false,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  if (typeof isTopStoreyColumnJoint !== "boolean") {
    throw new Error("isTopStoreyColumnJoint must be boolean.");
  }
  if (
    normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE ||
    isTopStoreyColumnJoint
  ) {
    return {
      applicable: false,
      ok: true,
      demand: null,
      capacity: null,
      utilizationRatio: null,
      gammaRd: null,
      discordantColumns: false,
      check: "capacity-design-beam-column-hierarchy",
      reference: "NTC 2018 § 7.4.4.2.1, Eq. [7.4.4]",
      metadata: withNormativeReferences(
        {},
        [NTC2018_RC_CHAPTER_7_4_REFERENCES.columnCapacityDesign],
      ),
    };
  }

  const beams = finiteArray(
    beamMomentResistances,
    "beamMomentResistances",
  );
  const columns = finiteArray(
    columnMomentResistances,
    "columnMomentResistances",
    { maximumLength: 2 },
  );
  const gammaRd = selectNTC2018OverstrengthFactors({
    behavior: normalizedBehavior,
  }).columnBending;
  const beamSum = beams.reduce((sum, value) => sum + Math.abs(value), 0);
  const columnMagnitudes = columns.map(Math.abs);
  const discordantColumns =
    columns.length === 2 && columns[0] * columns[1] < 0;

  let capacity = columnMagnitudes.reduce((sum, value) => sum + value, 0);
  let transferredColumnMoment = 0;
  if (discordantColumns) {
    capacity = Math.max(...columnMagnitudes);
    transferredColumnMoment = Math.min(...columnMagnitudes);
  }
  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.2.1
  const demand = gammaRd * beamSum + transferredColumnMoment;

  return {
    applicable: true,
    demand,
    capacity,
    utilizationRatio: capacity > 0 ? demand / capacity : Infinity,
    ok: capacity > 0 && demand <= capacity,
    gammaRd,
    beamMomentResistanceSum: beamSum,
    columnMomentResistanceSum: columnMagnitudes.reduce(
      (sum, value) => sum + value,
      0,
    ),
    transferredColumnMoment,
    discordantColumns,
    check: "capacity-design-beam-column-hierarchy",
    reference: "NTC 2018 § 7.4.4.2.1, Eq. [7.4.4]",
    metadata: withNormativeReferences(
      {},
      [NTC2018_RC_CHAPTER_7_4_REFERENCES.columnCapacityDesign],
    ),
  };
}

/**
 * Beam shear demand from equilibrium with signed end capacities and signed
 * gravity shears for one seismic direction/sense.
 */
export function computeBeamCapacityShear({
  momentResistanceLeft,
  momentResistanceRight,
  clearLength,
  gravityShearLeft,
  gravityShearRight,
  behavior,
}) {
  const leftMoment = finite(momentResistanceLeft, "momentResistanceLeft");
  const rightMoment = finite(momentResistanceRight, "momentResistanceRight");
  const length = positive(clearLength, "clearLength");
  const leftGravityShear = finite(gravityShearLeft, "gravityShearLeft");
  const rightGravityShear = finite(gravityShearRight, "gravityShearRight");
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  if (normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    throw new Error("Beam capacity-design shear is not applicable to non-dissipative behaviour.");
  }
  const gammaRd = selectNTC2018OverstrengthFactors({
    behavior: normalizedBehavior,
  }).beamShear;
  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.1.1
  const shearFromEndMoments =
    gammaRd * (rightMoment - leftMoment) / length;
  const signedShearLeft = leftGravityShear + shearFromEndMoments;
  const signedShearRight = rightGravityShear + shearFromEndMoments;

  return {
    shearDemand: Math.max(
      Math.abs(signedShearLeft),
      Math.abs(signedShearRight),
    ),
    shearDemandLeft: Math.abs(signedShearLeft),
    shearDemandRight: Math.abs(signedShearRight),
    signedShearLeft,
    signedShearRight,
    shearFromEndMoments,
    gammaRd,
    check: "capacity-design-beam-shear",
    reference: "NTC 2018 § 7.4.4.1.1 (Taglio)",
    metadata: withNormativeReferences(
      {},
      [NTC2018_RC_CHAPTER_7_4_REFERENCES.beamCapacityShear],
    ),
  };
}

function columnEndDesignMoment({
  columnMomentResistance,
  beamMomentResistanceSum,
  columnMomentResistanceSum,
  label,
}) {
  const columnResistance = nonNegative(
    columnMomentResistance,
    `${label}.columnMomentResistance`,
  );
  const beamSum = nonNegative(
    beamMomentResistanceSum,
    `${label}.beamMomentResistanceSum`,
  );
  const columnSum = positive(
    columnMomentResistanceSum,
    `${label}.columnMomentResistanceSum`,
  );
  const hierarchyFactor = Math.min(1, beamSum / columnSum);
  return {
    designMoment: columnResistance * hierarchyFactor,
    hierarchyFactor,
  };
}

/**
 * Column shear demand according to Eq. [7.4.5].
 */
export function computeColumnCapacityShear({
  top,
  bottom,
  clearLength,
  behavior,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  if (normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    throw new Error("Column capacity-design shear is not applicable to non-dissipative behaviour.");
  }
  const topEnd = columnEndDesignMoment({ ...top, label: "top" });
  const bottomEnd = columnEndDesignMoment({ ...bottom, label: "bottom" });
  const length = positive(clearLength, "clearLength");
  const gammaRd = selectNTC2018OverstrengthFactors({
    behavior: normalizedBehavior,
  }).columnShear;
  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.2.1
  const shearDemand =
    gammaRd * (topEnd.designMoment + bottomEnd.designMoment) / length;

  return {
    shearDemand,
    gammaRd,
    designMomentTop: topEnd.designMoment,
    designMomentBottom: bottomEnd.designMoment,
    hierarchyFactorTop: topEnd.hierarchyFactor,
    hierarchyFactorBottom: bottomEnd.hierarchyFactor,
    check: "capacity-design-column-shear",
    reference: "NTC 2018 § 7.4.4.2.1, Eq. [7.4.5]",
    metadata: withNormativeReferences(
      {},
      [NTC2018_RC_CHAPTER_7_4_REFERENCES.columnCapacityDesign],
    ),
  };
}

/**
 * Joint shear demand according to Eqs. [7.4.6] and [7.4.7].
 */
export function computeJointCapacityShear({
  behavior,
  topReinforcementArea,
  bottomReinforcementArea,
  reinforcementDesignStrength,
  columnShearAbove,
  jointType,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  const factors = selectNTC2018OverstrengthFactors({
    behavior:
      normalizedBehavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE
        ? NTC2018_STRUCTURAL_BEHAVIOR.CD_B
        : normalizedBehavior,
  });
  const topArea = nonNegative(
    topReinforcementArea,
    "topReinforcementArea",
  );
  const bottomArea = nonNegative(
    bottomReinforcementArea,
    "bottomReinforcementArea",
  );
  const designStrength = positive(
    reinforcementDesignStrength,
    "reinforcementDesignStrength",
  );
  const columnShear = finite(columnShearAbove, "columnShearAbove");
  if (jointType !== "internal" && jointType !== "external") {
    throw new Error(`jointType must be "internal" or "external"; got ${jointType}.`);
  }

  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.3.1
  const reinforcementForce = jointType === "internal"
    ? (topArea + bottomArea) * designStrength
    : topArea * designStrength;
  const signedShearDemand =
    factors.jointShear * reinforcementForce - columnShear;
  return {
    shearDemand: Math.abs(signedShearDemand),
    signedShearDemand,
    gammaRd: factors.jointShear,
    jointType,
    check: "capacity-design-joint-shear",
    reference:
      jointType === "internal"
        ? "NTC 2018 § 7.4.4.3.1, Eq. [7.4.7]"
        : "NTC 2018 § 7.4.4.3.1, Eq. [7.4.6]",
    metadata: withNormativeReferences(
      {},
      [NTC2018_RC_CHAPTER_7_4_REFERENCES.beamColumnJoint],
    ),
  };
}

function resistanceCheck(result, resistance, check) {
  const capacity = positive(resistance, `${check}.shearResistance`);
  return {
    ...result,
    check,
    demand: result.shearDemand,
    capacity,
    utilizationRatio: result.shearDemand / capacity,
    ok: result.shearDemand <= capacity,
  };
}

/**
 * Aggregate only checks for which complete demand and capacity data exist.
 * Empty dissipative assessments are explicitly incomplete.
 */
export function createCapacityDesignAssessment({
  jointId,
  behavior,
  hierarchy,
  beamShear,
  columnShear,
  jointShear,
}) {
  const normalizedBehavior = normalizeNTC2018StructuralBehavior(behavior);
  const checks = [];

  if (hierarchy != null) {
    checks.push(verifyBeamColumnHierarchy({
      ...hierarchy,
      behavior: normalizedBehavior,
    }));
  }
  if (beamShear != null) {
    const { shearResistance, ...demandInput } = beamShear;
    checks.push(resistanceCheck(
      computeBeamCapacityShear({
        ...demandInput,
        behavior: normalizedBehavior,
      }),
      shearResistance,
      "capacity-design-beam-shear",
    ));
  }
  if (columnShear != null) {
    const { shearResistance, ...demandInput } = columnShear;
    checks.push(resistanceCheck(
      computeColumnCapacityShear({
        ...demandInput,
        behavior: normalizedBehavior,
      }),
      shearResistance,
      "capacity-design-column-shear",
    ));
  }
  if (jointShear != null) {
    const { shearResistance, ...demandInput } = jointShear;
    checks.push(resistanceCheck(
      computeJointCapacityShear({
        ...demandInput,
        behavior: normalizedBehavior,
      }),
      shearResistance,
      "capacity-design-joint-shear",
    ));
  }

  const isDissipative =
    normalizedBehavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
  const complete = checks.length > 0 &&
    (!isDissipative || hierarchy != null);
  return {
    jointId,
    behavior: normalizedBehavior,
    isDissipative,
    complete,
    status: complete
      ? checks.every((check) => check.ok === true)
        ? "ok"
        : "not-verified"
      : "not-implemented",
    allChecksOk: complete && checks.every((check) => check.ok === true),
    checks,
    references: NTC2018_CAPACITY_DESIGN_REFERENCES,
    metadata: withNormativeReferences({}, [
      ...(hierarchy != null || columnShear != null
        ? [NTC2018_RC_CHAPTER_7_4_REFERENCES.columnCapacityDesign]
        : []),
      ...(beamShear != null
        ? [NTC2018_RC_CHAPTER_7_4_REFERENCES.beamCapacityShear]
        : []),
      ...(jointShear != null
        ? [NTC2018_RC_CHAPTER_7_4_REFERENCES.beamColumnJoint]
        : []),
    ]),
  };
}
