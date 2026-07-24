/**
 * NTC 2018 structural behavior module.
 *
 * Defines the user-chosen structural behavior (dissipative CD"A"/CD"B"
 * or non-dissipative) and all derived parameters that cascade into
 * subsequent verifications: overstrength factors, base q-factors,
 * allowed analysis methods.
 *
 * References:
 * - D.M. 17/01/2018 (NTC 2018): §§ 7.2.3, 7.3.1, 7.3.2, 7.3.2.1, 7.4.4, 7.8
 * - Circolare 21/01/2019 n. 7: C7.2.3, C7.3.2, C7.4.4, C7.8
 * - D.M. 52/2023: emendamenti ai §§ 7.3-7.4
 */

// ---------------------------------------------------------------------------
// Structural behavior (user choice)
// ---------------------------------------------------------------------------

/**
 * Structural behavior choices per NTC 2018 § 7.3.2 and § 7.8.
 *
 * - `non-dissipative`: § 7.8 – no capacity design, no ductility requirements.
 *   Allowed only in seismic zones 3-4 or when ag < 0.075g.
 * - `cd-a`: § 7.3.2 – high ductility class (Classe di Duttilità "A").
 * - `cd-b`: § 7.3.2 – medium ductility class (Classe di Duttilità "B").
 *
 * @readonly
 * @enum {string}
 */
export const NTC2018_STRUCTURAL_BEHAVIOR = Object.freeze({
    NON_DISSIPATIVE: "non-dissipative",
    CD_A: "cd-a",
    CD_B: "cd-b",
});

/**
 * Structural type per NTC 2018 § 7.3.3 and § 7.4.2.
 *
 * Determines the base q-factor from Tables 7.3.I-II and the applicable
 * capacity design rules.
 *
 * @readonly
 * @enum {string}
 */
export const NTC2018_STRUCTURAL_TYPE = Object.freeze({
    FRAME: "frame",
    WALL: "wall",
    COUPLED_WALL: "coupled-wall",
    DUAL: "dual",
    CORE: "core",
    TORSIONALLY_FLEXIBLE: "torsionally-flexible",
    INVERTED_PENDULUM: "inverted-pendulum",
});

/**
 * Plan regularity classification per NTC 2018 § 7.2.2.1.
 *
 * @readonly
 * @enum {string}
 */
export const NTC2018_PLAN_REGULARITY = Object.freeze({
    REGULAR: "regular",
    NON_REGULAR: "non-regular",
});

/**
 * Elevation regularity classification per NTC 2018 § 7.2.2.2.
 *
 * @readonly
 * @enum {string}
 */
export const NTC2018_ELEVATION_REGULARITY = Object.freeze({
    REGULAR: "regular",
    NON_REGULAR: "non-regular",
});

/**
 * Structural analysis methods per NTC 2018 § 7.2.3.
 *
 * @readonly
 * @enum {string}
 */
export const NTC2018_ANALYSIS_METHOD = Object.freeze({
    LINEAR_STATIC: "linear-static",
    LINEAR_DYNAMIC: "linear-dynamic",
    NONLINEAR_STATIC: "nonlinear-static",
    NONLINEAR_DYNAMIC: "nonlinear-dynamic",
});

// ---------------------------------------------------------------------------
// Reference metadata
// ---------------------------------------------------------------------------

/** @readonly */
export const NTC2018_STRUCTURAL_BEHAVIOR_REFERENCES = Object.freeze([
    {
        source: "NTC 2018",
        citation: "D.M. 17/01/2018, §§ 7.2.3, 7.3.1, 7.3.2, 7.3.2.1, 7.4.4, 7.8",
    },
    {
        source: "Circolare 2019",
        citation: "Circ. 21/01/2019 n. 7, C7.2.3, C7.3.2, C7.4.4, C7.8",
    },
    {
        source: "D.M. 52/2023",
        citation: "Emendamenti NTC 2018, §§ 7.3-7.4",
    },
]);

// ---------------------------------------------------------------------------
// Overstrength factors (Tab. 7.2.I)
// ---------------------------------------------------------------------------

