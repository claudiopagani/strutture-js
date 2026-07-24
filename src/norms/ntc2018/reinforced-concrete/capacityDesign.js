/**
 * NTC 2018 capacity design (gerarchia delle resistenze) module.
 *
 * Implements the capacity design rules for dissipative reinforced concrete
 * structures per §§ 7.4.4-7.4.7. These rules apply only when the structural
 * behavior is dissipative (CD"A" or CD"B"); for non-dissipative structures
 * all capacity design checks are skipped.
 *
 * The module computes capacity design demands from member resistances
 * (moments, shears) and compares them against the required hierarchy.
 * It does NOT call the local verifiers; that orchestration belongs to WP6.
 *
 * References:
 * - D.M. 17/01/2018 (NTC 2018): §§ 7.4.4, 7.4.5, 7.4.6, 7.4.6.1, 7.4.7
 * - Circolare 21/01/2019 n. 7: C7.4.4, C7.4.5, C7.4.6
 */

import {
    NTC2018_STRUCTURAL_BEHAVIOR,
    selectNTC2018OverstrengthFactors,
} from "./structuralBehavior.js";

// ---------------------------------------------------------------------------
// Reference metadata
// ---------------------------------------------------------------------------

/** @readonly */
export const NTC2018_CAPACITY_DESIGN_REFERENCES = Object.freeze([
    {
        source: "NTC 2018",
        citation: "D.M. 17/01/2018, §§ 7.4.4, 7.4.5, 7.4.6, 7.4.6.1, 7.4.7",
    },
    {
        source: "Circolare 2019",
        citation: "Circ. 21/01/2019 n. 7, C7.4.4, C7.4.5, C7.4.6",
    },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {number} value
 * @param {string} label
 * @returns {number}
 */
function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be positive; got ${value}.`);
    }
    return value;
}

/**
 * @param {number} value
 * @param {string} label
 * @returns {number}
 */
function nonNegative(value, label) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be non-negative; got ${value}.`);
    }
    return value;
}

// ---------------------------------------------------------------------------
// Beam-column joint capacity design (§ 7.4.4)
// ---------------------------------------------------------------------------

