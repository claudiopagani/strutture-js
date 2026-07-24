/**
 * NTC 2018 global displacement checks module.
 *
 * Implements storey drift and second-order (P-Delta) effect verification
 * per §§ 7.3.5, 7.3.7, 7.9. Also computes seismic joint clearance per
 * § 7.2.2.
 *
 * The data (storey displacements, shears, weights) comes from the global
 * FEM results via GlobalFemResultContract. This module evaluates the
 * criteria; data extraction from FEM contracts belongs to the
 * orchestrator (WP3/WP6).
 *
 * References:
 * - D.M. 17/01/2018 (NTC 2018): §§ 7.2.2, 7.3.5, 7.3.7, 7.9
 * - Circolare 21/01/2019 n. 7: C7.3.5, C7.3.7, C7.9
 */

import {
    NTC2018_STRUCTURAL_BEHAVIOR,
} from "./structuralBehavior.js";

// ---------------------------------------------------------------------------
// Reference metadata
// ---------------------------------------------------------------------------

/** @readonly */
export const NTC2018_DISPLACEMENT_REFERENCES = Object.freeze([
    {
        source: "NTC 2018",
        citation: "D.M. 17/01/2018, §§ 7.2.2, 7.3.5, 7.3.7, 7.9",
    },
    {
        source: "Circolare 2019",
        citation: "Circ. 21/01/2019 n. 7, C7.3.5, C7.3.7, C7.9",
    },
]);

// ---------------------------------------------------------------------------
// Drift limits (§ 7.3.7)
// ---------------------------------------------------------------------------

/**
 * Drift limit categories for serviceability checks.
 *
 * @readonly
 * @enum {string}
 */
export const NTC2018_DRIFT_INFILL_CATEGORY = Object.freeze({
    /** Rigidly connected infill panels (tamponamenti collegati rigidamente) */
    RIGIDLY_CONNECTED: "rigidly-connected",
    /** Non-structural infill not rigidly connected */
    NON_RIGIDLY_CONNECTED: "non-rigidly-connected",
    /** No infill panels */
    NO_INFILL: "no-infill",
});

/**
 * Drift limits per NTC 2018 § 7.3.7.
 *
 * @readonly
 */
export const NTC2018_DRIFT_LIMITS = Object.freeze({
    /** SLE (SLO/SLD) drift limits by infill category */
    sle: Object.freeze({
        "rigidly-connected": 0.005,
        "non-rigidly-connected": 0.01,
        "no-infill": 0.01,
    }),
    /** SLU (SLV) drift limit for dissipative structures */
    slu: 0.01,
});

// ---------------------------------------------------------------------------
// P-Delta limits (§ 7.3.5)
// ---------------------------------------------------------------------------

/**
 * P-Delta stability coefficient thresholds per § 7.3.5.
 *
 * @readonly
 */
export const NTC2018_PDELTA_THRESHOLDS = Object.freeze({
    /** θ ≤ 0.1: P-Delta effects negligible */
    negligible: 0.1,
    /** 0.1 < θ ≤ 0.2: amplify displacements by 1/(1-θ) */
    moderate: 0.2,
    /** θ > 0.2: nonlinear analysis required */
    nonlinearRequired: 0.2,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be positive; got ${value}.`);
    }
    return value;
}

function nonNegative(value, label) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be non-negative; got ${value}.`);
    }
    return value;
}

// ---------------------------------------------------------------------------
// Inter-storey drift (§ 7.3.7)
// ---------------------------------------------------------------------------

/**
 * Compute the inter-storey drift ratio for a single storey.
 *
 * The drift is the difference in horizontal displacement between
 * the top and bottom of the storey, divided by the storey height.
 *
 * @param {Object} params
 * @param {number} params.displacementTop – Horizontal displacement at storey top [length].
 * @param {number} params.displacementBottom – Horizontal displacement at storey bottom [length].
 * @param {number} params.storeyHeight – Storey height [length].
 * @returns {{ drift: number, driftRatio: number }}
 */
export function computeStoreyDrift({
    displacementTop,
    displacementBottom,
    storeyHeight,
}) {
    const dTop = Number.isFinite(displacementTop) ? displacementTop : 0;
    const dBot = Number.isFinite(displacementBottom) ? displacementBottom : 0;
    const h = positive(storeyHeight, "storeyHeight");

    const drift = Math.abs(dTop - dBot);
    const driftRatio = drift / h;

    return { drift, driftRatio };
}

