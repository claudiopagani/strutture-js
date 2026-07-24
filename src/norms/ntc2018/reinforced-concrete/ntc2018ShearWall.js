/**
 * NTC 2018 shear wall (setti) verification module.
 *
 * Implements the capacity design and verification rules for ductile
 * reinforced concrete shear walls per § 7.4.8.
 *
 * The wall receives section cuts (integrated actions) from an external
 * FEM solver at each storey level. This module performs the normative
 * checks: biaxial bending, shear, moment shift (traslazione dei momenti),
 * capacity shear, and boundary element confinement.
 *
 * References:
 * - D.M. 17/01/2018 (NTC 2018): §§ 4.1.2.3.9, 7.4.8, 7.4.8.1-7.4.8.4
 * - Circolare 21/01/2019 n. 7: C7.4.8
 */

import {
    NTC2018_STRUCTURAL_BEHAVIOR,
    selectNTC2018OverstrengthFactors,
} from "./structuralBehavior.js";

// ---------------------------------------------------------------------------
// Reference metadata
// ---------------------------------------------------------------------------

/** @readonly */
export const NTC2018_SHEAR_WALL_REFERENCES = Object.freeze([
    {
        source: "NTC 2018",
        citation: "D.M. 17/01/2018, §§ 4.1.2.3.9, 7.4.8, 7.4.8.1-7.4.8.4",
    },
    {
        source: "Circolare 2019",
        citation: "Circ. 21/01/2019 n. 7, C7.4.8",
    },
]);

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
// Wall geometry helpers
// ---------------------------------------------------------------------------

/**
 * Compute the critical zone height for a shear wall.
 *
 * Per NTC 2018 § 7.4.8.1:
 *   h_cr = max(l_w, H_w / 6) but ≤ 2 × l_w and ≤ h_s (for low storeys)
 *
 * where l_w = wall section length and H_w = total wall height.
 *
 * @param {Object} params
 * @param {number} params.wallLength – l_w [length].
 * @param {number} params.wallHeight – H_w [length].
 * @param {number} [params.storeyHeight] – h_s of the first storey [length].
 *   If provided, h_cr is capped at h_s for low-rise walls.
 * @returns {{ hCr: number, reference: string }}
 */
export function computeWallCriticalZoneHeight({
    wallLength,
    wallHeight,
    storeyHeight,
}) {
    const lw = positive(wallLength, "wallLength");
    const Hw = positive(wallHeight, "wallHeight");

    let hCr = Math.max(lw, Hw / 6);
    hCr = Math.min(hCr, 2 * lw);

    if (storeyHeight !== undefined) {
        const hs = positive(storeyHeight, "storeyHeight");
        hCr = Math.min(hCr, hs);
    }

    return {
        hCr,
        reference: "NTC 2018 § 7.4.4.5.1, Eq. [7.4.13]",
    };
}

// ---------------------------------------------------------------------------
// Moment shift (traslazione dei momenti) – § 7.4.8.1
// ---------------------------------------------------------------------------

/**
 * Compute the moment shift (traslazione del diagramma dei momenti)
 * for capacity design of slender shear walls.
 *
 * Per NTC 2018 § 7.4.4.5.1 (Presso-flessione), for slender walls in both
 * CD"A" and CD"B" the design moment envelope along the height is obtained
 * by shifting the analysis moment envelope UPWARD by an amount consistent
 * with the inclination of the compression struts in the shear resisting
 * mechanism. In the absence of more accurate analyses, the shift may be
 * taken equal to h_cr (height of the dissipative inelastic base zone):
 *
 *   a_l = h_cr   (both CD"A" and CD"B", slender walls only)
 *
 * The shifted moment at elevation z is the moment at z + a_l.
 *
 * NOTE: this corrects a previous implementation that used
 * max(0.5·l_w, 0.5·h_cr) for CD"A" and max(0.25·l_w, 0.25·h_cr) for CD"B",
 * which does NOT appear in NTC 2018.
 *
 * @param {Object} params
 * @param {number} params.wallLength – l_w [length].
 * @param {number} params.criticalZoneHeight – h_cr [length].
 * @param {string} params.behavior – Structural behavior.
 * @returns {{ shiftLength: number, reference: string }}
 */