/**
 * Verify the beam-column hierarchy at a single joint.
 *
 * Per NTC 2018 § 7.4.4, Eq. [7.4.4]:
 *   γ_Rd × ΣM_Rb ≤ ΣM_Rc
 *
 * where:
 * - ΣM_Rb = sum of beam moment resistances (positive + negative) at the joint
 * - ΣM_Rc = sum of column moment resistances at the joint,
 *   reduced for concurrent axial force and selected for the correct
 *   moment signs per the seismic direction
 *
 * @param {Object} params
 * @param {number} params.beamMomentResistancePositive – M⁺_Rb [force×length].
 * @param {number} params.beamMomentResistanceNegative – M⁻_Rb (absolute value) [force×length].
 * @param {number} params.columnMomentResistance – ΣM_Rc, already reduced for
 *   axial force and moment signs [force×length].
 * @param {string} params.behavior – Structural behavior.
 * @returns {{
 *   demand: number,
 *   capacity: number,
 *   utilizationRatio: number,
 *   ok: boolean,
 *   gammaRd: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyBeamColumnHierarchy({
    beamMomentResistancePositive,
    beamMomentResistanceNegative,
    columnMomentResistance,
    behavior,
}) {
    const mrbPos = nonNegative(beamMomentResistancePositive, "beamMomentResistancePositive");
    const mrbNeg = nonNegative(beamMomentResistanceNegative, "beamMomentResistanceNegative");
    const mrc = nonNegative(columnMomentResistance, "columnMomentResistance");

    // § 7.4.4 Eq. [7.4.4]: γ_Rd on beam flexural overstrength. For cast-in-
    // place RC the beam shear and column bending factors apply; the joint
    // hierarchy uses the beam shear overstrength γ_Rd = 1.20 (CD"A").
    const { beamShear: gammaRd } = selectNTC2018OverstrengthFactors({ behavior });

    const sumMRb = mrbPos + mrbNeg;
    const demand = gammaRd * sumMRb;

    return {
        demand,
        capacity: mrc,
        utilizationRatio: mrc > 0 ? demand / mrc : Infinity,
        ok: demand <= mrc,
        gammaRd,
        check: "capacity-design-beam-column-hierarchy",
        reference: "NTC 2018 § 7.4.4, Eq. [7.4.4]",
    };
}

// ---------------------------------------------------------------------------
// Beam shear capacity design (§ 7.4.5)
// ---------------------------------------------------------------------------

/**
 * Compute the capacity design shear demand for a beam.
 *
 * Per NTC 2018 § 7.4.5, Eq. [7.4.14] and [7.4.15]:
 *   V_Ed = γ_Rd × (M⁺_Rb + M⁻_Rb) / l_cl + V_g+q
 *
 * where:
 * - M⁺_Rb, M⁻_Rb = beam end moment resistances (positive and negative)
 * - l_cl = clear length of the beam
 * - V_g+q = shear from gravity loads in the seismic combination
 *
 * The sign of V_Ed is always taken positive for comparison with V_Rd.
 *
 * @param {Object} params
 * @param {number} params.momentResistancePositive – M⁺_Rb at one end [force×length].
 * @param {number} params.momentResistanceNegative – M⁻_Rb at the other end [force×length].
 * @param {number} params.clearLength – Clear length l_cl [length].
 * @param {number} [params.gravityShear] – V_g+q from gravity loads [force]. Default 0.
 * @param {string} params.behavior – Structural behavior.
 * @returns {{
 *   shearDemand: number,
 *   gammaRd: number,
 *   shearFromMoments: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function computeBeamCapacityShear({
    momentResistancePositive,
    momentResistanceNegative,
    clearLength,
    gravityShear = 0,
    behavior,
}) {
    const mPos = nonNegative(momentResistancePositive, "momentResistancePositive");
    const mNeg = nonNegative(momentResistanceNegative, "momentResistanceNegative");
    const lcl = positive(clearLength, "clearLength");
    const vgq = Number.isFinite(gravityShear) ? gravityShear : 0;

    // § 7.4.5 Eq. [7.4.14-15]: beam shear capacity → beamShear mechanism.
    const { beamShear: gammaRd } = selectNTC2018OverstrengthFactors({ behavior });

    const shearFromMoments = gammaRd * (mPos + mNeg) / lcl;
    const shearDemand = Math.abs(shearFromMoments + vgq);

    return {
        shearDemand,
        gammaRd,
        shearFromMoments,
        check: "capacity-design-beam-shear",
        reference: "NTC 2018 § 7.4.5, Eq. [7.4.14-15]",
    };
}

// ---------------------------------------------------------------------------
// Column shear capacity design (§ 7.4.6.1)
// ---------------------------------------------------------------------------

/**
 * Compute the capacity design shear demand for a column.
 *
 * Per NTC 2018 § 7.4.6.1, Eq. [7.4.16] and [7.4.17]:
 *   V_Ed = γ_Rd × (M⁺_Rc + M⁻_Rc) / l_cl
 *
 * where:
 * - M⁺_Rc, M⁻_Rc = column end moment resistances
 * - l_cl = clear length of the column
 *
 * @param {Object} params
 * @param {number} params.momentResistanceTop – M_Rc at column top [force×length].
 * @param {number} params.momentResistanceBottom – M_Rc at column bottom [force×length].
 * @param {number} params.clearLength – Clear length l_cl [length].
 * @param {string} params.behavior – Structural behavior.
 * @returns {{
 *   shearDemand: number,
 *   gammaRd: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function computeColumnCapacityShear({
    momentResistanceTop,
    momentResistanceBottom,
    clearLength,
    behavior,
}) {
    const mTop = nonNegative(momentResistanceTop, "momentResistanceTop");
    const mBot = nonNegative(momentResistanceBottom, "momentResistanceBottom");
    const lcl = positive(clearLength, "clearLength");

    // § 7.4.6.1 Eq. [7.4.16-17]: column shear capacity → columnShear mechanism.
    const { columnShear: gammaRd } = selectNTC2018OverstrengthFactors({ behavior });

    const shearDemand = gammaRd * (mTop + mBot) / lcl;

    return {
        shearDemand,
        gammaRd,
        check: "capacity-design-column-shear",
        reference: "NTC 2018 § 7.4.6.1, Eq. [7.4.16-17]",
    };
}

// ---------------------------------------------------------------------------
// Joint hierarchy verification (§ 7.4.7)
// ---------------------------------------------------------------------------

/**
 * Verify the joint hierarchy.
 *
 * This delegates to the existing joint verification module.
 * The joint shear demand must be computed with γ_Rd per Tab. 7.2.I.
 *
 * For CD"A": γ_Rd,joint = 1.20
 * For CD"B": γ_Rd,joint = 1.00
 *
 * @param {Object} params
 * @param {string} params.behavior – Structural behavior.
 * @param {number} params.topReinforcementArea – A_s1 at beam top [length²].
 * @param {number} params.bottomReinforcementArea – A_s2 at beam bottom [length²].
 * @param {number} params.reinforcementDesignStrength – f_yd [force/length²].
 * @param {number} [params.columnShearAbove] – V_c above the joint [force].
 * @param {"internal"|"external"} params.jointType – Joint type.
 * @returns {{
 *   shearDemand: number,
 *   gammaRd: number,
 *   jointType: string,
 *   check: string,
 *   reference: string,
 * }}
 */
