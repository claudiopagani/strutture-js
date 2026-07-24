/**
 * D.M. 52/2023 amendments to NTC 2018.
 *
 * Provides updated constants and overrides introduced by the
 * D.M. 7 marzo 2023 amendments to the NTC 2018. Each override
 * declares its source explicitly and does not silently replace
 * the base NTC 2018 values.
 *
 * References:
 * - D.M. 52 del 07/03/2023 – Emendamenti alle NTC 2018
 * - D.M. 17/01/2018 (NTC 2018) – testo base
 */

// ---------------------------------------------------------------------------
// Reference metadata
// ---------------------------------------------------------------------------

/** @readonly */
export const DM522023_REFERENCES = Object.freeze([
    {
        source: "D.M. 52/2023",
        citation: "D.M. 7 marzo 2023 – Emendamenti alle Norme Tecniche per le Costruzioni 2018",
    },
    {
        source: "NTC 2018",
        citation: "D.M. 17/01/2018 – testo base con sovrascritture",
    },
]);

// ---------------------------------------------------------------------------
// Updated reinforcement steel grades
// ---------------------------------------------------------------------------

/**
 * Additional reinforcement steel grades introduced by D.M. 52/2023.
 *
 * B450C was already present in NTC 2018; B600 is new.
 * Properties include characteristic yield strength f_yk [MPa],
 * characteristic tensile strength f_tk [MPa], ductility class,
 * and elongation at maximum force ε_uk.
 *
 * @readonly
 */
export const DM522023_REINFORCEMENT_STEEL_GRADES = Object.freeze({
    B450C: Object.freeze({
        fyk: 450,
        ftk: 540,
        ductilityClass: "C",
        elongationCharacteristic: 0.075,
        dm522023Note: "Confermato da NTC 2018; invariato dal D.M. 52/2023.",
    }),
    B600: Object.freeze({
        fyk: 600,
        ftk: 720,
        ductilityClass: "C",
        elongationCharacteristic: 0.075,
        dm522023Note: "Nuovo grado introdotto dal D.M. 52/2023.",
    }),
});

// ---------------------------------------------------------------------------
// Partial safety factors – D.M. 52/2023
// ---------------------------------------------------------------------------

/**
 * Partial safety factors for materials per D.M. 52/2023.
 *
 * These may override the base NTC 2018 values. The base values
 * remain in ntc2018ActionParameters.js; this module provides the
 * amended values for reference and explicit override.
 *
 * @readonly
 */
export const DM522023_MATERIAL_PARTIAL_FACTORS = Object.freeze({
    concrete: Object.freeze({
        /** Partial factor for concrete in ULS (persistent/transient) */
        gammaC: 1.5,
        /** Partial factor for concrete in accidental/seismic */
        gammaCAccidental: 1.2,
    }),
    reinforcement: Object.freeze({
        /** Partial factor for reinforcing steel in ULS */
        gammaS: 1.15,
        /** Partial factor for reinforcing steel in accidental/seismic */
        gammaSAccidental: 1.0,
    }),
});

// ---------------------------------------------------------------------------
// Detailing amendments
// ---------------------------------------------------------------------------

/**
 * Minimum longitudinal reinforcement ratio for columns in CD"A"
 * per D.M. 52/2023 amendments to § 7.4.6.2.1.
 *
 * @readonly
 */
export const DM522023_COLUMN_MIN_LONGITUDINAL_RATIO = Object.freeze({
    "cd-a": 0.01,  // unchanged from NTC 2018 base
    "cd-b": 0.01,  // unchanged
    "non-dissipative": 0.008,
});

/**
 * Maximum longitudinal reinforcement ratio for columns.
 *
 * @readonly
 */
export const DM522023_COLUMN_MAX_LONGITUDINAL_RATIO = 0.04;

/**
 * Minimum transverse reinforcement (hoop) diameter for columns
 * in critical zones, per D.M. 52/2023.
 *
 * @readonly
 */
export const DM522023_COLUMN_MIN_HOOP_DIAMETER = Object.freeze({
    "cd-a": 8,   // mm
    "cd-b": 6,   // mm
    "non-dissipative": 6,  // mm
});

/**
 * Maximum hoop spacing in column critical zones.
 *
 * @readonly
 */
export const DM522023_COLUMN_MAX_HOOP_SPACING = Object.freeze({
    "cd-a": Object.freeze({
        baseFormula: "min(6 × φ_long, 0.25 × min(b, h), 175 mm)",
        absoluteMax: 175,  // mm
    }),
    "cd-b": Object.freeze({
        baseFormula: "min(8 × φ_long, 0.25 × min(b, h), 225 mm)",
        absoluteMax: 225,  // mm
    }),
});