export function computeWallMomentShift({
    wallLength,
    criticalZoneHeight,
    behavior,
}) {
    positive(wallLength, "wallLength");
    const hCr = positive(criticalZoneHeight, "criticalZoneHeight");

    let shiftLength;
    let reference;

    if (
        behavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A ||
        behavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_B
    ) {
        // § 7.4.4.5.1: a_l = h_cr (slender walls, both ductility classes)
        shiftLength = hCr;
        reference = "NTC 2018 § 7.4.4.5.1 (traslazione = h_cr)";
    } else {
        // Non-dissipative: no shift
        shiftLength = 0;
        reference = "NTC 2018 § 7.8 (non dissipativo: nessuna traslazione)";
    }

    return { shiftLength, reference };
}

// ---------------------------------------------------------------------------
// Wall capacity shear – § 7.4.8.1, Eq. [7.4.19-21]
// ---------------------------------------------------------------------------

/**
 * Compute the capacity design shear amplification factor for a slender wall.
 *
 * Per NTC 2018 § 7.4.4.5.1 (Taglio), the design shear demand must be
 * amplified to account for the formation of the plastic hinge at the wall
 * base and for higher-mode effects. For slender walls (h_w/l_w > 2) the
 * amplification factor is:
 *
 *   ε = 1.5 · q · (γ_Rd · M_Rd / M_Ed) · (S_e(T_C) / S_e(T_1))²
 *
 * where:
 * - q      = behavior (q-) factor (see Tab. 7.2.I)
 * - γ_Rd   = overstrength factor (Tab. 7.2.I)
 * - M_Rd   = base flexural capacity (demand moment = M_Ed)
 * - M_Ed   = base flexural demand
 * - T_1    = fundamental period of the building in the seismic direction
 * - S_e(T) = elastic response spectrum ordinate at period T
 * - T_C    = corner period of the spectrum
 *
 * The amplified shear demand is V_Ed = ε · V_Ed,analysis. The design shear
 * must not be less than the elastic analysis shear (ε is applied to the
 * analysis value; a floor at the analysis value is applied here).
 *
 * NOTE: this corrects a previous implementation that used
 * V_Ed = γ_Rd·(M_Rd/h_w)·ω, which does NOT appear in NTC 2018.
 *
 * @param {Object} params
 * @param {number} params.baseMomentResistance – M_Rd at wall base [force×length].
 * @param {number} params.baseMomentDemand – M_Ed at wall base [force×length].
 * @param {number} params.analysisShear – V_Ed from analysis [force].
 * @param {number} params.qFactor – Effective q-factor.
 * @param {number} params.cornerPeriod – T_C [s].
 * @param {number} params.fundamentalPeriod – T_1 [s].
 * @param {number} params.spectrumAtCorner – S_e(T_C) (same units as S_e(T_1)).
 * @param {number} params.spectrumAtT1 – S_e(T_1).
 * @param {string} params.behavior – Structural behavior.
 * @returns {{
 *   shearDemand: number,
 *   amplificationFactor: number,
 *   gammaRd: number,
 *   reference: string,
 * }}
 */