export function computeJointCapacityShear({
    behavior,
    topReinforcementArea,
    bottomReinforcementArea,
    reinforcementDesignStrength,
    columnShearAbove = 0,
    jointType,
}) {
    const as1 = nonNegative(topReinforcementArea, "topReinforcementArea");
    const as2 = nonNegative(bottomReinforcementArea, "bottomReinforcementArea");
    const fyd = positive(reinforcementDesignStrength, "reinforcementDesignStrength");
    const vc = Number.isFinite(columnShearAbove) ? columnShearAbove : 0;

    if (jointType !== "internal" && jointType !== "external") {
        throw new Error(
            `jointType must be "internal" or "external"; got "${jointType}".`,
        );
    }

    // § 7.4.6 Eq. [7.4.6-7]: joint shear → jointShear mechanism.
    const { jointShear: gammaRd } = selectNTC2018OverstrengthFactors({ behavior });

    // Eq. 7.4.6 (external) or 7.4.7 (internal)
    let shearDemand;
    if (jointType === "external") {
        shearDemand = Math.abs(gammaRd * as1 * fyd - vc);
    } else {
        shearDemand = Math.abs(gammaRd * (as1 + as2) * fyd - vc);
    }

    return {
        shearDemand,
        gammaRd,
        jointType,
        check: "capacity-design-joint-shear",
        reference: "NTC 2018 § 7.4.7, Eq. [7.4.6-7]",
    };
}

// ---------------------------------------------------------------------------
// Aggregated capacity design assessment
// ---------------------------------------------------------------------------

/**
 * Produce a complete capacity design assessment for a structural node.
 *
 * This is the function called by the orchestrator (WP6) for each joint
 * in the mapped model.
 *
 * @param {Object} params
 * @param {string} params.jointId – Joint identifier.
 * @param {string} params.behavior – Structural behavior.
 * @param {Object} params.hierarchy – Beam-column hierarchy inputs.
 * @param {number} params.hierarchy.beamMomentResistancePositive
 * @param {number} params.hierarchy.beamMomentResistanceNegative
 * @param {number} params.hierarchy.columnMomentResistance
 * @param {Object} [params.beamShear] – Beam shear capacity design inputs.
 * @param {number} params.beamShear.momentResistancePositive
 * @param {number} params.beamShear.momentResistanceNegative
 * @param {number} params.beamShear.clearLength
 * @param {number} [params.beamShear.gravityShear]
 * @param {Object} [params.columnShear] – Column shear capacity design inputs.
 * @param {number} params.columnShear.momentResistanceTop
 * @param {number} params.columnShear.momentResistanceBottom
 * @param {number} params.columnShear.clearLength
 * @param {Object} [params.jointShear] – Joint shear inputs.
 * @param {number} params.jointShear.topReinforcementArea
 * @param {number} params.jointShear.bottomReinforcementArea
 * @param {number} params.jointShear.reinforcementDesignStrength
 * @param {number} [params.jointShear.columnShearAbove]
 * @param {"internal"|"external"} params.jointShear.jointType
 * @returns {{
 *   jointId: string,
 *   behavior: string,
 *   isDissipative: boolean,
 *   checks: Array<{
 *     check: string,
 *     ok: boolean,
 *     demand: number,
 *     capacity: number,
 *     utilizationRatio: number,
 *     reference: string,
 *   }>,
 *   references: Array,
 * }}
 */
export function createCapacityDesignAssessment({
    jointId,
    behavior,
    hierarchy,
    beamShear,
    columnShear,
    jointShear,
}) {
    const isDissipative = behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
    const checks = [];

    if (!isDissipative) {
        return {
            jointId,
            behavior,
            isDissipative: false,
            checks: [{
                check: "capacity-design-not-applicable",
                ok: true,
                demand: null,
                capacity: null,
                utilizationRatio: null,
                reference: "NTC 2018 § 7.8 (struttura non dissipativa)",
            }],
            references: NTC2018_CAPACITY_DESIGN_REFERENCES,
        };
    }

    // Beam-column hierarchy
    if (hierarchy) {
        const result = verifyBeamColumnHierarchy({
            ...hierarchy,
            behavior,
        });
        checks.push({
            ...result,
            demand: result.demand,
            capacity: result.capacity,
        });
    }

    // Beam capacity shear
    if (beamShear) {
        const result = computeBeamCapacityShear({
            ...beamShear,
            behavior,
        });
        checks.push({
            check: result.check,
            ok: null, // shear resistance must be verified separately
            demand: result.shearDemand,
            capacity: null, // V_Rd from local verifier
            utilizationRatio: null,
            reference: result.reference,
            metadata: { gammaRd: result.gammaRd },
        });
    }

    // Column capacity shear
    if (columnShear) {
        const result = computeColumnCapacityShear({
            ...columnShear,
            behavior,
        });
        checks.push({
            check: result.check,
            ok: null,
            demand: result.shearDemand,
            capacity: null,
            utilizationRatio: null,
            reference: result.reference,
            metadata: { gammaRd: result.gammaRd },
        });
    }

    // Joint shear
    if (jointShear) {
        const result = computeJointCapacityShear({
            ...jointShear,
            behavior,
        });
        checks.push({
            check: result.check,
            ok: null,
            demand: result.shearDemand,
            capacity: null,
            utilizationRatio: null,
            reference: result.reference,
            metadata: {
                gammaRd: result.gammaRd,
                jointType: result.jointType,
            },
        });
    }

    return {
        jointId,
        behavior,
        isDissipative: true,
        checks,
        references: NTC2018_CAPACITY_DESIGN_REFERENCES,
    };
}
