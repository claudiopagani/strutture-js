/**
 * Global FEM to local member verification adapters.
 *
 * These functions bridge the GlobalFemDemandSet (extracted from
 * GlobalFemPostProcessingApplication) to the input contracts of the
 * existing local verifiers (SingleBeamDesignModel, ReinforcedConcreteColumnModel,
 * ReinforcedConcreteBeamColumnJointModel, ReinforcedConcreteIsolatedFootingModel).
 *
 * The local verifier kernels are NOT modified. These adapters only transform
 * data from the global format to the local format.
 *
 * References:
 * - NTC 2018 §§ 4.1.2.3.9, 7.4.4-7.4.7
 * - GlobalFemDemandSet v0 (see GlobalFemDemandExtractor)
 * - FemEntityMappingContract v0
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the component envelope extreme for a given component in a demand entry.
 *
 * @param {Object} demand - A lineElementDemands entry.
 * @param {string} component - Component name (e.g. "N", "Vy", "Vz", "My", "Mz", "T").
 * @param {"minimum"|"maximum"} extreme - Which extreme to extract.
 * @returns {{ value: number, reference: Object, location: Object } | null}
 */
function extremeValue(demand, component, extreme) {
    const env = demand.componentEnvelopes?.[component]?.[extreme];
    return env ?? null;
}

/**
 * Build a design action object for a line element from the demand set.
 *
 * Returns the combination-by-combination actions for the element, plus
 * envelopes.
 *
 * @param {Object} demand - A lineElementDemands entry.
 * @returns {{
 *   states: Array<{
 *     combinationId: string,
 *     loadCaseId: string|null,
 *     procedureId: string|null,
 *     stations: Array<{ xi: number, N: number, Vy: number, Vz: number, My: number, Mz: number, T: number }>
 *   }>,
 *   envelopes: { min: Object, max: Object }
 * }}
 */
export function collectLineElementDesignActions(demand) {
    if (!demand) return { states: [], envelopes: { min: {}, max: {} } };

    const states = (demand.actionStates ?? []).map((state) => ({
        combinationId: state.reference?.combinationId ?? null,
        loadCaseId: state.reference?.loadCaseId ?? null,
        procedureId: state.reference?.procedureId ?? null,
        stations: (state.stations ?? []).map((s) => ({
            xi: s.xi,
            N: s.actions?.N ?? 0,
            Vy: s.actions?.Vy ?? 0,
            Vz: s.actions?.Vz ?? 0,
            My: s.actions?.My ?? 0,
            Mz: s.actions?.Mz ?? 0,
            T: s.actions?.T ?? 0,
        })),
    }));

    const envelopes = { min: {}, max: {} };
    for (const comp of ["N", "Vy", "Vz", "My", "Mz", "T"]) {
        const minEntry = extremeValue(demand, comp, "minimum");
        const maxEntry = extremeValue(demand, comp, "maximum");
        if (minEntry) envelopes.min[comp] = minEntry;
        if (maxEntry) envelopes.max[comp] = maxEntry;
    }

    return { states, envelopes };
}

/**
 * Extract the co-linear moment (bending about the strong axis in the
 * local x-y plane) from a line element demand.
 *
 * In the typical beam convention:
 * - Mz is the strong-axis bending moment (about local z, in the x-y plane).
 * - My is the weak-axis bending moment.
 *
 * For a column, both My and Mz are significant (biaxial bending).
 *
 * @param {Object} demand - A lineElementDemands entry.
 * @param {"My"|"Mz"} component - Which moment component to extract.
 * @returns {Array<{ xi: number, value: number, combinationId: string|null }>}
 */
export function extractMomentSamples(demand, component = "Mz") {
    if (!demand?.actionStates) return [];
    return demand.actionStates.flatMap((state) =>
        (state.stations ?? []).map((s) => ({
            xi: s.xi,
            value: s.actions?.[component] ?? 0,
            combinationId: state.reference?.combinationId ?? null,
            loadCaseId: state.reference?.loadCaseId ?? null,
        })),
    );
}

/**
 * Extract the maximum absolute moment for capacity design purposes.
 *
 * Used by the capacity design orchestrator (WP4) to determine
 * M+ and M- at beam/column ends.
 *
 * @param {Object} demand - A lineElementDemands entry.
 * @param {number} endXi - 0 for start, 1 for end.
 * @param {string} component - "My" or "Mz".
 * @returns {{ positive: number, negative: number }}
 */
