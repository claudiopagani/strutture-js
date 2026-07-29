/**
 * Reinforced Concrete Building Verification Application.
 *
 * Coordinates the NTC 2018 checks for an ordinary cast-in-place RC building
 * from global FEM contracts. Complete results require every readiness family
 * and every applicable local verifier. The FEM solver remains external.
 *
 * Pipeline:
 *   1. Contract validation
 *   2. Structural classification (delegated to GlobalFemPostProcessing)
 *   3. Demand extraction
 *   4. Regularity assessment (WP2)
 *   5. Per-member beam/column verifications (kernel locali esistenti)
 *   6. Joint verifications (kernel locale esistente)
 *   7. Capacity design (WP4)
 *   8. Displacement checks (WP5)
 *   9. Aggregate results → VerificationResult building-level
 *
 * Missing project data or local verification families produce a non-positive
 * result. A positive result is possible only when the executable normative
 * coverage inventory is complete and no readiness assessment is blocked.
 *
 * References:
 * - NTC 2018 §§ 4.1, 7.2-7.4
 * - GlobalFemDemandSet v0
 * - FemEntityMappingContract v0
 */

import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import {
    RESULT_STATUS,
    RESULT_STATUS_NOT_IMPLEMENTED,
    RESULT_STATUS_NOT_VERIFIED,
} from "../../core/results/resultStatus.js";

import {
    collectConcurrentJointActionStates,
    collectConcurrentMemberActionStates,
    collectConcurrentSectionCutStates,
    collectConcurrentSurfaceResultantStates,
    projectJointActionStatesToResistanceAxes,
    projectMemberActionStatesToResistanceAxes,
    projectWallSectionCutStatesToResistanceAxes,
    validateFemCapabilitiesContract,
    validateFemEntityMappingContract,
    validateGlobalFemAnalysisContract,
    validateGlobalFemModelContract,
    validateGlobalFemResultContract,
} from "../../domain/fem/index.js";
import {
    GLOBAL_FEM_POSTPROCESSING_PROFILES,
    GlobalFemPostProcessingApplication,
} from "../global-fem-postprocessing/index.js";