/**
 * Verify storey drift against NTC 2018 limits.
 *
 * @param {Object} params
 * @param {number} params.driftRatio – Drift ratio (Δ/h).
 * @param {"SLE"|"SLU"} params.limitState – Limit state.
 * @param {string} params.behavior – Structural behavior.
 * @param {string} [params.infillCategory] – Infill category for SLE.
 *   Defaults to "no-infill".
 * @returns {{
 *   ok: boolean,
 *   driftRatio: number,
 *   limit: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyStoreyDrift({
    driftRatio,
    limitState,
    behavior,
    infillCategory = "no-infill",
}) {
    const dr = nonNegative(driftRatio, "driftRatio");

    let limit;
    let check;
    let reference;

    if (limitState === "SLE") {
        const validCategories = new Set(Object.values(NTC2018_DRIFT_INFILL_CATEGORY));
        const cat = validCategories.has(infillCategory)
            ? infillCategory
            : "no-infill";
        limit = NTC2018_DRIFT_LIMITS.sle[cat];
        check = "drift-sle";
        reference = `NTC 2018 § 7.3.7.1, Eq. [7.3.6] (${cat})`;
    } else if (limitState === "SLU") {
        if (behavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
            // Non-dissipative: use SLE limits (§ 7.9)
            limit = NTC2018_DRIFT_LIMITS.sle["no-infill"];
            check = "drift-non-dissipative";
            reference = "NTC 2018 § 7.9 (limiti SLE per strutture non dissipative)";
        } else {
            limit = NTC2018_DRIFT_LIMITS.slu;
            check = "drift-slu";
            reference = "NTC 2018 § 7.3.7.2, Eq. [7.3.7]";
        }
    } else {
        throw new Error(
            `limitState must be "SLE" or "SLU"; got "${limitState}".`,
        );
    }

    return {
        ok: dr <= limit,
        driftRatio: dr,
        limit,
        check,
        reference,
    };
}

// ---------------------------------------------------------------------------
// P-Delta effects (§ 7.3.5)
// ---------------------------------------------------------------------------

/**
 * Compute the P-Delta stability coefficient θ.
 *
 * Per NTC 2018 § 7.3.5, Eq. [7.3.2]:
 *   θ = P × d_r / (V × h)
 *
 * where:
 * - P = total gravity load at and above the storey
 * - d_r = inter-storey drift (SLU)
 * - V = storey shear force
 * - h = storey height
 *
 * @param {Object} params
 * @param {number} params.storeyWeight – P: total gravity load [force].
 * @param {number} params.drift – d_r: inter-storey drift [length].
 * @param {number} params.storeyShear – V: storey shear [force].
 * @param {number} params.storeyHeight – h: storey height [length].
 * @returns {{ theta: number, status: string, amplificationFactor: number|null }}
 */
export function computePDeltaCoefficient({
    storeyWeight,
    drift,
    storeyShear,
    storeyHeight,
}) {
    const P = nonNegative(storeyWeight, "storeyWeight");
    const dr = nonNegative(drift, "drift");
    const V = positive(storeyShear, "storeyShear");
    const h = positive(storeyHeight, "storeyHeight");

    const theta = P * dr / (V * h);

    let status;
    let amplificationFactor = null;

    if (theta <= NTC2018_PDELTA_THRESHOLDS.negligible) {
        status = "negligible";
    } else if (theta <= NTC2018_PDELTA_THRESHOLDS.moderate) {
        status = "moderate";
        amplificationFactor = 1 / (1 - theta);
    } else {
        status = "nonlinear-required";
    }

    return { theta, status, amplificationFactor };
}