/**
 * Overstrength factors γ_Rd per NTC 2018 Tab. 7.2.I (referenced by
 * § 7.4.4 Eq. [7.4.4], § 7.4.5 Eq. [7.4.5], § 7.4.6 Eq. [7.4.6-7],
 * § 7.4.4.5.1 for walls).
 *
 * Tab. 7.2.I is keyed by STRUCTURAL MATERIAL and MECHANISM (shear,
 * bending/axial-flexure, connections), NOT by "beam/column/joint".
 * Values for cast-in-place RC (c.a. gettata in opera):
 *
 * | mechanism                         | CD"A" | CD"B" |
 * |-----------------------------------|-------|-------|
 * | beams – shear                     | 1.20  | 1.10  |
 * | columns – bending (pressofless.)  | 1.30  | 1.30  |
 * | columns – shear                   | 1.30  | 1.10  |
 * | beam-column joints – shear        | 1.20  | 1.10  |
 * | walls – shear                     | 1.20  |  –    |
 *
 * NOTE: the "walls – shear" row has NO CD"B" value in Tab. 7.2.I (the norm
 * marks it "—"); slender-wall capacity shear is a CD"A" mechanism. The
 * caller must treat a missing value as not-applicable for CD"B".
 *
 * NOTE: a previous version of this module used a single {beam, column,
 * joint} triple per class with values {1.30, 1.30, 1.20} CD"A" /
 * {1.10, 1.10, 1.00} CD"B". That conflated mechanisms and used a wrong
 * joint CD"B" value (1.00 instead of 1.10).
 *
 * @readonly
 */
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
        wallShear: null, // Tab. 7.2.I: "—" (not applicable for CD"B")
    }),
});

// ---------------------------------------------------------------------------
// Base q-factors (Tab. 7.3.I, Tab. 7.3.II)
// ---------------------------------------------------------------------------

/**
 * Base q-factors q₀ per NTC 2018 Table 7.3.I (CD"B").
 *
 * For frame systems, q₀ = 3.5 × α_u/α₁ where α_u/α₁ = 1.3 by default
 * for multi-storey multi-bay frames (§ 7.3.2.1), yielding q₀ ≈ 3.9.
 * The consumer may override α_u/α₁ when justified by a pushover analysis.
 *
 * @readonly
 */
const Q0_CDB = Object.freeze({
    // Tab. 7.3.II, costruzioni di calcestruzzo (CD"B")
    frame: 3.0,                    // telaio (× α_u/α₁)
    wall: 3.0,                     // pareti non accoppiate
    "coupled-wall": 3.0,           // pareti accoppiate (× α_u/α₁)
    dual: 3.0,                     // miste (× α_u/α₁)
    core: 3.0,                     // pareti non accoppiate (nucleo)
    "torsionally-flexible": 2.0,   // deformabili torsionalmente
    "inverted-pendulum": 1.5,      // pendolo inverso
});

/**
 * Base q-factors q₀ per NTC 2018 Table 7.3.II (CD"A"), costruzioni di
 * calcestruzzo. Frame / coupled-wall / dual values are multiplied by
 * α_u/α₁ (§ 7.3.2.1); uncoupled walls are NOT.
 *
 * NOTE: previous values ({frame:3.5, wall:3.0, coupled-wall:3.0, dual:3.6,
 * core:2.0, inverted-pendulum:1.5} CD"B") did not match Tab. 7.3.II.
 *
 * @readonly
 */
const Q0_CDA = Object.freeze({
    // Tab. 7.3.II, costruzioni di calcestruzzo (CD"A")
    frame: 4.5,                    // telaio (× α_u/α₁)
    wall: 4.0,                     // pareti non accoppiate
    "coupled-wall": 4.5,           // pareti accoppiate (× α_u/α₁)
    dual: 4.5,                     // miste (× α_u/α₁)
    core: 4.0,                     // pareti non accoppiate (nucleo)
    "torsionally-flexible": 3.0,   // deformabili torsionalmente
    "inverted-pendulum": 2.0,      // pendolo inverso
});

/** @readonly */
export const NTC2018_BASE_Q_FACTORS = Object.freeze({
    "cd-a": Q0_CDA,
    "cd-b": Q0_CDB,
});

/**
 * Structural types whose q₀ is multiplied by α_u/α₁ per Tab. 7.3.II
 * (frame, coupled-wall and dual/mixed systems). Uncoupled walls, cores,
 * torsionally-flexible and inverted-pendulum systems do NOT apply α_u/α₁.
 *
 * @readonly
 */
const Q0_ALPHA_RATIO_TYPES = new Set(["frame", "coupled-wall", "dual"]);

