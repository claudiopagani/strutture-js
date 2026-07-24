/**
 * NTC 2018 structural regularity module.
 *
 * Evaluates plan and elevation regularity per § 7.2.2, Tables 7.2.I-II.
 * Produces the regularity reduction factor k_r (§ 7.3.1) and determines
 * admissible analysis methods based on the results.
 *
 * The data (masses, stiffnesses, geometries) comes from the global FEM
 * model via GlobalFemModelContract + FemEntityMappingContract. This
 * module evaluates the criteria; data extraction from FEM contracts
 * belongs to the orchestrator (WP3/WP6).
 *
 * References:
 * - D.M. 17/01/2018 (NTC 2018): §§ 7.2.2, 7.2.3, 7.3.1
 * - Circolare 21/01/2019 n. 7: C7.2.2
 */

import {
    NTC2018_PLAN_REGULARITY,
    NTC2018_ELEVATION_REGULARITY,
    NTC2018_REGULARITY_REDUCTION,
    NTC2018_STRUCTURAL_BEHAVIOR,
    NTC2018_ANALYSIS_METHOD,
} from "./structuralBehavior.js";
import {
    selectNTC2018AllowedAnalysisMethods,
} from "./structuralBehavior.js";

// ---------------------------------------------------------------------------
// Reference metadata
// ---------------------------------------------------------------------------

/** @readonly */
export const NTC2018_REGULARITY_REFERENCES = Object.freeze([
    {
        source: "NTC 2018",
        citation: "D.M. 17/01/2018, §§ 7.2.2, 7.2.3, 7.3.1, Tab. 7.2.I, Tab. 7.2.II",
    },
    {
        source: "Circolare 2019",
        citation: "Circ. 21/01/2019 n. 7, C7.2.2",
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
function finiteNonNegative(value, label) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be finite and non-negative; got ${value}.`);
    }
    return value;
}

/**
 * @param {number} value
 * @param {string} label
 * @returns {number}
 */
function finitePositive(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be finite and positive; got ${value}.`);
    }
    return value;
}

// ---------------------------------------------------------------------------
// Plan regularity – § 7.2.2.1, Tab. 7.2.I
// ---------------------------------------------------------------------------

/**
 * Evaluate plan regularity from structural geometry data.
 *
 * Tab. 7.2.I criteria:
 * 1. Symmetric mass and stiffness distribution
 * 2. Slenderness Lmax/Lmin ≤ 4
 * 3. Re-entrant corners ≤ 25% of parallel total dimension
 * 4. Floors acting as rigid diaphragms (delegated to consumer)
 * 5. No significant floor discontinuities
 *
 * @param {Object} params
 * @param {number} params.planLengthX – Building plan dimension along X [length].
 * @param {number} params.planLengthY – Building plan dimension along Y [length].
 * @param {number} [params.maxReentrantX] – Maximum re-entrant depth along X [length]. 0 if none.
 * @param {number} [params.maxReentrantY] – Maximum re-entrant depth along Y [length]. 0 if none.
 * @param {number} [params.eccentricityX] – Mass-stiffness eccentricity along X [length]. Requires radiusX.
 * @param {number} [params.eccentricityY] – Mass-stiffness eccentricity along Y [length]. Requires radiusY.
 * @param {number} [params.torsionalRadiusX] – Torsional radius of stiffness along X [length].
 * @param {number} [params.torsionalRadiusY] – Torsional radius of stiffness along Y [length].
 * @param {number} [params.floorOpeningRatio] – Max ratio of opening area to gross floor area (0–1).
 *   Omit if floors are continuous.
 * @param {boolean} [params.hasRigidDiaphragms] – Whether floors act as rigid diaphragms.
 *   Defaults to true; set false only when demonstrated otherwise.
 * @returns {{
 *   regularity: string,
 *   checks: Array<{ check: string, ok: boolean, reference: string, detail?: string }>,
 *   slenderness: number,
 *   reentrantRatioX: number|null,
 *   reentrantRatioY: number|null,
 *   eccentricityRatioX: number|null,
 *   eccentricityRatioY: number|null,
 * }}
 */