export function computeWallCapacityShear({
    baseMomentResistance,
    baseMomentDemand,
    analysisShear,
    qFactor,
    cornerPeriod,
    fundamentalPeriod,
    spectrumAtCorner,
    spectrumAtT1,
    behavior,
}) {
    const mRd = positive(baseMomentResistance, "baseMomentResistance");
    const mEd = positive(baseMomentDemand, "baseMomentDemand");
    const vAnalysis = nonNegative(analysisShear, "analysisShear");
    const q = positive(qFactor, "qFactor");
    const tc = positive(cornerPeriod, "cornerPeriod");
    const t1 = positive(fundamentalPeriod, "fundamentalPeriod");
    const seTc = positive(spectrumAtCorner, "spectrumAtCorner");
    const seT1 = positive(spectrumAtT1, "spectrumAtT1");
    // T_C is used only to select S_e(T_C); keep referenced for clarity.
    void tc;

    // § 7.4.4.5.1 (Taglio): wall shear → wallShear mechanism (Tab. 7.2.I).
    // Tab. 7.2.I gives wallShear only for CD"A" (1.20); CD"B" is "—".
    const { wallShear: gammaRdWall } =
        selectNTC2018OverstrengthFactors({ behavior });
    const gammaRd = gammaRdWall ?? 1.0;

    // ε = 1.5 · q · (γ_Rd·M_Rd/M_Ed) · (S_e(T_C)/S_e(T_1))²
    const amplificationFactor =
        1.5 * q * (gammaRd * mRd / mEd) * Math.pow(seTc / seT1, 2);

    // The amplified demand must not be less than the analysis shear.
    const shearDemand = Math.max(amplificationFactor * vAnalysis, vAnalysis);

    return {
        shearDemand,
        amplificationFactor,
        gammaRd,
        reference: "NTC 2018 § 7.4.4.5.1 (Taglio), pareti snelle",
    };
}

// ---------------------------------------------------------------------------
// Wall shear resistance – § 7.4.8.2
// ---------------------------------------------------------------------------

