/**
 * NTC 2018 diaphragm (solaio/diaframma) verification module.
 *
 * Verifies floor slabs acting as horizontal diaphragms per § 7.4.8.5.
 * The diaphragm transfers seismic storey forces to the vertical
 * resisting systems through in-plane membrane action.
 *
 * The membrane resultants (nxx, nyy, nxy) come from the external FEM
 * solver via the shellResultants contract in GlobalFemResultContract.
 *
 * References:
 * - D.M. 17/01/2018 (NTC 2018): §§ 4.1.2.3.5, 7.4.8.5
 * - Circolare 21/01/2019 n. 7: C7.4.8.5
 */

// ---------------------------------------------------------------------------
// Reference metadata
// ---------------------------------------------------------------------------

/** @readonly */
export const NTC2018_DIAPHRAGM_REFERENCES = Object.freeze([
    {
        source: "NTC 2018",
        citation: "D.M. 17/01/2018, §§ 4.1.2.3.5, 7.4.8.5",
    },
    {
        source: "Circolare 2019",
        citation: "Circ. 21/01/2019 n. 7, C7.4.8.5",
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

// ---------------------------------------------------------------------------
// Diaphragm diagonal tension – § 4.1.2.3.5
// ---------------------------------------------------------------------------

/**
 * Verify the diaphragm against diagonal tension (trazione diagonale).
 *
 * The in-plane shear V produces a diagonal tension field. The check is:
 *   σ_t = V / (b × h) ≤ f_ctd
 *
 * where b = diaphragm thickness, h = diaphragm depth (wall-to-wall distance).
 *
 * @param {Object} params
 * @param {number} params.storeyShear – V: in-plane shear force [force].
 * @param {number} params.thickness – b: slab thickness [length].
 * @param {number} params.depth – h: diaphragm depth in the shear direction [length].
 * @param {number} params.concreteTensileStrength – f_ctd [force/length²].
 * @returns {{
 *   ok: boolean,
 *   tensileStress: number,
 *   capacity: number,
 *   utilizationRatio: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyDiaphragmDiagonalTension({
    storeyShear,
    thickness,
    depth,
    concreteTensileStrength,
}) {
    const V = Math.abs(storeyShear ?? 0);
    const b = positive(thickness, "thickness");
    const h = positive(depth, "depth");
    const fctd = positive(concreteTensileStrength, "concreteTensileStrength");

    const tensileStress = V / (b * h);

    return {
        ok: tensileStress <= fctd,
        tensileStress,
        capacity: fctd,
        utilizationRatio: fctd > 0 ? tensileStress / fctd : Infinity,
        check: "diaphragm-diagonal-tension",
        reference: "NTC 2018 § 4.1.2.3.5, § 7.4.8.5",
    };
}

// ---------------------------------------------------------------------------
// Diaphragm compression strut – § 4.1.2.3.5
// ---------------------------------------------------------------------------

/**
 * Verify the diaphragm against diagonal compression (puntoni compressi).
 *
 *   σ_c = 2 × V / (b × h) ≤ 0.5 × f_cd
 *
 * @param {Object} params
 * @param {number} params.storeyShear – V [force].
 * @param {number} params.thickness – b [length].
 * @param {number} params.depth – h [length].
 * @param {number} params.concreteDesignStrength – f_cd [force/length²].
 * @returns {{
 *   ok: boolean,
 *   compressiveStress: number,
 *   capacity: number,
 *   utilizationRatio: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyDiaphragmCompression({
    storeyShear,
    thickness,
    depth,
    concreteDesignStrength,
}) {
    const V = Math.abs(storeyShear ?? 0);
    const b = positive(thickness, "thickness");
    const h = positive(depth, "depth");
    const fcd = positive(concreteDesignStrength, "concreteDesignStrength");

    const compressiveStress = 2 * V / (b * h);
    const capacity = 0.5 * fcd;

    return {
        ok: compressiveStress <= capacity,
        compressiveStress,
        capacity,
        utilizationRatio: capacity > 0 ? compressiveStress / capacity : Infinity,
        check: "diaphragm-compression",
        reference: "NTC 2018 § 4.1.2.3.5, § 7.4.8.5",
    };
}

// ---------------------------------------------------------------------------
// Diaphragm chord reinforcement – § 7.4.8.5
// ---------------------------------------------------------------------------

/**
 * Compute the required chord (cordolo) reinforcement for a diaphragm.
 *
 * Per NTC 2018 § 7.4.8.5, the perimeter chord must resist the
 * tension from in-plane bending:
 *   A_s ≥ V / f_yd  (perimeter)
 *   A_s,min = 0.003 × A_c  (minimum for chords)
 *
 * @param {Object} params
 * @param {number} params.storeyShear – V [force].
 * @param {number} params.concreteArea – A_c: chord cross-sectional area [length²].
 * @param {number} params.reinforcementDesignStrength – f_yd [force/length²].
 * @returns {{
 *   requiredArea: number,
 *   minimumArea: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function computeDiaphragmChordReinforcement({
    storeyShear,
    concreteArea,
    reinforcementDesignStrength,
}) {
    const V = Math.abs(storeyShear ?? 0);
    const Ac = positive(concreteArea, "concreteArea");
    const fyd = positive(reinforcementDesignStrength, "reinforcementDesignStrength");

    const requiredArea = V / fyd;
    const minimumArea = 0.003 * Ac;

    return {
        requiredArea: Math.max(requiredArea, minimumArea),
        minimumArea,
        check: "diaphragm-chord-reinforcement",
        reference: "NTC 2018 § 7.4.8.5",
    };
}

// ---------------------------------------------------------------------------
// Diaphragm shear connection – § 7.4.8.5
// ---------------------------------------------------------------------------

/**
 * Verify the shear connection at construction joints in the diaphragm.
 *
 *   τ = V / (b × z) ≤ 0.30 × f_cd
 *
 * where z is the internal lever arm (≈ 0.9 × d for slabs).
 *
 * @param {Object} params
 * @param {number} params.storeyShear – V [force].
 * @param {number} params.thickness – b [length].
 * @param {number} params.leverArm – z: internal lever arm [length].
 * @param {number} params.concreteDesignStrength – f_cd [force/length²].
 * @returns {{
 *   ok: boolean,
 *   shearStress: number,
 *   capacity: number,
 *   utilizationRatio: number,
 *   check: string,
 *   reference: string,
 * }}
 */
export function verifyDiaphragmShearConnection({
    storeyShear,
    thickness,
    leverArm,
    concreteDesignStrength,
}) {
    const V = Math.abs(storeyShear ?? 0);
    const b = positive(thickness, "thickness");
    const z = positive(leverArm, "leverArm");
    const fcd = positive(concreteDesignStrength, "concreteDesignStrength");

    const shearStress = V / (b * z);
    const capacity = 0.30 * fcd;

    return {
        ok: shearStress <= capacity,
        shearStress,
        capacity,
        utilizationRatio: capacity > 0 ? shearStress / capacity : Infinity,
        check: "diaphragm-shear-connection",
        reference: "NTC 2018 § 7.4.8.5 (taglio connessione giunti di ripresa)",
    };
}

// ---------------------------------------------------------------------------
// Aggregated diaphragm assessment
// ---------------------------------------------------------------------------

/**
 * Produce a complete diaphragm assessment for one storey.
 *
 * @param {Object} params
 * @param {string} params.storeyId
 * @param {number} params.storeyShearX – V_x [force].
 * @param {number} [params.storeyShearY] – V_y [force].
 * @param {number} params.thickness – Slab thickness [length].
 * @param {number} params.depthX – Diaphragm depth in X direction [length].
 * @param {number} [params.depthY] – Diaphragm depth in Y direction [length].
 * @param {Object} params.materials
 * @param {number} params.materials.fcd – f_cd [force/length²].
 * @param {number} [params.materials.fctd] – f_ctd [force/length²].
 * @param {number} [params.materials.fyd] – f_yd for chord reinforcement.
 * @param {number} [params.chordConcreteArea] – A_c for chord [length²].
 * @param {number} [params.leverArm] – z for shear connection [length].
 * @returns {{
 *   storeyId: string,
 *   checks: Array,
 * }}
 */
export function createDiaphragmAssessment({
    storeyId,
    storeyShearX,
    storeyShearY,
    thickness,
    depthX,
    depthY,
    materials,
    chordConcreteArea,
    leverArm,
}) {
    const checks = [];

    // Diagonal tension X
    if (materials.fctd !== undefined) {
        const tensionX = verifyDiaphragmDiagonalTension({
            storeyShear: storeyShearX,
            thickness,
            depth: depthX,
            concreteTensileStrength: materials.fctd,
        });
        checks.push({ ...tensionX, direction: "x" });
    }

    // Compression X
    const compX = verifyDiaphragmCompression({
        storeyShear: storeyShearX,
        thickness,
        depth: depthX,
        concreteDesignStrength: materials.fcd,
    });
    checks.push({ ...compX, direction: "x" });

    // Y direction if provided
    if (storeyShearY !== undefined && depthY !== undefined) {
        if (materials.fctd !== undefined) {
            const tensionY = verifyDiaphragmDiagonalTension({
                storeyShear: storeyShearY,
                thickness,
                depth: depthY,
                concreteTensileStrength: materials.fctd,
            });
            checks.push({ ...tensionY, direction: "y" });
        }

        const compY = verifyDiaphragmCompression({
            storeyShear: storeyShearY,
            thickness,
            depth: depthY,
            concreteDesignStrength: materials.fcd,
        });
        checks.push({ ...compY, direction: "y" });
    }

    // Chord reinforcement (worst direction)
    if (materials.fyd !== undefined && chordConcreteArea !== undefined) {
        const maxShear = Math.max(
            Math.abs(storeyShearX ?? 0),
            Math.abs(storeyShearY ?? 0),
        );
        const chord = computeDiaphragmChordReinforcement({
            storeyShear: maxShear,
            concreteArea: chordConcreteArea,
            reinforcementDesignStrength: materials.fyd,
        });
        checks.push(chord);
    }

    // Shear connection
    if (leverArm !== undefined) {
        const maxShear = Math.max(
            Math.abs(storeyShearX ?? 0),
            Math.abs(storeyShearY ?? 0),
        );
        const connection = verifyDiaphragmShearConnection({
            storeyShear: maxShear,
            thickness,
            leverArm,
            concreteDesignStrength: materials.fcd,
        });
        checks.push(connection);
    }

    return {
        storeyId,
        checks,
    };
}