export function evaluateNTC2018PlanRegularity({
    planLengthX,
    planLengthY,
    maxReentrantX = 0,
    maxReentrantY = 0,
    eccentricityX,
    eccentricityY,
    torsionalRadiusX,
    torsionalRadiusY,
    floorOpeningRatio,
    hasRigidDiaphragms = true,
} = {}) {
    const Lx = finitePositive(planLengthX, "planLengthX");
    const Ly = finitePositive(planLengthY, "planLengthY");
    const rx = finiteNonNegative(maxReentrantX, "maxReentrantX");
    const ry = finiteNonNegative(maxReentrantY, "maxReentrantY");

    const checks = [];
    let allOk = true;

    // --- Criterion 1: Slenderness Lmax/Lmin ≤ 4 ---
    const Lmax = Math.max(Lx, Ly);
    const Lmin = Math.min(Lx, Ly);
    const slenderness = Lmax / Lmin;
    const slendernessOk = slenderness <= 4;
    checks.push({
        check: "plan-slenderness",
        ok: slendernessOk,
        reference: "NTC 2018 Tab. 7.2.I (snellezza Lmax/Lmin ≤ 4)",
        detail: `Lmax/Lmin = ${Lmax}/${Lmin} = ${slenderness.toFixed(2)}`,
    });
    if (!slendernessOk) allOk = false;

    // --- Criterion 2: Re-entrant corners ≤ 25% ---
    let reentrantRatioX = null;
    let reentrantRatioY = null;

    if (rx > 0) {
        reentrantRatioX = rx / Lx;
        const reentrantOkX = reentrantRatioX <= 0.25;
        checks.push({
            check: "plan-reentrant-x",
            ok: reentrantOkX,
            reference: "NTC 2018 Tab. 7.2.I (rientranze ≤ 25%)",
            detail: `rientranza X/Lx = ${rx}/${Lx} = ${(reentrantRatioX * 100).toFixed(1)}%`,
        });
        if (!reentrantOkX) allOk = false;
    }

    if (ry > 0) {
        reentrantRatioY = ry / Ly;
        const reentrantOkY = reentrantRatioY <= 0.25;
        checks.push({
            check: "plan-reentrant-y",
            ok: reentrantOkY,
            reference: "NTC 2018 Tab. 7.2.I (rientranze ≤ 25%)",
            detail: `rientranza Y/Ly = ${ry}/${Ly} = ${(reentrantRatioY * 100).toFixed(1)}%`,
        });
        if (!reentrantOkY) allOk = false;
    }

    // --- Criterion 3: Mass-stiffness eccentricity ≤ 0.3 r ---
    let eccentricityRatioX = null;
    let eccentricityRatioY = null;

    if (eccentricityX !== undefined && torsionalRadiusX !== undefined) {
        const ex = finiteNonNegative(eccentricityX, "eccentricityX");
        const trx = finitePositive(torsionalRadiusX, "torsionalRadiusX");
        eccentricityRatioX = ex / trx;
        const eccOkX = eccentricityRatioX <= 0.3;
        checks.push({
            check: "plan-eccentricity-x",
            ok: eccOkX,
            reference: "NTC 2018 Tab. 7.2.I (eccentricità masse-rigidezze ≤ 0.3 r)",
            detail: `ex/rx = ${ex}/${trx} = ${eccentricityRatioX.toFixed(3)}`,
        });
        if (!eccOkX) allOk = false;
    }

    if (eccentricityY !== undefined && torsionalRadiusY !== undefined) {
        const ey = finiteNonNegative(eccentricityY, "eccentricityY");
        const trY = finitePositive(torsionalRadiusY, "torsionalRadiusY");
        eccentricityRatioY = ey / trY;
        const eccOkY = eccentricityRatioY <= 0.3;
        checks.push({
            check: "plan-eccentricity-y",
            ok: eccOkY,
            reference: "NTC 2018 Tab. 7.2.I (eccentricità masse-rigidezze ≤ 0.3 r)",
            detail: `ey/ry = ${ey}/${trY} = ${eccentricityRatioY.toFixed(3)}`,
        });
        if (!eccOkY) allOk = false;
    }

    // --- Criterion 4: Floor continuity ---
    const floorContinuityOk = floorOpeningRatio === undefined ||
        floorOpeningRatio <= 0.25;
    checks.push({
        check: "plan-floor-continuity",
        ok: floorContinuityOk,
        reference: "NTC 2018 Tab. 7.2.I (assenza discontinuità significative nei solai)",
        detail: floorOpeningRatio !== undefined
            ? `rapporto aperture = ${(floorOpeningRatio * 100).toFixed(1)}%`
            : "non valutato (dati non forniti)",
    });
    if (!floorContinuityOk) allOk = false;

    // --- Criterion 5: Rigid diaphragms ---
    checks.push({
        check: "plan-rigid-diaphragms",
        ok: hasRigidDiaphragms,
        reference: "NTC 2018 Tab. 7.2.I (solai infinitamente rigidi nel piano)",
        detail: hasRigidDiaphragms
            ? "diaframmi rigidi dichiarati"
            : "diaframmi non rigidi",
    });
    if (!hasRigidDiaphragms) allOk = false;

    return {
        regularity: allOk
            ? NTC2018_PLAN_REGULARITY.REGULAR
            : NTC2018_PLAN_REGULARITY.NON_REGULAR,
        checks,
        slenderness,
        reentrantRatioX,
        reentrantRatioY,
        eccentricityRatioX,
        eccentricityRatioY,
    };
}