export function extractEndMoments(demand, endXi, component = "Mz") {
    const samples = extractMomentSamples(demand, component)
        .filter((s) => Math.abs(s.xi - endXi) <= 0.05);

    if (samples.length === 0) return { positive: 0, negative: 0 };

    let positive = 0;
    let negative = 0;
    for (const s of samples) {
        if (s.value > positive) positive = s.value;
        if (s.value < negative) negative = s.value;
    }

    return { positive, negative };
}

// ---------------------------------------------------------------------------
// Beam adapter
// ---------------------------------------------------------------------------

/**
 * Build the section+material descriptor expected by the local verifier
 * from the global model context.
 *
 * @param {Object} params
 * @param {Object} params.section - Domain section object (e.g. ReinforcedConcreteSection).
 * @param {Object} params.concreteMaterial - Domain concrete material.
 * @param {Object} params.reinforcementMaterial - Domain reinforcement material.
 * @returns {{ section: Object, material: Object }}
 */
export function buildBeamSectionMaterial({
    section,
    concreteMaterial,
    reinforcementMaterial,
}) {
    return {
        section: section ?? null,
        material: {
            concrete: concreteMaterial ?? null,
            reinforcement: reinforcementMaterial ?? null,
        },
    };
}

/**
 * Build the effective-length estimate for a column from frame geometry.
 *
 * Per NTC 2018 § 4.1.2.3.9.2, the effective length factor β can be
 * estimated from the end restraint conditions:
 * - β = 1.0 for sway frames (default for seismic)
 * - β = 0.7 for braced frames with fixed ends
 * - β = 2.0 for cantilever
 *
 * The consumer can override with explicit values.
 *
 * @param {Object} params
 * @param {string} params.memberId - Column member ID.
 * @param {Object} params.jointDemands - From demandSet.jointDemands.
 * @param {number} params.geometricLength - Column length between joint nodes.
 * @param {number} [params.betaX] - Override effective length factor for X.
 * @param {number} [params.betaY] - Override effective length factor for Y.
 * @returns {{ effectiveLengthMx: number, effectiveLengthMy: number, betaX: number, betaY: number }}
 */
export function estimateColumnEffectiveLengths({
    memberId,
    jointDemands,
    geometricLength,
    betaX = 1.0,
    betaY = 1.0,
}) {
    // In a sway frame (default assumption for seismic), β = 1.0.
    // More refined values require the full frame stiffness matrix,
    // which is outside the scope of this kernel.
    return {
        effectiveLengthMx: geometricLength * betaX,
        effectiveLengthMy: geometricLength * betaY,
        betaX,
        betaY,
    };
}

// ---------------------------------------------------------------------------
// Joint adapter
// ---------------------------------------------------------------------------

/**
 * Extract joint end actions from the demand set for a specific joint.
 *
 * Returns the column axial force and shear above the joint, and the
 * beam reinforcement areas must be supplied separately by the consumer
 * (armature automatiche sono escluse).
 *
 * @param {Object} params
 * @param {Object} params.jointDemand - A single entry from demandSet.jointDemands.
 * @param {Object} params.memberDemands - All memberDemands from the demand set,
 *   indexed by member ID for lookup.
 * @param {Object} params.mapping - The FemEntityMappingContract.
 * @returns {{
 *   columnAxialForce: number|null,
 *   columnShearAbove: number|null,
 *   beamMomentPositive: number,
 *   beamMomentNegative: number,
 * }}
 */