/**
 * q-factor limits per limit state and behavior, NTC 2018 Tab. 7.3.I.
 *
 * - SLE (SLO, SLD): q = 1 for both dissipative and non-dissipative
 *   (SLD allows q ≤ 1.5).
 * - SLU (SLV): dissipative q ≥ 1.5; non-dissipative q ≤ 1.5.
 *
 * @readonly
 */
export const NTC2018_Q_LIMITS = Object.freeze({
    SLO: Object.freeze({ max: 1.0 }),
    SLD: Object.freeze({ max: 1.5 }),
    SLV: Object.freeze({
        dissipativeMin: 1.5,
        nonDissipativeMax: 1.5,
    }),
});

// ---------------------------------------------------------------------------
// Regularity reduction factor k_r (§ 7.3.1)
// ---------------------------------------------------------------------------

/**
 * Regularity reduction factor k_r per NTC 2018 § 7.3.1.
 *
 * k_r = 1.0 for regular in elevation, 0.8 for non-regular in elevation.
 * Applied to the effective q-factor: q = q₀ × k_r.
 *
 * @readonly
 */
export const NTC2018_REGULARITY_REDUCTION = Object.freeze({
    regular: 1.0,
    "non-regular": 0.8,
});

// ---------------------------------------------------------------------------
// Default frame overstrength ratio α_u/α₁ (§ 7.3.2.1)
// ---------------------------------------------------------------------------

/**
 * Default α_u/α₁ ratio for multi-storey multi-bay frames.
 *
 * Per NTC 2018 § 7.3.2.1, α_u/α₁ = 1.3 for multi-storey multi-bay frames
 * and 1.0 for single-storey frames. The consumer may provide a value
 * justified by pushover analysis.
 *
 * @readonly
 */
export const NTC2018_DEFAULT_FRAME_ALPHA_RATIO = 1.3;

/**
 * Default α_u/α₁ ratio for wall systems.
 *
 * Per NTC 2018 § 7.3.2.1, α_u/α₁ = 1.0 for wall systems.
 * May be increased to 1.2 if justified.
 *
 * @readonly
 */
export const NTC2018_DEFAULT_WALL_ALPHA_RATIO = 1.0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_BEHAVIORS = new Set(Object.values(NTC2018_STRUCTURAL_BEHAVIOR));
const VALID_TYPES = new Set(Object.values(NTC2018_STRUCTURAL_TYPE));