// ---------------------------------------------------------------------------
// Elevation regularity – § 7.2.2.2, Tab. 7.2.II
// ---------------------------------------------------------------------------

/**
 * Storey data for elevation regularity evaluation.
 *
 * @typedef {Object} StoreyData
 * @property {string} storeyId – Storey identifier.
 * @property {number} elevation – Storey elevation (base of storey) [length].
 * @property {number} height – Storey height [length].
 * @property {number} mass – Storey seismic mass.
 * @property {number} [stiffnessX] – Lateral stiffness along X [force/length].
 * @property {number} [stiffnessY] – Lateral stiffness along Y [force/length].
 * @property {number} [resistanceX] – Lateral resistance (base shear capacity) along X [force].
 * @property {number} [resistanceY] – Lateral resistance (base shear capacity) along Y [force].
 * @property {number} [setbackX] – Setback depth along X relative to storey below [length].
 * @property {number} [setbackY] – Setback depth along Y relative to storey below [length].
 * @property {number} [planLengthX] – Building plan length along X at this storey [length].
 * @property {number} [planLengthY] – Building plan length along Y at this storey [length].
 */

/**
 * Evaluate elevation regularity from storey-level data.
 *
 * Tab. 7.2.II criteria:
 * 1. Vertical resisting systems continuous from base to top
 * 2. Mass variation ≤ 25% between adjacent storeys
 * 3. Lateral stiffness does not reduce abruptly
 * 4. Resistance ratio ≥ 0.8 between adjacent storeys (Eq. 7.2.1)
 * 5. Setbacks ≤ 20% of parallel dimension
 * 6. No significant inclined elements
 *
 * Storeys must be ordered from base to top.
 *
 * @param {Object} params
 * @param {StoreyData[]} params.storeys – Ordered array of storey data (base first).
 * @param {boolean} [params.continuousVerticalSystems] – Whether vertical
 *   resisting systems are continuous. Defaults to true.
 * @param {boolean} [params.hasInclinedElements] – Whether significant inclined
 *   elements exist. Defaults to false.
 * @returns {{
 *   regularity: string,
 *   checks: Array<{ check: string, ok: boolean, reference: string, detail?: string }>,
 *   storeyDetails: Array<{ storeyId: string, checks: Array }>,
 * }}
 */