// ---------------------------------------------------------------------------
// Concrete confinement requirements
// ---------------------------------------------------------------------------

/**
 * Mechanical volumetric ratio of confining reinforcement ω_wd
 * for column ends, per D.M. 52/2023 § 7.4.6.2.2.
 *
 * The required ω_wd depends on the ductility class and the
 * normalized axial force ν = N_Ed / (A_c × f_cd).
 *
 * @param {Object} params
 * @param {string} params.behavior – Structural behavior.
 * @param {number} params.normalizedAxialForce – ν = N_Ed / (A_c × f_cd).
 * @param {number} [params.requiredCurvatureDuctility] – μ_φ for CD"A".
 *   Defaults to a conservative value if not provided.
 * @returns {{ omegaWd: number, reference: string }}
 */
export function computeDM522023ConfinementOmegaWd({
    behavior,
    normalizedAxialForce,
    requiredCurvatureDuctility,
}) {
    const nu = Number(normalizedAxialForce);
    if (!Number.isFinite(nu) || nu < 0) {
        throw new Error(
            `normalizedAxialForce must be non-negative; got ${normalizedAxialForce}.`,
        );
    }

    if (behavior === "cd-a") {
        // CD"A": Eq. [7.4.29] – higher confinement demand
        // ω_wd ≥ max(0.08, 30 × μ_φ × ν × ε_sy,d − 0.035)
        const muPhi = requiredCurvatureDuctility !== undefined
            ? Number(requiredCurvatureDuctility)
            : 2 * 5.0 - 1; // conservative: q = 5.0 → μ_φ = 2q − 1 = 9

        if (!Number.isFinite(muPhi) || muPhi < 0) {
            throw new Error(
                `requiredCurvatureDuctility must be non-negative; got ${requiredCurvatureDuctility}.`,
            );
        }

        // ε_sy,d = f_yd / E_s ≈ 450/1.15 / 200000 ≈ 0.00196
        const epsSyDesign = 0.002;
        const computed = 30 * muPhi * nu * epsSyDesign - 0.035;
        const omegaWd = Math.max(0.08, computed);

        return {
            omegaWd,
            reference: "D.M. 52/2023, NTC 2018 § 7.4.6.2.2, Eq. [7.4.29]",
        };
    }

    if (behavior === "cd-b") {
        // CD"B": simpler requirement
        const omegaWd = Math.max(0.04, 0.08 * nu);

        return {
            omegaWd,
            reference: "D.M. 52/2023, NTC 2018 § 7.4.6.2.2 (CD\"B\")",
        };
    }

    // Non-dissipative: no confinement requirement
    return {
        omegaWd: 0,
        reference: "D.M. 52/2023 – nessun requisito di confinamento per strutture non dissipative",
    };
}

// ---------------------------------------------------------------------------
// Apply amendments to a material catalog
// ---------------------------------------------------------------------------

/**
 * Merge D.M. 52/2023 steel grades into an existing catalog.
 *
 * Does not mutate the input. Returns a new frozen object.
 *
 * @param {Object} baseGrades – Base catalog (e.g., NTC2018_REINFORCEMENT_STEEL_GRADES).
 * @returns {Object} Merged catalog (frozen).
 */
export function applyDM522023SteelGrades(baseGrades) {
    return Object.freeze({
        ...baseGrades,
        ...DM522023_REINFORCEMENT_STEEL_GRADES,
    });
}

/**
 * Return the appropriate partial factor for a material and design situation.
 *
 * @param {Object} params
 * @param {"concrete"|"reinforcement"} params.material – Material type.
 * @param {"persistent"|"accidental"|"seismic"} [params.designSituation] – Design situation.
 *   Defaults to "persistent".
 * @param {boolean} [params.useDM522023] – Whether to use D.M. 52/2023 factors.
 *   Defaults to true.
 * @returns {number} Partial factor γ.
 */
export function selectDM522023PartialFactor({
    material,
    designSituation = "persistent",
    useDM522023 = true,
}) {
    if (!useDM522023) {
        // Return base NTC 2018 values
        if (material === "concrete") return 1.5;
        if (material === "reinforcement") return 1.15;
        throw new Error(`Unknown material: ${material}.`);
    }

    const factors = DM522023_MATERIAL_PARTIAL_FACTORS[material];
    if (!factors) {
        throw new Error(`Unknown material: ${material}.`);
    }

    if (designSituation === "accidental" || designSituation === "seismic") {
        return factors.gammaCAccidental ?? factors.gammaSAccidental;
    }

    return factors.gammaC ?? factors.gammaS;
}