export function extractJointActions({
    jointDemand,
    memberDemands,
    mapping,
}) {
    if (!jointDemand?.complete) {
        return {
            columnAxialForce: null,
            columnShearAbove: null,
            beamMomentPositive: 0,
            beamMomentNegative: 0,
            incomplete: true,
        };
    }

    // Find column axial force from the column member's demand
    let columnAxialForce = null;
    let columnShearAbove = null;
    let beamMomentPositive = 0;
    let beamMomentNegative = 0;

    for (const end of jointDemand.lineElementEnds ?? []) {
        const member = mapping.members?.find((m) =>
            m.lineElementIds.includes(end.lineElementId),
        );
        if (!member) continue;

        const memberDemand = memberDemands?.find((md) => md.id === member.id);
        if (!memberDemand) continue;

        // Get the corresponding line element demand
        const lineDemand = memberDemand.elementDemands?.find((ld) =>
            ld.lineElementId === end.lineElementId,
        );
        if (!lineDemand) continue;

        const endXi = end.end === "start" ? 0 : 1;

        if (member.role === "column") {
            // Extract axial force and shear at the joint end
            const samples = extractMomentSamples(lineDemand, "Mz");
            const endSamples = samples.filter((s) => Math.abs(s.xi - endXi) <= 0.05);

            if (endSamples.length > 0) {
                // Use the maximum compression from envelopes
                const nEnv = extremeValue(lineDemand, "N", "maximum");
                columnAxialForce = nEnv?.value ?? 0;
            }

            // Shear: use the envelope at end
            const vyEnv = lineDemand.componentEnvelopes?.Vy;
            if (vyEnv) {
                const extreme = endXi === 0 ? vyEnv.minimum : vyEnv.maximum;
                columnShearAbove = extreme?.value ?? 0;
            }
        }

        if (member.role === "beam") {
            const moments = extractEndMoments(lineDemand, endXi, "Mz");
            beamMomentPositive = Math.max(beamMomentPositive, moments.positive);
            beamMomentNegative = Math.min(beamMomentNegative, moments.negative);
        }
    }

    return {
        columnAxialForce,
        columnShearAbove,
        beamMomentPositive,
        beamMomentNegative,
        incomplete: false,
    };
}

// ---------------------------------------------------------------------------
// Footing adapter
// ---------------------------------------------------------------------------

/**
 * Extract base reactions for a footing from global FEM results.
 *
 * The footing is associated with a support node. Reactions from
 * the global results are the forces that the support exerts ON
 * the structure. For footing design, we need the opposite (the
 * action of the structure ON the footing).
 *
 * @param {Object} params
 * @param {string} params.nodeId - The support node ID.
 * @param {Object} params.globalResponses - From demandSet.globalResponses.reactions.
 * @param {string} [params.signConvention] - Sign convention of reactions.
 *   Expected: "support-action-on-structure". Footing action is the opposite.
 * @returns {{
 *   verticalForce: number,
 *   horizontalX: number,
 *   horizontalY: number,
 *   momentX: number,
 *   momentY: number,
 * }}
 */
export function extractFootingActions({
    nodeId,
    globalResponses,
    signConvention = "support-action-on-structure",
}) {
    const reactions = (globalResponses?.reactions ?? [])
        .filter((r) => r.nodeId === nodeId);

    if (reactions.length === 0) {
        return {
            verticalForce: 0,
            horizontalX: 0,
            horizontalY: 0,
            momentX: 0,
            momentY: 0,
            warning: `No reactions found for node ${nodeId}.`,
        };
    }

    // Use the envelope values (max vertical, max moment)
    let maxFz = 0, maxFx = 0, maxFy = 0, maxMx = 0, maxMy = 0;

    for (const reaction of reactions) {
        // Contract uses lowercase forces.{x,y,z} and moments.{x,y,z};
        // accept legacy uppercase aliases for robustness.
        const fx = reaction.forces?.x ?? reaction.forces?.Fx ?? 0;
        const fy = reaction.forces?.y ?? reaction.forces?.Fy ?? 0;
        const fz = reaction.forces?.z ?? reaction.forces?.Fz ?? 0;
        const mx = reaction.moments?.x ?? reaction.moments?.Mx ?? 0;
        const my = reaction.moments?.y ?? reaction.moments?.My ?? 0;

        if (Math.abs(fz) > Math.abs(maxFz)) maxFz = fz;
        if (Math.abs(fx) > Math.abs(maxFx)) maxFx = fx;
        if (Math.abs(fy) > Math.abs(maxFy)) maxFy = fy;
        if (Math.abs(mx) > Math.abs(maxMx)) maxMx = mx;
        if (Math.abs(my) > Math.abs(maxMy)) maxMy = my;
    }

    // Invert sign: reactions are support→structure, footing needs structure→support
    const invert = signConvention === "support-action-on-structure" ? -1 : 1;

    return {
        verticalForce: maxFz * invert,
        horizontalX: maxFx * invert,
        horizontalY: maxFy * invert,
        momentX: maxMx * invert,
        momentY: maxMy * invert,
    };
}