export function evaluateNTC2018ElevationRegularity({
    storeys,
    continuousVerticalSystems = true,
    hasInclinedElements = false,
} = {}) {
    if (!Array.isArray(storeys) || storeys.length < 2) {
        throw new Error(
            "At least two storeys are required for elevation regularity evaluation.",
        );
    }

    const checks = [];
    const storeyDetails = [];
    let allOk = true;

    // --- Criterion 1: Continuous vertical systems ---
    checks.push({
        check: "elevation-continuous-systems",
        ok: continuousVerticalSystems,
        reference: "NTC 2018 Tab. 7.2.II (sistemi resistenti verticali continui)",
        detail: continuousVerticalSystems
            ? "sistemi verticali continui"
            : "sistemi verticali non continui",
    });
    if (!continuousVerticalSystems) allOk = false;

    // --- Criterion 2-4: Per-storey comparisons ---
    for (let i = 1; i < storeys.length; i++) {
        const current = storeys[i];
        const below = storeys[i - 1];
        const storeyChecks = [];

        // Mass variation
        if (below.mass > 0) {
            const massRatio = current.mass / below.mass;
            const massOk = massRatio >= 0.75 && massRatio <= 1.25;
            storeyChecks.push({
                check: "elevation-mass-variation",
                ok: massOk,
                reference: "NTC 2018 Tab. 7.2.II (variazione massa ≤ 25%)",
                detail:
                    `massa ${current.storeyId}/${below.storeyId} = ${massRatio.toFixed(3)}`,
            });
            if (!massOk) allOk = false;
        }

        // Stiffness variation (if data available)
        if (current.stiffnessX !== undefined && below.stiffnessX !== undefined &&
            below.stiffnessX > 0) {
            const stiffRatioX = current.stiffnessX / below.stiffnessX;
            const stiffOkX = stiffRatioX >= 0.70; // Tab. 7.2.II: no abrupt reduction
            storeyChecks.push({
                check: "elevation-stiffness-x",
                ok: stiffOkX,
                reference: "NTC 2018 Tab. 7.2.II (riduzione rigidezza non brusca)",
                detail:
                    `rigidezza X ${current.storeyId}/${below.storeyId} = ${stiffRatioX.toFixed(3)}`,
            });
            if (!stiffOkX) allOk = false;
        }

        // Resistance ratio (Eq. 7.2.1): Ri / Ri-1 ≥ 0.8
        if (current.resistanceX !== undefined && below.resistanceX !== undefined &&
            below.resistanceX > 0) {
            const resRatioX = current.resistanceX / below.resistanceX;
            const resOkX = resRatioX >= 0.80;
            storeyChecks.push({
                check: "elevation-resistance-x",
                ok: resOkX,
                reference: "NTC 2018 Tab. 7.2.II, Eq. [7.2.1] (rapporto resistenze ≥ 0.8)",
                detail:
                    `resistenza X ${current.storeyId}/${below.storeyId} = ${resRatioX.toFixed(3)}`,
            });
            if (!resOkX) allOk = false;
        }

        if (current.resistanceY !== undefined && below.resistanceY !== undefined &&
            below.resistanceY > 0) {
            const resRatioY = current.resistanceY / below.resistanceY;
            const resOkY = resRatioY >= 0.80;
            storeyChecks.push({
                check: "elevation-resistance-y",
                ok: resOkY,
                reference: "NTC 2018 Tab. 7.2.II, Eq. [7.2.1] (rapporto resistenze ≥ 0.8)",
                detail:
                    `resistenza Y ${current.storeyId}/${below.storeyId} = ${resRatioY.toFixed(3)}`,
            });
            if (!resOkY) allOk = false;
        }

        // Setback ratio
        if (current.setbackX !== undefined && current.planLengthX !== undefined &&
            current.planLengthX > 0) {
            const setbackRatioX = current.setbackX / current.planLengthX;
            const setbackOkX = setbackRatioX <= 0.20;
            storeyChecks.push({
                check: "elevation-setback-x",
                ok: setbackOkX,
                reference: "NTC 2018 Tab. 7.2.II (arretramenti ≤ 20%)",
                detail:
                    `arretramento X = ${(setbackRatioX * 100).toFixed(1)}%`,
            });
            if (!setbackOkX) allOk = false;
        }

        storeyDetails.push({
            storeyId: current.storeyId,
            comparedTo: below.storeyId,
            checks: storeyChecks,
        });
    }

    // --- Criterion 6: No inclined elements ---
    checks.push({
        check: "elevation-no-inclined-elements",
        ok: !hasInclinedElements,
        reference: "NTC 2018 Tab. 7.2.II (assenza elementi inclinati significativi)",
        detail: hasInclinedElements
            ? "presenti elementi inclinati significativi"
            : "nessun elemento inclinato significativo",
    });
    if (hasInclinedElements) allOk = false;

    return {
        regularity: allOk
            ? NTC2018_ELEVATION_REGULARITY.REGULAR
            : NTC2018_ELEVATION_REGULARITY.NON_REGULAR,
        checks,
        storeyDetails,
    };
}