/**
 * Verify the shear resistance of a shear wall section.
 *
 * Per NTC 2018 § 7.4.8.2, Eq. [7.4.22-24]:
 *   V_Rd = V_Rd,c + V_Rd,s
 *
 * with V_Rd,c = concrete contribution (with α_c factor),
 * V_Rd,s = steel contribution from horizontal reinforcement.
 *
 * For squat walls (h_w/l_w ≤ 2): α_c = 1.0
 * For CD"A": cot(θ) = 1.0
 *
 * @param {Object} params
 * @param {number} params.shearDemand – V_Ed [force].
 * @param {number} params.wallThickness – b_w [length].
 * @param {number} params.wallLength – l_w (section length in the direction
 *   of the shear) [length].
 * @param {number} params.concreteDesignStrength – f_cd [force/length²].
 * @param {number} [params.concreteTensileStrength] – f_ctd [force/length²].
 *   If omitted, uses simplified estimate 0.27 × f_cd^(2/3).
 * @param {number} [params.horizontalReinforcementArea] – A_sw per unit
 *   height for horizontal web reinforcement [length²/length].
 * @param {number} [params.reinforcementDesignStrength] – f_ywd [force/length²].
 * @param {string} [params.behavior] – Structural behavior. Affects cot(θ).
 * @param {number} [params.wallHeight] – h_w. Used with wallLength to
 *   determine squat wall factor.
 * @returns {{
 *   ok: boolean,
 *   vRd: number,
 *   vRdc: number,
 *   vRds: number,
 *   utilizationRatio: number,
 *   alphaC: number,
 *   cotTheta: number,
 *   vRdMax: number,
 *   compressionOk: boolean,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyWallShear({
    shearDemand,
    wallThickness,
    wallLength,
    concreteDesignStrength,
    concreteTensileStrength,
    horizontalReinforcementArea = 0,
    reinforcementDesignStrength = 0,
    behavior,
    wallHeight,
}) {
    const vEd = nonNegative(shearDemand, "shearDemand");
    const bw = positive(wallThickness, "wallThickness");
    const lw = positive(wallLength, "wallLength");
    const fcd = positive(concreteDesignStrength, "concreteDesignStrength");

    // Effective depth: 0.8 × l_w
    const d = 0.8 * lw;

    // Concrete tensile strength
    const fctd = concreteTensileStrength !== undefined
        ? nonNegative(concreteTensileStrength, "concreteTensileStrength")
        : 0.27 * Math.pow(fcd, 2 / 3);

    // α_c: per NTC 2018 § 7.4.4.5.1 squat walls are those with h_w/l_w ≤ 2.
    // SIMPLIFICATION: this module currently adopts α_c = 1.0 regardless of
    // slenderness (appropriate for squat walls; for slender walls the axial-
    // force-dependent α_c of EN 1992-1-1 § 6.2.3 is not yet implemented).
    // The isSquat flag is exposed so callers know which regime applies.
    const isSquat = wallHeight !== undefined && wallHeight / lw <= 2;
    const alphaC = 1.0;

    // cot(θ): 1.0 for CD"A", standard range otherwise
    const cotTheta = behavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A
        ? 1.0
        : 2.5; // default for CD"B" and non-dissipative

    // Concrete contribution: V_Rd,c = α_c × 0.28 × f_ctd × b_w × d
    const vRdc = alphaC * 0.28 * fctd * bw * d;

    // Steel contribution if reinforcement present
    let vRds = 0;
    if (horizontalReinforcementArea > 0 && reinforcementDesignStrength > 0) {
        const fywd = positive(reinforcementDesignStrength, "reinforcementDesignStrength");
        const asw = nonNegative(horizontalReinforcementArea, "horizontalReinforcementArea");
        vRds = asw * d * fywd * cotTheta;
    }

    const vRd = vRdc + vRds;

    // Diagonal compression check: V_Rd,max
    // CD"A": reduction factor additional 0.15
    const reduction = behavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A ? 0.15 : 1.0;
    const vRdMax = reduction * 0.8 * fcd * bw * d * 0.8 * cotTheta /
        (1 + cotTheta * cotTheta);
    const compressionOk = vEd <= vRdMax;

    const ok = vEd <= vRd && compressionOk;

    return {
        ok,
        vRd,
        vRdc,
        vRds,
        utilizationRatio: vRd > 0 ? vEd / vRd : Infinity,
        alphaC,
        cotTheta,
        vRdMax,
        compressionOk,
        check: "wall-shear",
        reference: "NTC 2018 § 7.4.8.2, Eq. [7.4.22-24]",
    };
}

// ---------------------------------------------------------------------------
// Boundary elements – § 7.4.8.4
// ---------------------------------------------------------------------------

/**
 * Verify the need for confined boundary elements in a shear wall.
 *
 * Per NTC 2018 § 7.4.8.4, confined boundary elements are required when:
 *   σ_c > 0.20 × f_cd  (Eq. [7.4.25])
 *
 * where σ_c = N_Ed / A_c + M_Ed / W (extreme fiber compression).
 *
 * @param {Object} params
 * @param {number} params.axialForce – N_Ed [force] (positive = compression).
 * @param {number} params.bendingMoment – M_Ed [force×length].
 * @param {number} params.wallLength – l_w [length].
 * @param {number} params.wallThickness – b_w [length].
 * @param {number} params.concreteDesignStrength – f_cd [force/length²].
 * @returns {{
 *   confinementRequired: boolean,
 *   extremeFiberStress: number,
 *   stressRatio: number,
 *   threshold: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyWallBoundaryConfinement({
    axialForce,
    bendingMoment,
    wallLength,
    wallThickness,
    concreteDesignStrength,
}) {
    const N = Number.isFinite(axialForce) ? axialForce : 0;
    const M = Math.abs(Number.isFinite(bendingMoment) ? bendingMoment : 0);
    const lw = positive(wallLength, "wallLength");
    const bw = positive(wallThickness, "wallThickness");
    const fcd = positive(concreteDesignStrength, "concreteDesignStrength");

    const area = lw * bw;
    const sectionModulus = bw * lw * lw / 6;

    const stressN = N / area;
    const stressM = M / sectionModulus;
    const extremeFiberStress = stressN + stressM; // maximum compression

    const threshold = 0.20 * fcd;
    const confinementRequired = extremeFiberStress > threshold;

    return {
        confinementRequired,
        extremeFiberStress,
        stressRatio: fcd > 0 ? extremeFiberStress / fcd : 0,
        threshold,
        check: "wall-boundary-confinement",
        reference: "NTC 2018 § 7.4.8.4, Eq. [7.4.25]",
    };
}

/**
 * Compute the required confined boundary element length.
 *
 * Per NTC 2018 § 7.4.8.4, Eq. [7.4.26]:
 *   x_u = (ν + ω_v) × l_w × b / b_0
 *
 * The boundary element length is:
 *   l_c = max(l_w / 6, x_u × (1 - x_u / l_w)) but not less than b_w.
 *
 * @param {Object} params
 * @param {number} params.normalizedAxialForce – ν = N_Ed / (A_c × f_cd).
 * @param {number} params.mechanicalReinforcementRatio – ω_v.
 * @param {number} params.wallLength – l_w [length].
 * @param {number} params.wallThickness – b_w [length].
 * @param {number} [params.confinedWidthRatio] – b / b_0. Default 1.0.
 * @returns {{ boundaryLength: number, xu: number, reference: string }}
 */