// ---------------------------------------------------------------------------
// Column action adapter
// ---------------------------------------------------------------------------

/**
 * Extract column design actions from the demand set.
 *
 * Returns the governing axial force and biaxial moments for the column
 * member, ready to be passed to ReinforcedConcreteColumnModel.actions.
 *
 * @param {Object} params
 * @param {Object} params.memberDemand - A single entry from demandSet.memberDemands.
 * @param {string} [params.governingCombinationId] - If provided, extracts
 *   actions for that specific combination instead of envelopes.
 * @returns {{
 *   nEd: number,
 *   mxEd: number,
 *   myEd: number,
 *   vxEd: number,
 *   vyEd: number,
 *   combinationId: string|null,
 * }}
 */
export function extractColumnDesignActions({
    memberDemand,
    governingCombinationId,
} = {}) {
    if (!memberDemand?.elementDemands?.length) {
        return { nEd: 0, mxEd: 0, myEd: 0, vxEd: 0, vyEd: 0, combinationId: null };
    }

    // Use the first element demand (columns are typically single elements)
    const demand = memberDemand.elementDemands[0];

    if (governingCombinationId) {
        // Extract from a specific combination
        const state = (demand.actionStates ?? []).find(
            (s) => s.reference?.combinationId === governingCombinationId,
        );
        if (state?.stations?.length) {
            // Use mid-height station
            const mid = state.stations.reduce((a, b) =>
                Math.abs(a.xi - 0.5) < Math.abs(b.xi - 0.5) ? a : b,
            );
            return {
                nEd: mid.actions?.N ?? 0,
                mxEd: mid.actions?.Mz ?? 0,
                myEd: mid.actions?.My ?? 0,
                vxEd: mid.actions?.Vy ?? 0,
                vyEd: mid.actions?.Vz ?? 0,
                combinationId: governingCombinationId,
            };
        }
    }

    // Use envelopes: max compression with concurrent moments
    const nMax = extremeValue(demand, "N", "maximum");
    const mxMax = extremeValue(demand, "Mz", "maximum");
    const myMax = extremeValue(demand, "My", "maximum");
    const vxMax = extremeValue(demand, "Vy", "maximum");
    const vyMax = extremeValue(demand, "Vz", "maximum");

    return {
        nEd: nMax?.value ?? 0,
        mxEd: mxMax?.value ?? 0,
        myEd: myMax?.value ?? 0,
        vxEd: vxMax?.value ?? 0,
        vyEd: vyMax?.value ?? 0,
        combinationId: nMax?.reference?.combinationId ?? null,
    };
}

// ---------------------------------------------------------------------------
// Beam action adapter
// ---------------------------------------------------------------------------

/**
 * Extract beam design actions from the demand set for all combinations.
 *
 * Returns an array of action states suitable for building SingleBeamAnalysis
 * load cases and combinations.
 *
 * @param {Object} params
 * @param {Object} params.memberDemand - A single entry from demandSet.memberDemands.
 * @returns {Array<{
 *   combinationId: string,
 *   stations: Array<{ xi: number, N: number, Vy: number, Vz: number, My: number, Mz: number, T: number }>
 * }>}
 */
export function extractBeamDesignActions({ memberDemand } = {}) {
    if (!memberDemand?.elementDemands?.length) return [];
    const demand = memberDemand.elementDemands[0];

    return (demand.actionStates ?? []).map((state) => ({
        combinationId: state.reference?.combinationId ?? "unknown",
        loadCaseId: state.reference?.loadCaseId ?? null,
        procedureId: state.reference?.procedureId ?? null,
        stations: (state.stations ?? []).map((s) => ({
            xi: s.xi,
            N: s.actions?.N ?? 0,
            Vy: s.actions?.Vy ?? 0,
            Vz: s.actions?.Vz ?? 0,
            My: s.actions?.My ?? 0,
            Mz: s.actions?.Mz ?? 0,
            T: s.actions?.T ?? 0,
        })),
    }));
}