/**
 * Verify P-Delta effects for a storey.
 *
 * @param {Object} params
 * @param {number} params.storeyWeight – P [force].
 * @param {number} params.drift – d_r [length].
 * @param {number} params.storeyShear – V [force].
 * @param {number} params.storeyHeight – h [length].
 * @returns {{
 *   ok: boolean,
 *   theta: number,
 *   status: string,
 *   amplificationFactor: number|null,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyPDelta({
    storeyWeight,
    drift,
    storeyShear,
    storeyHeight,
}) {
    const { theta, status, amplificationFactor } = computePDeltaCoefficient({
        storeyWeight,
        drift,
        storeyShear,
        storeyHeight,
    });

    const ok = status !== "nonlinear-required";

    return {
        ok,
        theta,
        status,
        amplificationFactor,
        check: "pdelta",
        reference: "NTC 2018 § 7.3.5, Eq. [7.3.2]",
    };
}

// ---------------------------------------------------------------------------
// Seismic joint (§ 7.2.2)
// ---------------------------------------------------------------------------

/**
 * Compute the minimum seismic joint clearance between adjacent buildings.
 *
 * Per NTC 2018 § 7.2.2, Eq. [7.2.1], the minimum distance is the maximum
 * of the individual building displacements, but not less than:
 *   d = 0.01 × H  (for dissipative structures)
 * or the SLV displacement (whichever is larger).
 *
 * The joint width must accommodate the sum of the two building
 * displacements in the worst-case phase opposition.
 *
 * @param {Object} params
 * @param {number} params.buildingHeightA – Height of building A [length].
 * @param {number} params.buildingHeightB – Height of building B [length].
 * @param {number} [params.slvDisplacementA] – SLV displacement of building A [length].
 * @param {number} [params.slvDisplacementB] – SLV displacement of building B [length].
 * @param {string} [params.behavior] – Structural behavior.
 * @returns {{
 *   jointWidth: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function computeSeismicJointWidth({
    buildingHeightA,
    buildingHeightB,
    slvDisplacementA,
    slvDisplacementB,
    behavior,
}) {
    const hA = positive(buildingHeightA, "buildingHeightA");
    const hB = nonNegative(buildingHeightB, "buildingHeightB"); // hB=0 for no adjacent building

    const isDissipative = behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;

    // Minimum required per building
    const minA = isDissipative ? 0.01 * hA : 0;
    const minB = isDissipative ? 0.01 * hB : 0;

    const dA = slvDisplacementA !== undefined
        ? Math.max(minA, nonNegative(slvDisplacementA, "slvDisplacementA"))
        : minA;

    const dB = slvDisplacementB !== undefined
        ? Math.max(minB, nonNegative(slvDisplacementB, "slvDisplacementB"))
        : minB;

    // Sum of individual displacements (worst-case phase opposition)
    const jointWidth = dA + dB;

    return {
        jointWidth,
        dA,
        dB,
        isDissipative,
        check: "seismic-joint",
        reference: "NTC 2018 § 7.2.2, Eq. [7.2.1]",
    };
}

// ---------------------------------------------------------------------------
// Storey-level displacement assessment
// ---------------------------------------------------------------------------

/**
 * Storey data for displacement verification.
 *
 * @typedef {Object} StoreyDisplacementData
 * @property {string} storeyId
 * @property {number} height – Storey height [length].
 * @property {number} displacementX – Horizontal displacement along X at storey top [length].
 * @property {number} displacementXBelow – Horizontal displacement along X at storey bottom [length].
 * @property {number} [displacementY] – Horizontal displacement along Y at storey top.
 * @property {number} [displacementYBelow] – Horizontal displacement along Y at storey bottom.
 * @property {number} weight – Gravity load P above the storey [force].
 * @property {number} shearX – Storey shear V along X [force].
 * @property {number} [shearY] – Storey shear V along Y [force].
 */

/**
 * Produce a complete storey-level displacement verification.
 *
 * @param {Object} params
 * @param {StoreyDisplacementData} params.storey – Storey data.
 * @param {"SLE"|"SLU"} params.limitState – Limit state.
 * @param {string} params.behavior – Structural behavior.
 * @param {string} [params.infillCategory] – Infill category for SLE.
 * @param {boolean} [params.checkPDelta] – Also verify P-Delta. Defaults to
 *   true for SLU, false for SLE.
 * @returns {{
 *   storeyId: string,
 *   driftX: { driftRatio: number, ok: boolean, limit: number },
 *   driftY: { driftRatio: number, ok: boolean, limit: number } | null,
 *   pDeltaX: Object | null,
 *   pDeltaY: Object | null,
 *   checks: Array,
 * }}
 */