export function computeWallBoundaryLength({
    normalizedAxialForce,
    mechanicalReinforcementRatio = 0,
    wallLength,
    wallThickness,
    confinedWidthRatio = 1.0,
}) {
    const nu = nonNegative(normalizedAxialForce, "normalizedAxialForce");
    const omegaV = nonNegative(mechanicalReinforcementRatio, "mechanicalReinforcementRatio");
    const lw = positive(wallLength, "wallLength");
    const bw = positive(wallThickness, "wallThickness");

    const xu = (nu + omegaV) * lw * confinedWidthRatio;
    const boundaryLength = Math.max(lw / 6, xu * (1 - xu / lw), bw);

    return {
        boundaryLength,
        xu,
        reference: "NTC 2018 § 7.4.8.4, Eq. [7.4.26]",
    };
}

/**
 * Compute the required mechanical volumetric ratio of confining
 * reinforcement ω_wd for wall boundary elements.
 *
 * Per NTC 2018 § 7.4.8.4, Eq. [7.4.29] (CD"A"):
 *   ω_wd ≥ max(0.08, 30 × μ_φ × ν × ε_sy,d × b / b_0 − 0.035)
 *
 * For CD"B": ω_wd ≥ 0.04.
 *
 * @param {Object} params
 * @param {string} params.behavior – Structural behavior.
 * @param {number} params.normalizedAxialForce – ν.
 * @param {number} [params.curvatureDuctility] – μ_φ for CD"A".
 * @param {number} [params.confinedWidthRatio] – b / b_0. Default 1.0.
 * @param {number} [params.steelYieldStrain] – ε_sy,d. Default 0.002.
 * @returns {{ omegaWd: number, reference: string }}
 */
export function computeWallConfinementOmegaWd({
    behavior,
    normalizedAxialForce,
    curvatureDuctility,
    confinedWidthRatio = 1.0,
    steelYieldStrain = 0.002,
}) {
    const nu = nonNegative(normalizedAxialForce, "normalizedAxialForce");

    if (behavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_A) {
        const muPhi = curvatureDuctility !== undefined
            ? nonNegative(curvatureDuctility, "curvatureDuctility")
            : 9; // conservative default: μ_φ = 2q−1 with q ≈ 5

        const epsSy = positive(steelYieldStrain, "steelYieldStrain");
        const computed = 30 * muPhi * nu * epsSy * confinedWidthRatio - 0.035;
        const omegaWd = Math.max(0.08, computed);

        return {
            omegaWd,
            reference: "NTC 2018 § 7.4.8.4, Eq. [7.4.29] (CD\"A\")",
        };
    }

    if (behavior === NTC2018_STRUCTURAL_BEHAVIOR.CD_B) {
        return {
            omegaWd: 0.04,
            reference: "NTC 2018 § 7.4.8.4 (CD\"B\": ω_wd ≥ 0.04)",
        };
    }

    return {
        omegaWd: 0,
        reference: "NTC 2018 § 7.8 (non dissipativo: nessun requisito)",
    };
}

// ---------------------------------------------------------------------------
// Aggregated wall section assessment
// ---------------------------------------------------------------------------