function validateEnum(value, allowed, label) {
    const raw = String(value ?? "").trim();
    // Strip quotes (smart and straight), hyphens, and normalize to lowercase
    // for matching. The canonical form is returned from the allowed set.
    const key = raw
        .replaceAll("\u201C", "")
        .replaceAll("\u201D", "")
        .replaceAll("\u2018", "")
        .replaceAll("\u2019", "")
        .replaceAll('"', "")
        .replaceAll("'", "")
        .replaceAll("-", "")
        .toLowerCase();

    // Build a lookup from stripped key to canonical value.
    for (const candidate of allowed) {
        const stripped = candidate.replaceAll("-", "").toLowerCase();
        if (stripped === key) {
            return candidate;
        }
    }

    throw new Error(
        `${label} must be one of [${[...allowed].join(", ")}]; got "${raw}".`,
    );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize and validate a structural behavior choice.
 *
 * @param {string} value - One of `non-dissipative`, `cd-a`, `cd-b`.
 * @returns {string} Normalized behavior.
 * @throws {Error} If the value is not a valid structural behavior.
 */
export function normalizeNTC2018StructuralBehavior(value) {
    return validateEnum(value, VALID_BEHAVIORS, "structuralBehavior");
}

/**
 * Normalize and validate a structural type.
 *
 * @param {string} value - One of `frame`, `wall`, `coupled-wall`, `dual`,
 *   `core`, `inverted-pendulum`.
 * @returns {string} Normalized structural type.
 * @throws {Error} If the value is not a valid structural type.
 */
export function normalizeNTC2018StructuralType(value) {
    return validateEnum(value, VALID_TYPES, "structuralType");
}

/**
 * Check whether non-dissipative behavior is admissible per § 7.8.1.
 *
 * Non-dissipative behavior is permitted only:
 * - in seismic zones 3 or 4, OR
 * - when ag < 0.075 g on subsoil A.
 *
 * @param {Object} params
 * @param {number} [params.seismicZone] - Zone 1-4 from hazard classification.
 * @param {number} [params.ag] - Design ground acceleration on subsoil A [g].
 * @returns {{ admissible: boolean, reason?: string }}
 */
export function checkNonDissipativeAdmissibility({
    seismicZone,
    ag,
} = {}) {
    if (seismicZone !== undefined) {
        const z = Number(seismicZone);
        if (!Number.isFinite(z) || z < 1 || z > 4 || !Number.isInteger(z)) {
            throw new Error(
                `seismicZone must be an integer between 1 and 4; got ${seismicZone}.`,
            );
        }
        if (z >= 3) {
            return { admissible: true };
        }
    }

    if (ag !== undefined) {
        const a = Number(ag);
        if (!Number.isFinite(a) || a < 0) {
            throw new Error(`ag must be a non-negative number; got ${ag}.`);
        }
        if (a < 0.075) {
            return { admissible: true };
        }
    }

    // Without seismic zone or ag, the caller is responsible for the check.
    // Return admissible=false only when both checks fail explicitly.
    if (seismicZone !== undefined && ag !== undefined) {
        return {
            admissible: false,
            reason: "Non-dissipative behavior requires seismic zone ≥ 3 or ag < 0.075 g (§ 7.8.1).",
        };
    }

    // Insufficient data: assume admissible but warn.
    return {
        admissible: true,
        warning: "Non-dissipative admissibility cannot be fully verified without seismic zone or ag.",
    };
}

/**
 * Select overstrength factors γ_Rd from NTC 2018 Tab. 7.2.I.
 *
 * Returns γ_Rd keyed by MECHANISM: `beamShear`, `columnBending`,
 * `columnShear`, `jointShear`, `wallShear`. For non-dissipative behavior
 * all factors are 1.0 (no capacity design). For CD"B", `wallShear` is
 * `null` because Tab. 7.2.I marks it "—" (not applicable).
 *
 * @param {Object} params
 * @param {string} params.behavior - Normalized structural behavior.
 * @returns {{ beamShear: number, columnBending: number, columnShear: number,
 *   jointShear: number, wallShear: number|null }}
 */
export function selectNTC2018OverstrengthFactors({ behavior }) {
    const b = normalizeNTC2018StructuralBehavior(behavior);

    if (b === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
        return Object.freeze({
            beamShear: 1.0,
            columnBending: 1.0,
            columnShear: 1.0,
            jointShear: 1.0,
            wallShear: 1.0,
        });
    }

    return NTC2018_OVERSTRENGTH_FACTORS[b];
}

/**
 * Select the base q-factor q₀ from NTC 2018 Tables 7.3.I-II.
 *
 * For frame and dual systems, q₀ may be multiplied by α_u/α₁
 * (§ 7.3.2.1). The default ratio is 1.3 for frames and 1.0 for walls.
 * Provide `alphaRatio` to override when justified by pushover analysis.
 *
 * For non-dissipative behavior, returns q₀ = 1.0.
 *
 * @param {Object} params
 * @param {string} params.behavior - Normalized structural behavior.
 * @param {string} params.structuralType - Normalized structural type.
 * @param {number} [params.alphaRatio] - α_u/α₁ ratio (§ 7.3.2.1).
 *   Defaults to 1.3 for frame/dual, 1.0 for wall/core/inverted-pendulum.
 * @returns {number} Base q-factor q₀.
 */
export function selectNTC2018BaseQFactor({
    behavior,
    structuralType,
    alphaRatio,
}) {
    const b = normalizeNTC2018StructuralBehavior(behavior);
    const type = normalizeNTC2018StructuralType(structuralType);

    if (b === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
        return 1.0;
    }

    const q0 = NTC2018_BASE_Q_FACTORS[b][type];

    // § 7.3.2.1: q₀ values apply to regular structures; the tables
    // already assume α_u/α₁ = 1.0. Only frame, coupled-wall and dual/mixed
    // systems apply the α_u/α₁ multiplier (Tab. 7.3.II); uncoupled walls,
    // cores, torsionally-flexible and inverted-pendulum systems do not.
    if (Q0_ALPHA_RATIO_TYPES.has(type)) {
        const ar = alphaRatio !== undefined
            ? Number(alphaRatio)
            : NTC2018_DEFAULT_FRAME_ALPHA_RATIO;

        if (!Number.isFinite(ar) || ar <= 0) {
            throw new Error(
                `alphaRatio must be a positive number; got ${alphaRatio}.`,
            );
        }

        return q0 * ar;
    }

    return q0;
}

/**
 * Compute the effective q-factor.
 *
 * q = q₀ × k_r  (NTC 2018 § 7.3.1, Eq. [7.3.1])
 *
 * k_r = 1.0 for regular elevation, 0.8 for non-regular elevation.
 *
 * For non-dissipative behavior, returns q = 1.0.
 *
 * @param {Object} params
 * @param {string} params.behavior - Normalized structural behavior.
 * @param {string} params.structuralType - Normalized structural type.
 * @param {string} params.elevationRegularity - `"regular"` or `"non-regular"`.
 * @param {number} [params.alphaRatio] - α_u/α₁ ratio (see selectNTC2018BaseQFactor).
 * @returns {number} Effective q-factor.
 */
export function computeNTC2018EffectiveQFactor({
    behavior,
    structuralType,
    elevationRegularity,
    alphaRatio,
}) {
    const b = normalizeNTC2018StructuralBehavior(behavior);

    if (b === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
        return 1.0;
    }

    const kr = NTC2018_REGULARITY_REDUCTION[
        validateEnum(
            elevationRegularity,
            new Set(Object.values(NTC2018_ELEVATION_REGULARITY)),
            "elevationRegularity",
        )
    ];

    const q0 = selectNTC2018BaseQFactor({
        behavior: b,
        structuralType,
        alphaRatio,
    });

    return q0 * kr;
}

/**
 * Determine allowed analysis methods per NTC 2018 § 7.2.3.
 *
 * - Linear static analysis: allowed only for regular elevation structures
 *   with T₁ ≤ min(2.5 TC, TD) in both principal directions.
 * - Linear dynamic analysis: always allowed.
 * - Nonlinear static analysis: requires non-regular elevation or
 *   T₁ > 2.5 TC.
 * - Nonlinear dynamic analysis: always allowed as a refinement.
 *
 * For non-dissipative behavior, linear static and linear dynamic are
 * always allowed; nonlinear methods are excluded by design intent.
 *
 * @param {Object} params
 * @param {string} params.behavior - Normalized structural behavior.
 * @param {string} params.planRegularity - `"regular"` or `"non-regular"`.
 * @param {string} params.elevationRegularity - `"regular"` or `"non-regular"`.
 * @param {number} [params.t1] - Fundamental period T₁ in the direction
 *   under consideration [s]. Required to validate linear static
 *   admissibility.
 * @param {number} [params.tc] - Spectrum period TC [s]. Required with t1.
 * @param {number} [params.td] - Spectrum period TD [s]. If omitted,
 *   only TC is used in the check (conservative).
 * @returns {{
 *   allowed: string[],
 *   recommended: string|null,
 *   linearStaticAllowed: boolean,
 *   checks: Array<{ check: string, ok: boolean, reference: string }>
 * }}
 */
export function selectNTC2018AllowedAnalysisMethods({
    behavior,
    planRegularity,
    elevationRegularity,
    t1,
    tc,
    td,
} = {}) {
    const b = normalizeNTC2018StructuralBehavior(behavior);
    const plan = validateEnum(
        planRegularity,
        new Set(Object.values(NTC2018_PLAN_REGULARITY)),
        "planRegularity",
    );
    const elev = validateEnum(
        elevationRegularity,
        new Set(Object.values(NTC2018_ELEVATION_REGULARITY)),
        "elevationRegularity",
    );

    const checks = [];
    const allowed = new Set();

    // Linear dynamic analysis is always allowed.
    allowed.add(NTC2018_ANALYSIS_METHOD.LINEAR_DYNAMIC);

    // Non-dissipative: only linear methods.
    if (b === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
        allowed.add(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC);
        return {
            allowed: [...allowed],
            recommended: NTC2018_ANALYSIS_METHOD.LINEAR_DYNAMIC,
            linearStaticAllowed: true,
            checks: [{
                check: "non-dissipative-methods",
                ok: true,
                reference: "NTC 2018 § 7.8",
            }],
        };
    }

    // § 7.2.3: Linear static analysis conditions
    let linearStaticAllowed = false;
    if (elev === NTC2018_ELEVATION_REGULARITY.REGULAR) {
        if (t1 !== undefined && tc !== undefined) {
            const t1Val = Number(t1);
            const tcVal = Number(tc);
            if (!Number.isFinite(t1Val) || t1Val <= 0) {
                throw new Error(`t1 must be a positive number; got ${t1}.`);
            }
            if (!Number.isFinite(tcVal) || tcVal <= 0) {
                throw new Error(`tc must be a positive number; got ${tc}.`);
            }

            const limit = td !== undefined
                ? Math.min(2.5 * tcVal, Number(td))
                : 2.5 * tcVal;

            linearStaticAllowed = t1Val <= limit;

            checks.push({
                check: "linear-static-period",
                ok: linearStaticAllowed,
                reference: "NTC 2018 § 7.2.3, Eq. [7.2.1]",
                t1: t1Val,
                limit,
            });
        } else {
            // Without period data, assume the check passes but mark as provisional.
            linearStaticAllowed = true;
            checks.push({
                check: "linear-static-period",
                ok: true,
                reference: "NTC 2018 § 7.2.3",
                warning: "T₁ not provided; linear static admissibility assumed.",
            });
        }
    }

    checks.push({
        check: "linear-static-regularity",
        ok: elev === NTC2018_ELEVATION_REGULARITY.REGULAR,
        reference: "NTC 2018 § 7.2.3 (regularità in altezza richiesta)",
    });

    if (linearStaticAllowed && elev === NTC2018_ELEVATION_REGULARITY.REGULAR) {
        allowed.add(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC);
    }

    // Nonlinear static: allowed for non-regular elevation or T₁ > 2.5 TC.
    // We include it if linear static is NOT allowed (as a recommended fallback),
    // but the caller can always request nonlinear methods.
    // Nonlinear methods are listed for reference but require a nonlinear solver
    // outside strutture-js.
    let recommended = NTC2018_ANALYSIS_METHOD.LINEAR_DYNAMIC;
    if (!linearStaticAllowed && elev === NTC2018_ELEVATION_REGULARITY.NON_REGULAR) {
        recommended = NTC2018_ANALYSIS_METHOD.LINEAR_DYNAMIC;
    }

    return {
        allowed: [...allowed],
        recommended,
        linearStaticAllowed: linearStaticAllowed &&
            elev === NTC2018_ELEVATION_REGULARITY.REGULAR,
        checks,
    };
}

/**
 * Create a complete structural behavior descriptor for propagation to
 * downstream verifiers.
 *
 * This is the single source of truth for the structural behavior choice.
 *
 * @param {Object} params
 * @param {string} params.behavior - `"non-dissipative"`, `"cd-a"`, or `"cd-b"`.
 * @param {string} params.structuralType - One of the NTC2018_STRUCTURAL_TYPE values.
 * @param {Object} [params.regularity] - Regularity assessment results.
 * @param {string} [params.regularity.plan] - `"regular"` or `"non-regular"`.
 * @param {string} [params.regularity.elevation] - `"regular"` or `"non-regular"`.
 * @param {number} [params.alphaRatio] - α_u/α₁ override.
 * @returns {{
 *   behavior: string,
 *   structuralType: string,
 *   isDissipative: boolean,
 *   ductilityClass: string|null,
 *   overstrengthFactors: { beam: number, column: number, joint: number },
 *   q0: number,
 *   q: number,
 *   kr: number,
 *   references: Array
 * }}
 */
export function createNTC2018StructuralBehavior({
    behavior,
    structuralType,
    regularity = {},
    alphaRatio,
}) {
    const b = normalizeNTC2018StructuralBehavior(behavior);
    const type = normalizeNTC2018StructuralType(structuralType);

    const overstrengthFactors = selectNTC2018OverstrengthFactors({ behavior: b });
    const q0 = selectNTC2018BaseQFactor({ behavior: b, structuralType: type, alphaRatio });

    const elev = regularity.elevation ?? NTC2018_ELEVATION_REGULARITY.REGULAR;
    const kr = NTC2018_REGULARITY_REDUCTION[
        validateEnum(
            elev,
            new Set(Object.values(NTC2018_ELEVATION_REGULARITY)),
            "regularity.elevation",
        )
    ];

    const q = b === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE
        ? 1.0
        : q0 * kr;

    return {
        behavior: b,
        structuralType: type,
        isDissipative: b !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
        ductilityClass: b === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE
            ? null
            : b === NTC2018_STRUCTURAL_BEHAVIOR.CD_A
                ? "CD\"A\""
                : "CD\"B\"",
        overstrengthFactors: { ...overstrengthFactors },
        q0,
        q,
        kr,
        references: NTC2018_STRUCTURAL_BEHAVIOR_REFERENCES,
    };
}