export function verifyStoreyDisplacements({
    storey,
    limitState,
    behavior,
    infillCategory,
    checkPDelta,
}) {
    const shouldCheckPDelta = checkPDelta ?? (limitState === "SLU");

    const driftX = verifyStoreyDrift({
        driftRatio: Math.abs(
            (storey.displacementX ?? 0) - (storey.displacementXBelow ?? 0),
        ) / positive(storey.height, "storey.height"),
        limitState,
        behavior,
        infillCategory,
    });

    let driftY = null;
    if (storey.displacementY !== undefined) {
        driftY = verifyStoreyDrift({
            driftRatio: Math.abs(
                (storey.displacementY ?? 0) - (storey.displacementYBelow ?? 0),
            ) / storey.height,
            limitState,
            behavior,
            infillCategory,
        });
    }

    let pDeltaX = null;
    let pDeltaY = null;

    // P-Delta requires a positive storey shear AND a positive cumulative
    // weight; skip gracefully (leave null) when either is missing/zero.
    const canCheckPDeltaX = shouldCheckPDelta &&
        Number.isFinite(storey.shearX) && storey.shearX > 0 &&
        Number.isFinite(storey.weight) && storey.weight > 0;
    if (canCheckPDeltaX) {
        const driftValueX = Math.abs(
            (storey.displacementX ?? 0) - (storey.displacementXBelow ?? 0),
        );
        pDeltaX = verifyPDelta({
            storeyWeight: storey.weight,
            drift: driftValueX,
            storeyShear: storey.shearX,
            storeyHeight: storey.height,
        });
    }

    const canCheckPDeltaY = shouldCheckPDelta &&
        Number.isFinite(storey.shearY) && storey.shearY > 0 &&
        Number.isFinite(storey.weight) && storey.weight > 0;
    if (canCheckPDeltaY) {
        const driftValueY = Math.abs(
            (storey.displacementY ?? 0) - (storey.displacementYBelow ?? 0),
        );
        pDeltaY = verifyPDelta({
            storeyWeight: storey.weight,
            drift: driftValueY,
            storeyShear: storey.shearY,
            storeyHeight: storey.height,
        });
    }

    const checks = [
        {
            check: driftX.check,
            direction: "x",
            ok: driftX.ok,
            driftRatio: driftX.driftRatio,
            limit: driftX.limit,
            reference: driftX.reference,
        },
    ];

    if (driftY) {
        checks.push({
            check: driftY.check,
            direction: "y",
            ok: driftY.ok,
            driftRatio: driftY.driftRatio,
            limit: driftY.limit,
            reference: driftY.reference,
        });
    }

    if (pDeltaX) {
        checks.push({
            check: pDeltaX.check,
            direction: "x",
            ok: pDeltaX.ok,
            theta: pDeltaX.theta,
            status: pDeltaX.status,
            reference: pDeltaX.reference,
        });
    }

    if (pDeltaY) {
        checks.push({
            check: pDeltaY.check,
            direction: "y",
            ok: pDeltaY.ok,
            theta: pDeltaY.theta,
            status: pDeltaY.status,
            reference: pDeltaY.reference,
        });
    }

    return {
        storeyId: storey.storeyId,
        driftX,
        driftY,
        pDeltaX,
        pDeltaY,
        checks,
    };
}

// ---------------------------------------------------------------------------
// Aggregated building displacement assessment
// ---------------------------------------------------------------------------

/**
 * Produce a complete building-level displacement assessment.
 *
 * Iterates all storeys and aggregates the most critical results.
 *
 * @param {Object} params
 * @param {StoreyDisplacementData[]} params.storeys – Array of storeys (base to top).
 * @param {"SLE"|"SLU"} params.limitState – Limit state.
 * @param {string} params.behavior – Structural behavior.
 * @param {string} [params.infillCategory] – Infill category.
 * @returns {{
 *   limitState: string,
 *   storeyResults: Array,
 *   governingDriftX: { storeyId: string, driftRatio: number } | null,
 *   governingDriftY: { storeyId: string, driftRatio: number } | null,
 *   governingThetaX: { storeyId: string, theta: number } | null,
 *   governingThetaY: { storeyId: string, theta: number } | null,
 *   allChecksOk: boolean,
 *   checks: Array,
 *   references: Array,
 * }}
 */
export function createDisplacementAssessment({
    storeys,
    limitState,
    behavior,
    infillCategory,
}) {
    if (!Array.isArray(storeys) || storeys.length === 0) {
        throw new Error("At least one storey is required.");
    }

    const storeyResults = storeys.map((storey) =>
        verifyStoreyDisplacements({
            storey,
            limitState,
            behavior,
            infillCategory,
        }),
    );

    let governingDriftX = null;
    let governingDriftY = null;
    let governingThetaX = null;
    let governingThetaY = null;

    for (const result of storeyResults) {
        if (
            !governingDriftX ||
            result.driftX.driftRatio > governingDriftX.driftRatio
        ) {
            governingDriftX = {
                storeyId: result.storeyId,
                driftRatio: result.driftX.driftRatio,
            };
        }
        if (result.driftY) {
            if (
                !governingDriftY ||
                result.driftY.driftRatio > governingDriftY.driftRatio
            ) {
                governingDriftY = {
                    storeyId: result.storeyId,
                    driftRatio: result.driftY.driftRatio,
                };
            }
        }
        if (result.pDeltaX && (!governingThetaX || result.pDeltaX.theta > governingThetaX.theta)) {
            governingThetaX = { storeyId: result.storeyId, theta: result.pDeltaX.theta };
        }
        if (result.pDeltaY && (!governingThetaY || result.pDeltaY.theta > governingThetaY.theta)) {
            governingThetaY = { storeyId: result.storeyId, theta: result.pDeltaY.theta };
        }
    }

    const allChecks = storeyResults.flatMap((r) => r.checks);
    const allChecksOk = allChecks.every((c) => c.ok !== false);

    return {
        limitState,
        storeyResults,
        governingDriftX,
        governingDriftY,
        governingThetaX,
        governingThetaY,
        allChecksOk,
        checks: allChecks,
        references: NTC2018_DISPLACEMENT_REFERENCES,
    };
}