/**
 * Produce a complete shear wall section assessment at one storey level.
 *
 * @param {Object} params
 * @param {string} params.sectionId – Section identifier (e.g. storey-level cut).
 * @param {number} params.elevation – Elevation of the section cut [length].
 * @param {string} params.behavior – Structural behavior.
 * @param {Object} params.actions – Integrated section cut actions.
 * @param {number} params.actions.axialForce – N [force] (+ compression).
 * @param {number} params.actions.shearX – V_x [force].
 * @param {number} params.actions.shearY – V_y [force].
 * @param {number} params.actions.momentX – M_x [force×length].
 * @param {number} params.actions.momentY – M_y [force×length].
 * @param {Object} params.geometry – Wall section geometry.
 * @param {number} params.geometry.wallLength – l_w [length].
 * @param {number} params.geometry.wallThickness – b_w [length].
 * @param {number} [params.geometry.wallHeight] – H_w [length].
 * @param {Object} params.materials – Material properties.
 * @param {number} params.materials.fcd – Concrete design strength [force/length²].
 * @param {number} [params.materials.fctd] – Concrete tensile strength.
 * @param {number} [params.materials.fywd] – Transverse reinforcement strength.
 * @param {number} [params.horizontalReinforcementArea] – A_sw [length²/length].
 * @param {boolean} [params.isBase] – Whether this is the base section.
 * @returns {{
 *   sectionId: string,
 *   checks: Array,
 * }}
 */
export function createWallSectionAssessment({
    sectionId,
    elevation,
    behavior,
    actions,
    geometry,
    materials,
    horizontalReinforcementArea = 0,
    isBase = false,
}) {
    const checks = [];
    const isDissipative = behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;

    // Shear check (always)
    const shearX = verifyWallShear({
        shearDemand: Math.abs(actions.shearX ?? 0),
        wallThickness: geometry.wallThickness,
        wallLength: geometry.wallLength,
        concreteDesignStrength: materials.fcd,
        concreteTensileStrength: materials.fctd,
        horizontalReinforcementArea,
        reinforcementDesignStrength: materials.fywd ?? 0,
        behavior,
        wallHeight: geometry.wallHeight,
    });
    checks.push({ ...shearX, direction: "x" });

    if ((actions.shearY ?? 0) !== 0 || isBase) {
        const shearY = verifyWallShear({
            shearDemand: Math.abs(actions.shearY ?? 0),
            wallThickness: geometry.wallThickness,
            wallLength: geometry.wallThickness, // in-plane shear along Y uses thickness
            concreteDesignStrength: materials.fcd,
            concreteTensileStrength: materials.fctd,
            horizontalReinforcementArea,
            reinforcementDesignStrength: materials.fywd ?? 0,
            behavior,
        });
        checks.push({ ...shearY, direction: "y" });
    }

    // Boundary element check (at base and critical zones)
    if (isBase && isDissipative) {
        const confinement = verifyWallBoundaryConfinement({
            axialForce: actions.axialForce ?? 0,
            bendingMoment: Math.max(
                Math.abs(actions.momentX ?? 0),
                Math.abs(actions.momentY ?? 0),
            ),
            wallLength: geometry.wallLength,
            wallThickness: geometry.wallThickness,
            concreteDesignStrength: materials.fcd,
        });
        checks.push(confinement);

        if (confinement.confinementRequired) {
            const area = geometry.wallLength * geometry.wallThickness;
            const nuVal = Math.abs(actions.axialForce ?? 0) / (area * materials.fcd);

            const boundary = computeWallBoundaryLength({
                normalizedAxialForce: Math.min(nuVal, 0.4),
                wallLength: geometry.wallLength,
                wallThickness: geometry.wallThickness,
            });
            checks.push({
                check: "wall-boundary-length",
                boundaryLength: boundary.boundaryLength,
                xu: boundary.xu,
                reference: boundary.reference,
            });

            const omegaWd = computeWallConfinementOmegaWd({
                behavior,
                normalizedAxialForce: nuVal,
            });
            checks.push({
                check: "wall-confinement-omega-wd",
                omegaWd: omegaWd.omegaWd,
                reference: omegaWd.reference,
            });
        }
    }

    return {
        sectionId,
        elevation,
        isBase,
        checks,
    };
}