// ---------------------------------------------------------------------------
// Combined regularity assessment
// ---------------------------------------------------------------------------

/**
 * Produce a complete structural regularity assessment.
 *
 * Combines plan and elevation evaluations and derives:
 * - Regularity classes
 * - Reduction factor k_r (§ 7.3.1)
 * - Admissible analysis methods (§ 7.2.3)
 *
 * @param {Object} params
 * @param {Object} params.planInput – Input for evaluateNTC2018PlanRegularity.
 * @param {Object} params.elevationInput – Input for evaluateNTC2018ElevationRegularity.
 * @param {string} params.behavior – Structural behavior (from WP1).
 * @param {number} [params.t1X] – Fundamental period along X [s].
 * @param {number} [params.t1Y] – Fundamental period along Y [s].
 * @param {number} [params.tc] – Spectrum period TC [s].
 * @param {number} [params.td] – Spectrum period TD [s].
 * @returns {{
 *   planRegularity: string,
 *   elevationRegularity: string,
 *   reductionFactorKr: number,
 *   analysisMethodsX: Object,
 *   analysisMethodsY: Object,
 *   checks: Array,
 *   references: Array,
 * }}
 */
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
    const elevResult = evaluateNTC2018ElevationRegularity(elevationInput);

    const kr = NTC2018_REGULARITY_REDUCTION[elevResult.regularity];

    const analysisX = selectNTC2018AllowedAnalysisMethods({
        behavior,
        planRegularity: planResult.regularity,
        elevationRegularity: elevResult.regularity,
        t1: t1X,
        tc,
        td,
    });

    const analysisY = selectNTC2018AllowedAnalysisMethods({
        behavior,
        planRegularity: planResult.regularity,
        elevationRegularity: elevResult.regularity,
        t1: t1Y,
        tc,
        td,
    });

    // Flatten all checks
    const allChecks = [
        ...planResult.checks.map((c) => ({ ...c, scope: "plan" })),
        ...elevResult.checks.map((c) => ({ ...c, scope: "elevation" })),
    ];

    return {
        planRegularity: planResult.regularity,
        elevationRegularity: elevResult.regularity,
        reductionFactorKr: kr,
        analysisMethodsX: {
            allowed: analysisX.allowed,
            recommended: analysisX.recommended,
            linearStaticAllowed: analysisX.linearStaticAllowed,
            checks: analysisX.checks,
        },
        analysisMethodsY: {
            allowed: analysisY.allowed,
            recommended: analysisY.recommended,
            linearStaticAllowed: analysisY.linearStaticAllowed,
            checks: analysisY.checks,
        },
        planDetails: {
            slenderness: planResult.slenderness,
            reentrantRatioX: planResult.reentrantRatioX,
            reentrantRatioY: planResult.reentrantRatioY,
            eccentricityRatioX: planResult.eccentricityRatioX,
            eccentricityRatioY: planResult.eccentricityRatioY,
        },
        elevationDetails: elevResult.storeyDetails,
        checks: allChecks,
        references: NTC2018_REGULARITY_REFERENCES,
    };
}