import {
    NTC2018_STRUCTURAL_BEHAVIOR,
    createNTC2018StructuralBehavior,
    normalizeNTC2018StructuralBehavior,
    normalizeNTC2018StructuralType,
} from "../../norms/ntc2018/reinforced-concrete/structuralBehavior.js";
import {
    createNTC2018RegularityAssessment,
} from "../../norms/ntc2018/reinforced-concrete/structuralRegularity.js";
import {
    createCapacityDesignAssessment,
    verifyBeamColumnHierarchy,
} from "../../norms/ntc2018/reinforced-concrete/capacityDesign.js";
import {
    createDisplacementAssessment,
} from "../../norms/ntc2018/reinforced-concrete/displacementChecks.js";
import {
    createNTC2018LinearDynamicAssessment,
} from "../../norms/ntc2018/seismicAnalysisChecks.js";
import { withNormativeReferences } from "../../norms/normativeReference.js";
import {
    NTC2018_RC_CHAPTER_4_REFERENCES,
    NTC2018_RC_CHAPTER_7_4_REFERENCES,
    NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../../norms/ntc2018/normativeReferences.js";
import {
    verifyWallBiaxialBending,
} from "./wallBiaxialVerification.js";
import {
    runWallSystemVerifications,
} from "./wallSystemVerification.js";
import {
    runSlabSystemVerifications,
} from "./slabSystemVerification.js";
import {
    runFoundationSystemVerifications,
} from "./foundationSystemVerification.js";
import {
    evaluateNTC2018RcBuildingCompleteness,
    getNTC2018RcBuildingCoverage,
} from "./ntc2018RcBuildingCoverage.js";

// ---------------------------------------------------------------------------
// Application metadata
// ---------------------------------------------------------------------------

const APP_ID = "rc-building-verification";
const APP_VERSION = "0.2.0";
const APP_DOMAIN = "reinforced-concrete";
const APP_CODES = ["ntc2018"];
const APP_TAGS = [
    "rc",
    "building",
    "global-fem",
    "verification",
    "ntc2018",
    "capacity-design",
];
const APP_MATURITY = "complete";

// ---------------------------------------------------------------------------
// Contract validation helpers
// ---------------------------------------------------------------------------

function extractValidationErrors(...results) {
    const errors = [];
    const warnings = [];
    for (const r of results) {
        if (r && !r.ok) {
            errors.push(...(r.errors ?? []));
        }
        if (r?.warnings) {
            warnings.push(...r.warnings);
        }
    }
    return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Storey data extraction from FEM model
// ---------------------------------------------------------------------------

/**
 * Build storey displacement data from the FEM model and mapping.
 *
 * The consumer must provide storey geometry and the extractable FEM
 * results are embedded in the demand set. This function builds the
 * StoreyDisplacementData array expected by WP5.
 *
 * @param {Object} params
 * @param {Object} params.model – GlobalFemModelContract.
 * @param {Object} params.mapping – FemEntityMappingContract.
 * @param {Object} [params.result] – GlobalFemResultContract for displacements.
 * @returns {Array}
 */
function buildStoreyDisplacementData({ model, mapping, result }) {
    const storeys = mapping?.storeys ?? [];
    if (storeys.length === 0) return [];

    // Nodal displacements lookup (contract uses lowercase translations.{x,y,z}).
    const nodalDisp = new Map();
    for (const entry of result?.results?.nodalDisplacements ?? []) {
        nodalDisp.set(entry.nodeId, entry);
    }

    // Storey resultants lookup (shear Fx/Fy, vertical Fz per storey).
    const storeyResultBySid = new Map();
    for (const entry of result?.results?.storeyResults ?? []) {
        if (!storeyResultBySid.has(entry.storeyId)) {
            storeyResultBySid.set(entry.storeyId, entry);
        }
    }

    // Storey elevations from the model (mapping storeys reference model storeys).
    const modelStoreyById = new Map(
        (model?.storeys ?? []).map((s) => [s.id ?? s.storeyId, s]),
    );
    const elevationOf = (storey) => {
        const ms = modelStoreyById.get(storey.storeyId ?? storey.id);
        return storey.elevation ?? ms?.elevation;
    };

    // Cumulative weight above each storey (sum of |Fz| of storeys above,
    // including the current one). Base index 0 = lowest storey.
    const storeyWeightAbove = (index) => {
        let w = 0;
        for (let i = index; i < storeys.length; i++) {
            const sr = storeyResultBySid.get(storeys[i].storeyId ?? storeys[i].id);
            const fz = sr?.resultants?.Fz;
            if (Number.isFinite(fz)) w += Math.abs(fz);
        }
        return w > 0 ? w : undefined;
    };

    return storeys.map((storey, index) => {
        const sid = storey.storeyId ?? storey.id ?? `storey-${index}`;
        const storeyNodes = storey.nodeIds ?? [];
        const belowStorey = index > 0 ? (storeys[index - 1]?.nodeIds ?? []) : [];

        const avg = (nodeIds) => {
            let sumX = 0, sumY = 0, cx = 0, cy = 0;
            for (const nodeId of nodeIds) {
                const d = nodalDisp.get(nodeId);
                if (Number.isFinite(d?.translations?.x)) { sumX += d.translations.x; cx++; }
                if (Number.isFinite(d?.translations?.y)) { sumY += d.translations.y; cy++; }
            }
            return { x: cx > 0 ? sumX / cx : undefined, y: cy > 0 ? sumY / cy : undefined };
        };

        const top = avg(storeyNodes);
        const below = avg(belowStorey);

        const thisElev = elevationOf(storey);
        const belowElev = index > 0 ? elevationOf(storeys[index - 1]) : 0;
        const height = storey.height ??
            (Number.isFinite(thisElev) && Number.isFinite(belowElev)
                ? thisElev - belowElev
                : undefined);

        const sr = storeyResultBySid.get(sid);
        const shearX = sr?.resultants?.Fx;
        const shearY = sr?.resultants?.Fy;

        return {
            storeyId: sid,
            height: Number.isFinite(height) && height > 0 ? height : undefined,
            displacementX: top.x,
            displacementXBelow: below.x,
            displacementY: top.y,
            displacementYBelow: below.y,
            // Populated from storeyResults.resultants when available; omitted
            // (undefined) otherwise so the P-Delta check auto-skips.
            weight: storeyWeightAbove(index),
            shearX: Number.isFinite(shearX) && shearX > 0 ? shearX : undefined,
            shearY: Number.isFinite(shearY) && shearY > 0 ? shearY : undefined,
        };
    });
}

// ---------------------------------------------------------------------------
// Readiness evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate what verifications are possible given the available data.
 *
 * @param {Object} params
 * @param {Object} params.contracts – Validated contracts.
 * @param {Object} params.input – Raw input.
 * @returns {Array<{ assessment: string, status: string, missing: string[] }>}
 */
function evaluateReadiness({
    contracts,
    input,
    demandSet = null,
    behaviorDescriptor = null,
    behaviorError = null,
    linearDynamicAssessment = null,
    linearDynamicError = null,
}) {
    const assessments = [];
    const hasMapping = contracts.mapping?.ok ?? false;
    const hasResult = contracts.result?.ok ?? false;
    const hasBehavior = input.behavior != null;
    const hasStoreys = (input.mapping?.storeys?.length ?? 0) > 0;
    const hasRegularityInput =
        input.regularityAssessmentInput?.planInput != null &&
        input.regularityAssessmentInput?.elevationInput != null;
    const hasDisplacementInput = input.displacementAssessmentInput != null;

    assessments.push({
        assessment: "structural-behavior",
        status: behaviorDescriptor ? "ready" : "blocked",
        missing: [
            ...(input.behavior == null ? ["behavior"] : []),
            ...(input.structuralType == null ? ["structuralType"] : []),
            ...(behaviorError ? ["valid structural behavior parameters"] : []),
        ],
        reason: behaviorError,
    });

    // Regularity
    assessments.push({
        assessment: "structural-regularity",
        status: hasMapping && hasStoreys && hasRegularityInput ? "ready" : "blocked",
        missing: [
            ...(!hasMapping ? ["mapping"] : []),
            ...(!hasStoreys ? ["storeys"] : []),
            ...(!hasRegularityInput ? ["regularityAssessmentInput"] : []),
        ],
    });

    // Capacity design
    assessments.push({
        assessment: "capacity-design",
        status: behaviorDescriptor?.behavior ===
            NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE
                ? "not-applicable"
                : behaviorDescriptor
                    ? "ready"
                    : "blocked",
        missing: !hasBehavior
            ? ["behavior"]
            : behaviorDescriptor
                ? []
                : ["complete structural behavior descriptor"],
    });

    // Displacement checks
    assessments.push({
        assessment: "displacement-checks",
        status: hasMapping && hasStoreys && hasResult && hasDisplacementInput
            ? "ready"
            : "blocked",
        missing: [
            ...(!hasMapping ? ["mapping"] : []),
            ...(!hasStoreys ? ["storeys"] : []),
            ...(!hasResult ? ["result"] : []),
            ...(!hasDisplacementInput ? ["displacementAssessmentInput"] : []),
        ],
    });

    // Member verification (beam/column via consumer-provided verifiers)
    const hasMemberVerifiers =
        input.memberVerifiers != null &&
        (typeof input.memberVerifiers.beam === "function" ||
            typeof input.memberVerifiers.column === "function");
    const hasMemberDemands = (demandSet?.memberDemands?.length ?? 0) > 0;
    const mappedMembers = input.mapping?.members ?? [];
    const membersHaveAxisMappings =
        mappedMembers.length > 0 &&
        mappedMembers.every((member) =>
            Array.isArray(member.lineActionMappings) &&
            member.lineActionMappings.length === member.lineElementIds.length);
    assessments.push({
        assessment: "member-verification",
        status:
            hasMemberVerifiers &&
            hasMemberDemands &&
            membersHaveAxisMappings
                ? "ready"
                : "blocked",
        missing: [
            ...(!hasMemberVerifiers ? ["memberVerifiers"] : []),
            ...(!hasMemberDemands ? ["globalFemDemandSet.memberDemands"] : []),
            ...(!membersHaveAxisMappings
                ? ["mapping.members.*.lineActionMappings"]
                : []),
        ],
    });

    const modalInput = input.linearDynamicAssessmentInput;
    const modalMissing = linearDynamicAssessment?.missing ?? [
        ...(modalInput == null
            ? ["linearDynamicAssessmentInput"]
            : []),
        ...(modalInput?.modalProcedureId == null
            ? ["linearDynamicAssessmentInput.modalProcedureId"]
            : []),
        ...(modalInput?.responseSpectrumProcedureId == null
            ? ["linearDynamicAssessmentInput.responseSpectrumProcedureId"]
            : []),
        ...(modalInput?.meanPlanDimensions == null
            ? ["linearDynamicAssessmentInput.meanPlanDimensions"]
            : []),
    ];
    assessments.push({
        assessment: "linear-dynamic-analysis",
        status: linearDynamicAssessment?.complete === true
            ? "ready"
            : "blocked",
        missing: linearDynamicAssessment?.complete === true
            ? []
            : [...new Set(modalMissing)],
        reason: linearDynamicError,
    });

    // Beam-column joint hierarchy verification (WP4)
    const hasHierarchyData =
        input.jointHierarchy != null &&
        Object.keys(input.jointHierarchy).length > 0;
    assessments.push({
        assessment: "beam-column-hierarchy",
        status: behaviorDescriptor?.behavior ===
            NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE
                ? "not-applicable"
                : hasHierarchyData
                    ? "ready"
                    : "blocked",
        missing:
            behaviorDescriptor?.behavior ===
                NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE ||
            hasHierarchyData
                ? []
                : ["jointHierarchy"],
    });

    const hasJointVerifier = typeof input.jointVerifier === "function";
    const hasJointDemands = (demandSet?.jointDemands?.length ?? 0) > 0;
    assessments.push({
        assessment: "joint-verification",
        status: hasJointVerifier && hasJointDemands ? "ready" : "blocked",
        missing: [
            ...(!hasJointVerifier ? ["jointVerifier"] : []),
            ...(!hasJointDemands ? ["globalFemDemandSet.jointDemands"] : []),
        ],
    });

    const mappedWalls = input.mapping?.walls ?? [];
    const hasWallSectionStateVerifier =
        typeof input.wallSectionStateVerifier === "function";
    const wallsHaveSystemData =
        mappedWalls.length > 0 &&
        mappedWalls.every((wall) => {
            const data = input.wallSystemData?.[wall.id];
            return data?.detailingInput != null &&
                Array.isArray(data.couplingBeamInputs) &&
                typeof data.systemType === "string" &&
                typeof data.redistributionApplied === "boolean" &&
                Array.isArray(data.additionalChecks);
        });
    const completeWallSystemInput =
        hasWallSectionStateVerifier && wallsHaveSystemData;
    const wallsHaveSectionAndActionMapping =
        mappedWalls.length > 0 &&
        mappedWalls.every((wall) => {
            const data = input.wallSections?.[wall.id];
            return data?.section != null &&
                Array.isArray(wall.sectionCutActionMappings) &&
                wall.sectionCutActionMappings.length ===
                    wall.sectionCutIds.length &&
                (data.actions != null ||
                    typeof data.selectActionsFromFem === "function");
        });
    assessments.push({
        assessment: "wall-biaxial-verification",
        status: completeWallSystemInput
            ? "covered-by-wall-system"
            : wallsHaveSectionAndActionMapping
                ? "ready"
                : "blocked",
        missing: completeWallSystemInput ||
            wallsHaveSectionAndActionMapping
            ? []
            : [
                "mapping.walls.*.sectionCutActionMappings",
                "wallSections.*.section",
                "wallSections.*.actions|selectActionsFromFem",
            ],
    });

    assessments.push({
        assessment: "wall-system-verification",
        status: hasWallSectionStateVerifier && wallsHaveSystemData
            ? "ready"
            : "blocked",
        missing: [
            ...(!hasWallSectionStateVerifier
                ? ["wallSectionStateVerifier"]
                : []),
            ...(!wallsHaveSystemData
                ? [
                    "wallSystemData.*.detailingInput",
                    "wallSystemData.*.couplingBeamInputs",
                    "wallSystemData.*.systemType",
                    "wallSystemData.*.redistributionApplied",
                    "wallSystemData.*.additionalChecks",
                ]
                : []),
        ],
    });

    const mappedSlabs = input.mapping?.slabs ?? [];
    const slabsHaveAxisMappings =
        mappedSlabs.length > 0 &&
        mappedSlabs.every((slab) =>
            Array.isArray(slab.shellResultantMappings) &&
            slab.shellResultantMappings.length ===
                slab.shellElementIds.length);
    const slabsHaveSystemData =
        mappedSlabs.length > 0 &&
        mappedSlabs.every((slab) => {
            const data = input.slabSystemData?.[slab.id];
            return Array.isArray(data?.detailingChecks) &&
                typeof data?.punchingRequired === "boolean" &&
                typeof data?.diaphragmRequired === "boolean";
        });
    assessments.push({
        assessment: "slab-punching-diaphragm-verification",
        status:
            typeof input.slabStateVerifier === "function" &&
            slabsHaveAxisMappings &&
            slabsHaveSystemData
                ? "ready"
                : "blocked",
        missing: [
            ...(typeof input.slabStateVerifier !== "function"
                ? ["slabStateVerifier"]
                : []),
            ...(!slabsHaveAxisMappings
                ? ["mapping.slabs.*.shellResultantMappings"]
                : []),
            ...(!slabsHaveSystemData
                ? [
                    "slabSystemData.*.detailingChecks",
                    "slabSystemData.*.punchingRequired",
                    "slabSystemData.*.diaphragmRequired",
                ]
                : []),
        ],
    });

    const mappedFoundations = input.mapping?.foundations ?? [];
    const foundationsHaveMappings =
        mappedFoundations.length > 0 &&
        mappedFoundations.every((foundation) =>
            Array.isArray(foundation.supportReactionMappings) &&
            foundation.supportReactionMappings.length ===
                foundation.supportNodeIds.length);
    const foundationsHaveData =
        mappedFoundations.length > 0 &&
        mappedFoundations.every((foundation) =>
            input.foundationSystemData?.[foundation.id] != null);
    assessments.push({
        assessment: "foundation-system-verification",
        status:
            typeof input.foundationVerifier === "function" &&
            foundationsHaveMappings &&
            foundationsHaveData
                ? "ready"
                : "blocked",
        missing: [
            ...(typeof input.foundationVerifier !== "function"
                ? ["foundationVerifier"]
                : []),
            ...(!foundationsHaveMappings
                ? [
                    "mapping.foundations.*.supportReactionMappings",
                ]
                : []),
            ...(!foundationsHaveData
                ? ["foundationSystemData"]
                : []),
        ],
    });

    return assessments;
}

// ---------------------------------------------------------------------------
// Member verification (WP3/WP6): delegate to consumer-provided verifiers
// ---------------------------------------------------------------------------

/**
 * Run per-member beam/column verifications.
 *
 * The library does NOT auto-generate member sections, materials or
 * reinforcement (explicitly out of scope per AGENTS.md). Instead, the
 * consumer injects `memberVerifiers` — plain functions that receive the
 * member descriptor and return a VerificationResult-like object. This
 * keeps the local kernels untouched and the orchestrator generic.
 *
 * @param {Object} params
 * @param {Array} params.members – FemEntityMappingContract members.
 * @param {Object} params.memberVerifiers – `{ beam?: fn, column?: fn }`.
 * @param {Object} params.memberData – Optional per-member extra data by id.
 * @param {Object} params.context – Shared context (behavior, q, units).
 * @returns {Array}
 */
function runMemberVerifications({
    members,
    memberVerifiers,
    memberData,
    demandSet,
    context,
}) {
    const results = [];
    for (const member of members ?? []) {
        const role = member.role;
        const verifier = memberVerifiers?.[role];
        if (typeof verifier !== "function") {
            results.push({
                memberId: member.id,
                role,
                status: "not-analyzed",
                reason: `No verifier injected for role "${role}".`,
            });
            continue;
        }
        const memberDemand = demandSet?.memberDemands?.find(
            (item) => item.id === member.id,
        );
        const concurrentActionStates = memberDemand
            ? collectConcurrentMemberActionStates(memberDemand)
            : [];
        if (!memberDemand || concurrentActionStates.length === 0) {
            results.push({
                memberId: member.id,
                role,
                status: "not-analyzed",
                reason: "No concurrent GlobalFemDemandSet action states are available.",
            });
            continue;
        }
        try {
            const concurrentResistanceActionStates =
                projectMemberActionStatesToResistanceAxes({
                    member,
                    states: concurrentActionStates,
                });
            const outcome = verifier({
                member,
                data: memberData?.[member.id] ?? null,
                demand: {
                    schema: "strutture-js/rc-member-fem-demand-context",
                    version: 0,
                    units: demandSet.units,
                    signConventions: demandSet.signConventions,
                    memberDemand,
                    concurrentActionStates,
                    concurrentResistanceActionStates,
                },
                context,
            });
            results.push({
                memberId: member.id,
                role,
                status: outcome?.status ?? "not-verified",
                utilizationRatio: outcome?.utilizationRatio ?? null,
                checks: outcome?.checks ?? [],
                outputs: outcome?.outputs ?? null,
            });
        } catch (error) {
            results.push({
                memberId: member.id,
                role,
                status: "failed",
                reason: error?.message ?? String(error),
            });
        }
    }
    return results;
}

function runJointVerifications({
    joints,
    members,
    jointVerifier,
    jointData,
    demandSet,
    context,
}) {
    const results = [];
    for (const joint of joints ?? []) {
        if (typeof jointVerifier !== "function") {
            results.push({
                jointId: joint.id,
                status: "not-analyzed",
                reason: "No jointVerifier was supplied.",
            });
            continue;
        }

        const jointDemand = demandSet?.jointDemands?.find(
            (item) => item.jointId === joint.id,
        );
        const concurrentActionStates = jointDemand
            ? collectConcurrentJointActionStates(jointDemand)
            : [];
        if (!jointDemand || concurrentActionStates.length === 0) {
            results.push({
                jointId: joint.id,
                status: "not-analyzed",
                reason: "No concurrent GlobalFemDemandSet joint states are available.",
            });
            continue;
        }

        try {
            const concurrentResistanceActionStates =
                projectJointActionStatesToResistanceAxes({
                    members,
                    states: concurrentActionStates,
                });
            const outcome = jointVerifier({
                joint,
                data: jointData?.[joint.id] ?? null,
                demand: {
                    schema: "strutture-js/rc-joint-fem-demand-context",
                    version: 0,
                    units: demandSet.units,
                    signConventions: demandSet.signConventions,
                    jointDemand,
                    concurrentActionStates,
                    concurrentResistanceActionStates,
                },
                context,
            });
            results.push({
                jointId: joint.id,
                status: outcome?.status ?? "not-verified",
                utilizationRatio: outcome?.utilizationRatio ?? null,
                checks: outcome?.checks ?? [],
                outputs: outcome?.outputs ?? null,
            });
        } catch (error) {
            results.push({
                jointId: joint.id,
                status: "failed",
                reason: error?.message ?? String(error),
            });
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Beam-column joint hierarchy (WP4)
// ---------------------------------------------------------------------------

/**
 * Verify the beam-column hierarchy for each joint with provided data.
 *
 * @param {Object} params
 * @param {Array} params.joints – FemEntityMappingContract joints.
 * @param {Object} params.jointHierarchy – Per-joint hierarchy data by id:
 *   `{ [jointId]: { beamMomentResistances: number[],
 *                   columnMomentResistances: number[],
 *                   isTopStoreyColumnJoint?: boolean } }`.
 * @param {string} params.behavior – Structural behavior.
 * @returns {Array}
 */
function runJointHierarchyVerifications({ joints, jointHierarchy, behavior }) {
    const results = [];
    for (const joint of joints ?? []) {
        if (behavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
            results.push({
                jointId: joint.id,
                status: "not-applicable",
                reason:
                    "Beam-column resistance hierarchy is not applied to non-dissipative design.",
            });
            continue;
        }
        const data = jointHierarchy?.[joint.id];
        if (!data) {
            results.push({
                jointId: joint.id,
                status: "not-analyzed",
                reason: "No hierarchy data provided for this joint.",
            });
            continue;
        }
        try {
            const outcome = verifyBeamColumnHierarchy({ ...data, behavior });
            results.push({
                jointId: joint.id,
                status: outcome.ok ? "ok" : "not-verified",
                utilizationRatio: outcome.utilizationRatio,
                demand: outcome.demand,
                capacity: outcome.capacity,
                check: outcome.check,
                reference: outcome.reference,
                metadata: outcome.metadata,
            });
        } catch (error) {
            results.push({
                jointId: joint.id,
                status: "failed",
                reason: error?.message ?? String(error),
            });
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Shear-wall biaxial bending (SETTI-2)
// ---------------------------------------------------------------------------

/**
 * Verify each wall in biaxial bending at the base section.
 *
 * The consumer provides per-wall section + materials + base actions
 * (`wallSections`). Sections, materials and reinforcement are NOT
 * auto-generated (per AGENTS.md boundaries).
 *
 * @param {Object} params
 * @param {Array} params.walls – FemEntityMappingContract walls.
 * @param {Object} params.wallSections – `{ [wallId]: { section, actions:
 *   { axialForce, momentX, momentY }, concreteDesignStrength,
 *   reinforcementDesignStrength, ... } }`.
 * @returns {Array}
 */
function runWallBiaxialVerifications({ walls, wallSections, demandSet }) {
    const results = [];
    for (const wall of walls ?? []) {
        const data = wallSections?.[wall.id];
        if (!data?.section) {
            results.push({
                wallId: wall.id,
                status: "not-analyzed",
                reason: "No section/actions provided for this wall.",
            });
            continue;
        }
        const surfaceDemand = demandSet?.surfaceDemands?.find(
            (item) => item.id === wall.id,
        );
        const femDemand = {
            schema: "strutture-js/rc-wall-fem-demand-context",
            version: 0,
            units: demandSet?.units ?? null,
            signConventions: demandSet?.signConventions ?? null,
            surfaceDemand: surfaceDemand ?? null,
            concurrentShellResultantStates: surfaceDemand
                ? collectConcurrentSurfaceResultantStates(surfaceDemand)
                : [],
            concurrentSectionCutStates: collectConcurrentSectionCutStates({
                sectionCutIds: wall.sectionCutIds ?? [],
                globalResponses: demandSet?.globalResponses,
            }),
        };
        try {
            femDemand.concurrentResistanceSectionCutStates =
                projectWallSectionCutStatesToResistanceAxes({
                    wall,
                    states: femDemand.concurrentSectionCutStates,
                });
        } catch (error) {
            results.push({
                wallId: wall.id,
                status: "failed",
                reason: error?.message ?? String(error),
            });
            continue;
        }
        let actions;
        try {
            actions = typeof data.selectActionsFromFem === "function"
                ? data.selectActionsFromFem({
                    wall,
                    data,
                    demand: femDemand,
                })
                : data.actions;
        } catch (error) {
            results.push({
                wallId: wall.id,
                status: "failed",
                reason: error?.message ?? String(error),
            });
            continue;
        }
        if (
            !Number.isFinite(actions?.axialForce) ||
            !Number.isFinite(actions?.momentX) ||
            !Number.isFinite(actions?.momentY)
        ) {
            results.push({
                wallId: wall.id,
                status: "not-analyzed",
                reason:
                    "Explicit finite wall actions or selectActionsFromFem output are required.",
                availableShellStateCount:
                    femDemand.concurrentShellResultantStates.length,
                availableSectionCutStateCount:
                    femDemand.concurrentSectionCutStates.length,
            });
            continue;
        }
        try {
            const outcome = verifyWallBiaxialBending({
                section: data.section,
                axialForce: actions.axialForce,
                momentX: actions.momentX,
                momentY: actions.momentY,
                concreteDesignStrength: data.concreteDesignStrength,
                reinforcementDesignStrength: data.reinforcementDesignStrength,
                concreteEc2: data.concreteEc2,
                concreteEcu: data.concreteEcu,
                steelElasticModulus: data.steelElasticModulus,
                steelUltimateStrain: data.steelUltimateStrain,
                targetFiberCount: data.targetFiberCount,
                angleCount: data.angleCount,
            });
            results.push({
                wallId: wall.id,
                status: outcome.ok ? "ok" : "not-verified",
                utilizationRatio: outcome.utilizationRatio,
                demand: outcome.demand,
                capacity: outcome.capacity,
                theta: outcome.theta,
                converged: outcome.converged,
                angleCount: outcome.angleCount,
                intersection: outcome.intersection,
                actionReference: actions.reference ?? null,
                check: outcome.check,
                reference: outcome.reference,
            });
        } catch (error) {
            results.push({
                wallId: wall.id,
                status: "failed",
                reason: error?.message ?? String(error),
            });
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Main application class
// ---------------------------------------------------------------------------

export class RcBuildingVerificationApplication extends StructuralApplication {
    static id = APP_ID;
    static version = APP_VERSION;
    static domain = APP_DOMAIN;
    static supportedCodes = APP_CODES;
    static maturity = APP_MATURITY;
    static tags = APP_TAGS;

    constructor() {
        super({
            id: APP_ID,
            name: "RC Building Verification",
            version: APP_VERSION,
            domain: APP_DOMAIN,
            supportedCodes: APP_CODES,
            maturity: APP_MATURITY,
            tags: APP_TAGS,
            description:
                "NTC 2018 global reinforced concrete building verification from FEM results.",
        });
    }

    /**
     * Run the building verification.
     *
     * @param {Object} input
     * @param {Object} input.capabilities – FemCapabilitiesContract.
     * @param {Object} input.model – GlobalFemModelContract.
     * @param {Object} input.analysis – GlobalFemAnalysisContract.
     * @param {Object} input.result – GlobalFemResultContract.
     * @param {Object} input.mapping – FemEntityMappingContract (confirmed).
     * @param {string} input.behavior – Structural behavior choice.
     * @param {string} input.structuralType – Explicit structural type.
     * @param {Object} [input.siteParams] – Site hazard parameters.
     * @param {Object} [input.metadata] – Consumer metadata.
     * @returns {CalculationResult}
     */
    run(input = {}) {
        const warnings = [];
        const assumptions = [];

        // ---- 1. Contract validation ----
        const capabilitiesVal = validateFemCapabilitiesContract(input.capabilities);
        const modelVal = validateGlobalFemModelContract(input.model);
        const analysisVal = validateGlobalFemAnalysisContract(input.analysis, {
            model: modelVal.ok ? modelVal.value : null,
            capabilities: capabilitiesVal.ok ? capabilitiesVal.value : null,
        });
        const mappingVal = input.mapping != null
            ? validateFemEntityMappingContract(input.mapping, {
                model: modelVal.ok ? modelVal.value : null,
            })
            : null;
        const resultVal = input.result != null
            ? validateGlobalFemResultContract(input.result, {
                model: modelVal.ok ? modelVal.value : null,
                analysis: analysisVal.ok ? analysisVal.value : null,
                capabilities: capabilitiesVal.ok ? capabilitiesVal.value : null,
                mapping: mappingVal?.ok ? mappingVal.value : null,
            })
            : null;

        const { errors: validationErrors, warnings: validationWarnings } =
            extractValidationErrors(
                capabilitiesVal,
                modelVal,
                analysisVal,
                mappingVal,
                resultVal,
            );

        warnings.push(...validationWarnings);

        if (validationErrors.length > 0) {
            return new CalculationResult({
                applicationId: APP_ID,
                status: RESULT_STATUS_NOT_VERIFIED,
                summary: `Contract validation failed with ${validationErrors.length} error(s).`,
                outputs: {
                    validations: {
                        capabilities: { ok: capabilitiesVal.ok },
                        model: { ok: modelVal.ok },
                        analysis: { ok: analysisVal.ok },
                        mapping: { ok: mappingVal?.ok ?? null },
                        result: { ok: resultVal?.ok ?? null },
                    },
                    errors: validationErrors,
                    readiness: evaluateReadiness({
                        contracts: {
                            mapping: mappingVal,
                            result: resultVal,
                        },
                        input,
                        demandSet: null,
                        behaviorDescriptor: null,
                        behaviorError: null,
                        linearDynamicAssessment: null,
                        linearDynamicError: null,
                    }),
                },
                warnings,
                assumptions: [
                    "Contract validation failed; no normative checks performed.",
                ],
                metadata: input.metadata ?? {},
            });
        }

        // ---- 2. Solver-neutral demand extraction ----
        const postprocessing = mappingVal?.ok && resultVal?.ok
            ? new GlobalFemPostProcessingApplication().run({
                capabilities: capabilitiesVal.value,
                model: modelVal.value,
                analysis: analysisVal.value,
                result: resultVal.value,
                mapping: mappingVal.value,
                profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
            })
            : null;
        const demandSet = postprocessing?.outputs?.demands ?? null;

        // ---- 3. Explicit structural behavior inputs ----
        let behavior = null;
        let structuralType = null;
        let behaviorError = null;
        try {
            behavior = input.behavior == null
                ? null
                : normalizeNTC2018StructuralBehavior(input.behavior);
            structuralType = input.structuralType == null
                ? null
                : normalizeNTC2018StructuralType(input.structuralType);
        } catch (error) {
            behaviorError = error?.message ?? String(error);
        }

        // ---- 4. Storey data extraction ----
        const storeys = buildStoreyDisplacementData({
            model: modelVal.value,
            mapping: mappingVal?.value ?? input.mapping,
            result: resultVal?.value ?? input.result,
        });

        // ---- 4b. Linear dynamic analysis checks (NTC 2018 § 7.3.3.1) ----
        let linearDynamicAssessment = null;
        let linearDynamicError = null;
        if (input.linearDynamicAssessmentInput != null && resultVal?.ok) {
            const linearDynamicInput =
                input.linearDynamicAssessmentInput;
            try {
                linearDynamicAssessment =
                    createNTC2018LinearDynamicAssessment({
                        analysis: analysisVal.value,
                        result: resultVal.value,
                        ...linearDynamicInput,
                        storeyIds: linearDynamicInput.storeyIds ??
                            modelVal.value.storeys.map((storey) =>
                                storey.id),
                    });
            } catch (error) {
                linearDynamicError = error?.message ?? String(error);
            }
        }

        // ---- 5. Regularity assessment (WP2) ----
        let regularityAssessment = null;
        if (
            mappingVal?.ok &&
            storeys.length >= 2 &&
            behavior != null &&
            input.regularityAssessmentInput?.planInput != null &&
            input.regularityAssessmentInput?.elevationInput != null
        ) {
            regularityAssessment = createNTC2018RegularityAssessment({
                ...input.regularityAssessmentInput,
                behavior,
            });

        }

        let behaviorDesc = null;
        if (
            behavior != null &&
            structuralType != null &&
            (
                behavior === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE ||
                regularityAssessment != null
            )
        ) {
            try {
                behaviorDesc = createNTC2018StructuralBehavior({
                    behavior,
                    structuralType,
                    regularity: regularityAssessment
                        ? {
                            plan: regularityAssessment.planRegularity,
                            elevation: regularityAssessment.elevationRegularity,
                        }
                        : {},
                    ...(input.structuralBehaviorParameters ?? {}),
                });
            } catch (error) {
                behaviorError = error?.message ?? String(error);
            }
        } else if (
            behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE &&
            behavior != null &&
            regularityAssessment == null
        ) {
            behaviorError =
                "Dissipative behavior requires an explicit regularity assessment.";
        }

        // ---- 6. Displacement checks (WP5) ----
        let displacementAssessment = null;
        if (storeys.length > 0 && input.displacementAssessmentInput != null) {
            displacementAssessment = createDisplacementAssessment({
                ...input.displacementAssessmentInput,
                storeys: input.displacementAssessmentInput.storeys ?? storeys,
            });
        }

        // ---- 7. Capacity design (WP4) ----
        const capacityDesignSummary = {
            applicable:
                behavior != null &&
                behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
            jointCount: mappingVal?.value?.joints?.length ?? 0,
            checks: [],
        };

        // This summary records where capacity design applies. The executable
        // resistance checks use the concurrent states and capacities supplied
        // to the member, joint and joint-hierarchy verification paths below.
        if (capacityDesignSummary.applicable && mappingVal?.ok) {
            for (const joint of (mappingVal.value.joints ?? [])) {
                const assessment = createCapacityDesignAssessment({
                    jointId: joint.id ?? `joint-${capacityDesignSummary.checks.length}`,
                    behavior,
                });
                capacityDesignSummary.checks.push({
                    jointId: assessment.jointId,
                    isDissipative: assessment.isDissipative,
                    checkCount: assessment.checks.length,
                });
            }
        }

        // ---- 7b. Member verification (WP3/WP6) via consumer verifiers ----
        const memberVerifications = runMemberVerifications({
            members: mappingVal?.value?.members ?? [],
            memberVerifiers: input.memberVerifiers ?? null,
            memberData: input.memberData ?? null,
            demandSet,
            context: {
                behavior,
                structuralType,
                q: behaviorDesc?.q ?? null,
                q0: behaviorDesc?.q0 ?? null,
                kr: behaviorDesc?.kr ?? null,
                units: input.units ?? null,
                globalFem: demandSet
                    ? {
                        units: demandSet.units,
                        signConventions: demandSet.signConventions,
                        model: demandSet.model,
                        analysis: demandSet.analysis,
                        resultId: demandSet.resultId,
                    }
                    : null,
            },
        });

        // ---- 7c. Local joint verification with concurrent FEM states ----
        const sharedVerificationContext = {
            behavior,
            structuralType,
            q: behaviorDesc?.q ?? null,
            q0: behaviorDesc?.q0 ?? null,
            kr: behaviorDesc?.kr ?? null,
            units: input.units ?? null,
            analysis: analysisVal.value,
            globalFem: demandSet
                ? {
                    units: demandSet.units,
                    signConventions: demandSet.signConventions,
                    model: demandSet.model,
                    analysis: demandSet.analysis,
                    resultId: demandSet.resultId,
                }
                : null,
        };
        const jointVerifications = runJointVerifications({
            joints: mappingVal?.value?.joints ?? [],
            members: mappingVal?.value?.members ?? [],
            jointVerifier: input.jointVerifier,
            jointData: input.jointData,
            demandSet,
            context: sharedVerificationContext,
        });

        // ---- 7d. Beam-column joint hierarchy (WP4) ----
        const jointHierarchyVerifications = runJointHierarchyVerifications({
            joints: mappingVal?.value?.joints ?? [],
            jointHierarchy: input.jointHierarchy ?? null,
            behavior,
        });

        // ---- 7e. Shear-wall biaxial bending (SETTI-2) ----
        const wallBiaxialVerifications = runWallBiaxialVerifications({
            walls: mappingVal?.value?.walls ?? [],
            wallSections: input.wallSections ?? null,
            demandSet,
        });

        // ---- 7f. Complete wall-height and coupling-beam workflow ----
        const wallSystemVerifications = runWallSystemVerifications({
            walls: mappingVal?.value?.walls ?? [],
            wallSystemData: input.wallSystemData,
            wallSectionStateVerifier: input.wallSectionStateVerifier,
            demandSet,
            context: sharedVerificationContext,
        });

        // ---- 7g. Slabs, punching and in-plane diaphragm resistance ----
        const slabSystemVerifications = runSlabSystemVerifications({
            slabs: mappingVal?.value?.slabs ?? [],
            slabSystemData: input.slabSystemData,
            slabStateVerifier: input.slabStateVerifier,
            punchingConnections:
                mappingVal?.value?.punchingConnections ?? [],
            punchingVerifier: input.punchingVerifier,
            diaphragmStateVerifier: input.diaphragmStateVerifier,
            demandSet,
            context: sharedVerificationContext,
        });

        // ---- 7h. Supports, reactions and complete foundation checks ----
        const foundationSystemVerifications =
            runFoundationSystemVerifications({
                foundations: mappingVal?.value?.foundations ?? [],
                foundationSystemData: input.foundationSystemData,
                foundationVerifier: input.foundationVerifier,
                demandSet,
                context: sharedVerificationContext,
            });

        // ---- 8. Readiness evaluation ----
        const readiness = evaluateReadiness({
            contracts: {
                mapping: mappingVal,
                result: resultVal,
            },
            input,
            demandSet,
            behaviorDescriptor: behaviorDesc,
            behaviorError,
            linearDynamicAssessment,
            linearDynamicError,
        });

        // ---- 9. Aggregate results ----
        const membersOk = memberVerifications.every((m) => m.status === "ok");
        const jointsOk = jointVerifications.every((j) => j.status === "ok");
        const hierarchyOk = jointHierarchyVerifications.every((j) =>
            ["ok", "not-applicable"].includes(j.status));
        const wallSystemsOk = wallSystemVerifications.every((wall) =>
            wall.status === "ok");
        const wallsOk = wallSystemVerifications.length > 0 &&
            wallSystemsOk
            ? true
            : wallBiaxialVerifications.every((wall) =>
                wall.status === "ok");
        const slabSystemsOk = slabSystemVerifications.every((slab) =>
            slab.status === "ok");
        const foundationsOk = foundationSystemVerifications.every(
            (foundation) => foundation.status === "ok",
        );
        const allImplementedChecksOk =
            (regularityAssessment?.allChecksOk ?? true) &&
            (displacementAssessment?.allChecksOk ?? true) &&
            (linearDynamicAssessment?.ok ?? false) &&
            membersOk &&
            jointsOk &&
            hierarchyOk &&
            wallsOk &&
            wallSystemsOk &&
            slabSystemsOk &&
            foundationsOk;
        const blockedAssessments = readiness.filter(
            (assessment) => assessment.status === "blocked",
        );
        const workflowComplete =
            APP_MATURITY === "complete" &&
            blockedAssessments.length === 0 &&
            allImplementedChecksOk;

        const allChecks = [
            ...(regularityAssessment?.checks ?? []),
            ...(displacementAssessment?.checks ?? []),
            ...(linearDynamicAssessment?.checks ?? []),
            ...memberVerifications.flatMap((m) => m.checks ?? []),
            ...jointVerifications.flatMap((joint) => joint.checks ?? []),
            ...wallSystemVerifications.flatMap((wall) =>
                wall.checks ?? []),
            ...slabSystemVerifications.flatMap((slab) =>
                slab.checks ?? []),
            ...foundationSystemVerifications.flatMap((foundation) =>
                foundation.checks ?? []),
            ...jointHierarchyVerifications
                .filter((j) => j.check != null)
                .map((j) => ({
                    id: `joint-hierarchy-${j.jointId}`,
                    demand: j.demand,
                    capacity: j.capacity,
                    utilizationRatio: j.utilizationRatio,
                    ok: j.status === "ok",
                    metadata: {
                        reference: j.reference,
                        ...(j.metadata ?? {}),
                    },
                })),
        ];

        return new CalculationResult({
            applicationId: APP_ID,
            status: APP_MATURITY !== "complete"
                ? RESULT_STATUS_NOT_IMPLEMENTED
                : workflowComplete
                    ? RESULT_STATUS.OK
                    : RESULT_STATUS_NOT_VERIFIED,
            summary: APP_MATURITY !== "complete"
                ? "Building verification is incomplete: no positive compliance outcome is issued."
                : workflowComplete
                    ? "Building verification completed: all required checks satisfied."
                    : "Building verification completed: one or more required checks are missing or not satisfied.",
            outputs: {
                globalFemDemandSet: demandSet,
                normativeCoverage: getNTC2018RcBuildingCoverage(),
                completeness: evaluateNTC2018RcBuildingCompleteness(),
                behavior: behaviorDesc
                    ? {
                        status: "evaluated",
                        behavior: behaviorDesc.behavior,
                        structuralType: behaviorDesc.structuralType,
                        isDissipative: behaviorDesc.isDissipative,
                        ductilityClass: behaviorDesc.ductilityClass,
                        q0: behaviorDesc.q0,
                        q: behaviorDesc.q,
                        kr: behaviorDesc.kr,
                    }
                    : {
                        status: "not-evaluated",
                        behavior,
                        structuralType,
                        reason: behaviorError ??
                            "Explicit behavior and structuralType are required.",
                    },
                regularity: regularityAssessment ? {
                    planRegularity: regularityAssessment.planRegularity,
                    elevationRegularity: regularityAssessment.elevationRegularity,
                    reductionFactorKr: regularityAssessment.reductionFactorKr,
                    analysisMethods: regularityAssessment.analysisMethodsX,
                } : { status: "not-evaluated" },
                linearDynamicAnalysis: linearDynamicAssessment ?? {
                    status: "not-evaluated",
                    complete: false,
                    ok: false,
                    reason: linearDynamicError ??
                        "Explicit linearDynamicAssessmentInput is required.",
                },
                displacement: displacementAssessment ? {
                    limitState: displacementAssessment.limitState,
                    governingDriftX: displacementAssessment.governingDriftX,
                    governingDriftY: displacementAssessment.governingDriftY,
                    governingThetaX: displacementAssessment.governingThetaX,
                    governingThetaY: displacementAssessment.governingThetaY,
                    storeyResults: displacementAssessment.storeyResults.map((r) => ({
                        storeyId: r.storeyId,
                        driftX: r.driftX,
                        driftY: r.driftY,
                        pDeltaX: r.pDeltaX,
                        pDeltaY: r.pDeltaY,
                    })),
                } : { status: "not-evaluated" },
                capacityDesign: capacityDesignSummary,
                members: {
                    count: memberVerifications.length,
                    verified: memberVerifications.filter((m) => m.status === "ok").length,
                    notAnalyzed: memberVerifications.filter((m) => m.status === "not-analyzed").length,
                    results: memberVerifications,
                },
                joints: {
                    count: jointVerifications.length,
                    verified: jointVerifications.filter((j) => j.status === "ok").length,
                    notAnalyzed: jointVerifications.filter((j) => j.status === "not-analyzed").length,
                    results: jointVerifications,
                },
                jointHierarchy: {
                    count: jointHierarchyVerifications.length,
                    verified: jointHierarchyVerifications.filter((j) =>
                        j.status === "ok").length,
                    notAnalyzed: jointHierarchyVerifications.filter((j) =>
                        j.status === "not-analyzed").length,
                    results: jointHierarchyVerifications,
                },
                walls: {
                    count: wallBiaxialVerifications.length,
                    verified: wallBiaxialVerifications.filter((w) => w.status === "ok").length,
                    notAnalyzed: wallBiaxialVerifications.filter((w) => w.status === "not-analyzed").length,
                    results: wallBiaxialVerifications,
                },
                wallSystems: {
                    count: wallSystemVerifications.length,
                    verified: wallSystemVerifications.filter((wall) =>
                        wall.status === "ok").length,
                    notAnalyzed: wallSystemVerifications.filter((wall) =>
                        wall.status === "not-implemented").length,
                    results: wallSystemVerifications,
                },
                slabSystems: {
                    count: slabSystemVerifications.length,
                    verified: slabSystemVerifications.filter((slab) =>
                        slab.status === "ok").length,
                    notAnalyzed: slabSystemVerifications.filter((slab) =>
                        slab.status === "not-implemented").length,
                    results: slabSystemVerifications,
                },
                foundationSystems: {
                    count: foundationSystemVerifications.length,
                    verified: foundationSystemVerifications.filter(
                        (foundation) => foundation.status === "ok",
                    ).length,
                    notAnalyzed: foundationSystemVerifications.filter(
                        (foundation) =>
                            foundation.status === "not-implemented",
                    ).length,
                    results: foundationSystemVerifications,
                },
                readiness,
                blockedAssessments,
                checks: allChecks,
                checkCount: allChecks.length,
            },
            warnings,
            assumptions: [
                "Member-level verifiers receive every concurrent FEM action state; the orchestrator does not combine independently enveloped components.",
                "Global FEM action units and signs are preserved; proper orthogonal transformations to resistance axes come only from the confirmed mapping contract.",
                "Wall action-state selection remains explicit; every section-cut state is transformed by its confirmed resistance-axis mapping before selection.",
                "Per-member material and reinforcement data must be provided by the consumer (no automatic reinforcement).",
                "Beam-column hierarchy runs only for joints with jointHierarchy data.",
                ...assumptions,
            ],
            metadata: withNormativeReferences({
                ...input.metadata ?? {},
                appVersion: APP_VERSION,
                maturity: APP_MATURITY,
                normativeConformityClaimed: false,
                normativeTraceabilityComplete:
                    evaluateNTC2018RcBuildingCompleteness()
                        .normativeTraceabilityComplete,
            }, [
                NTC2018_RC_CHAPTER_4_REFERENCES.flexureAndAxialForce,
                NTC2018_RC_CHAPTER_4_REFERENCES.shearWithoutTransverseReinforcement,
                NTC2018_RC_CHAPTER_4_REFERENCES.shearWithTransverseReinforcement,
                NTC2018_RC_CHAPTER_4_REFERENCES.punching,
                NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralBehavior,
                NTC2018_RC_CHAPTER_7_4_REFERENCES.structuralTypesAndQ,
                NTC2018_RC_CHAPTER_7_4_REFERENCES.columnCapacityDesign,
                NTC2018_RC_CHAPTER_7_4_REFERENCES.beamColumnJoint,
                NTC2018_RC_CHAPTER_7_4_REFERENCES.diaphragm,
                NTC2018_RC_CHAPTER_7_4_REFERENCES.wall,
                NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.globalSeismicAnalysis,
                NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.foundationDesign,
                NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.seismicFoundationDesign,
            ]),
        });
    }
}
