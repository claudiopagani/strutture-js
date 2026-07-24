/**
 * Reinforced Concrete Building Verification Application.
 *
 * Orchestrates the complete NTC 2018 verification of an entire RC building
 * from global FEM contracts. The FEM solver is external; this application
 * receives the model, analysis results, mapping and structural behavior
 * choice, then executes all applicable verifications.
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
 * This application is `partial` (first increment). It validates inputs,
 * extracts demands, evaluates readiness, and produces a structured report
 * with checks from WP2, WP4 and WP5. Full member-level verification
 * orchestration (steps 5-6-7) requires per-member material and
 * reinforcement data from the consumer and will be completed in a
 * follow-up increment.
 *
 * References:
 * - NTC 2018 §§ 7.2-7.4, 7.8-7.9
 * - GlobalFemDemandSet v0
 * - FemEntityMappingContract v0
 */

import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import {
    RESULT_STATUS,
    RESULT_STATUS_OK,
    RESULT_STATUS_NOT_VERIFIED,
} from "../../core/results/resultStatus.js";

import {
    validateFemCapabilitiesContract,
    validateFemEntityMappingContract,
    validateGlobalFemAnalysisContract,
    validateGlobalFemModelContract,
    validateGlobalFemResultContract,
} from "../../domain/fem/index.js";

import {
    NTC2018_STRUCTURAL_BEHAVIOR,
    createNTC2018StructuralBehavior,
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
    verifyWallBiaxialBending,
} from "./wallBiaxialVerification.js";

// ---------------------------------------------------------------------------
// Application metadata
// ---------------------------------------------------------------------------

const APP_ID = "rc-building-verification";
const APP_VERSION = "0.1.0";
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
const APP_MATURITY = "partial";

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
    const storeys = mapping.storeys ?? [];
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
        const ms = modelStoreyById.get(storey.id ?? storey.storeyId);
        return storey.elevation ?? ms?.elevation;
    };

    // Cumulative weight above each storey (sum of |Fz| of storeys above,
    // including the current one). Base index 0 = lowest storey.
    const storeyWeightAbove = (index) => {
        let w = 0;
        for (let i = index; i < storeys.length; i++) {
            const sr = storeyResultBySid.get(storeys[i].id ?? storeys[i].storeyId);
            const fz = sr?.resultants?.Fz;
            if (Number.isFinite(fz)) w += Math.abs(fz);
        }
        return w > 0 ? w : undefined;
    };

    return storeys.map((storey, index) => {
        const sid = storey.id ?? storey.storeyId ?? `storey-${index}`;
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
                : 3.0);

        const sr = storeyResultBySid.get(sid);
        const shearX = sr?.resultants?.Fx;
        const shearY = sr?.resultants?.Fy;

        return {
            storeyId: sid,
            height: height > 0 ? height : 3.0,
            displacementX: top.x ?? 0,
            displacementXBelow: below.x ?? 0,
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
function evaluateReadiness({ contracts, input }) {
    const assessments = [];
    const hasMapping = contracts.mapping?.ok ?? false;
    const hasResult = contracts.result?.ok ?? false;
    const hasBehavior = input.behavior != null;
    const hasStoreys = (input.mapping?.storeys?.length ?? 0) > 0;

    // Regularity
    assessments.push({
        assessment: "structural-regularity",
        status: hasMapping && hasStoreys ? "ready" : "blocked",
        missing: [
            ...(!hasMapping ? ["mapping"] : []),
            ...(!hasStoreys ? ["storeys"] : []),
        ],
    });

    // Capacity design
    assessments.push({
        assessment: "capacity-design",
        status: hasBehavior && input.behavior !== "non-dissipative"
            ? "ready"
            : input.behavior === "non-dissipative"
                ? "not-applicable"
                : "blocked",
        missing: !hasBehavior ? ["behavior"] : [],
    });

    // Displacement checks
    assessments.push({
        assessment: "displacement-checks",
        status: hasMapping && hasStoreys && hasResult ? "ready" : "blocked",
        missing: [
            ...(!hasMapping ? ["mapping"] : []),
            ...(!hasStoreys ? ["storeys"] : []),
            ...(!hasResult ? ["result"] : []),
        ],
    });

    // Member verification (beam/column via consumer-provided verifiers)
    const hasMemberVerifiers =
        input.memberVerifiers != null &&
        (typeof input.memberVerifiers.beam === "function" ||
            typeof input.memberVerifiers.column === "function");
    assessments.push({
        assessment: "member-verification",
        status: hasMemberVerifiers ? "ready" : "blocked",
        missing: hasMemberVerifiers ? [] : ["memberVerifiers"],
    });

    // Beam-column joint hierarchy verification (WP4)
    const hasHierarchyData =
        input.jointHierarchy != null &&
        Object.keys(input.jointHierarchy).length > 0;
    assessments.push({
        assessment: "joint-verification",
        status: hasHierarchyData ? "ready" : "blocked",
        missing: hasHierarchyData ? [] : ["jointHierarchy"],
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
function runMemberVerifications({ members, memberVerifiers, memberData, context }) {
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
        try {
            const outcome = verifier({
                member,
                data: memberData?.[member.id] ?? null,
                context,
            });
            results.push({
                memberId: member.id,
                role,
                status: outcome?.status ?? "ok",
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

// ---------------------------------------------------------------------------
// Beam-column joint hierarchy (WP4)
// ---------------------------------------------------------------------------

/**
 * Verify the beam-column hierarchy for each joint with provided data.
 *
 * @param {Object} params
 * @param {Array} params.joints – FemEntityMappingContract joints.
 * @param {Object} params.jointHierarchy – Per-joint hierarchy data by id:
 *   `{ [jointId]: { beamMomentResistancePositive,
 *                   beamMomentResistanceNegative,
 *                   columnMomentResistance } }`.
 * @param {string} params.behavior – Structural behavior.
 * @returns {Array}
 */
function runJointHierarchyVerifications({ joints, jointHierarchy, behavior }) {
    const results = [];
    for (const joint of joints ?? []) {
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
function runWallBiaxialVerifications({ walls, wallSections }) {
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
        try {
            const outcome = verifyWallBiaxialBending({
                section: data.section,
                axialForce: data.actions?.axialForce,
                momentX: data.actions?.momentX,
                momentY: data.actions?.momentY,
                concreteDesignStrength: data.concreteDesignStrength,
                reinforcementDesignStrength: data.reinforcementDesignStrength,
                concreteEc2: data.concreteEc2,
                concreteEcu: data.concreteEcu,
                steelElasticModulus: data.steelElasticModulus,
                steelUltimateStrain: data.steelUltimateStrain,
                targetFiberCount: data.targetFiberCount,
            });
            results.push({
                wallId: wall.id,
                status: outcome.ok ? "ok" : "not-verified",
                utilizationRatio: outcome.utilizationRatio,
                demand: outcome.demand,
                capacity: outcome.capacity,
                theta: outcome.theta,
                converged: outcome.converged,
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
     * @param {string} [input.structuralType] – Structural type. Default "frame".
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
                    }),
                },
                warnings,
                assumptions: [
                    "Contract validation failed; no normative checks performed.",
                ],
                metadata: input.metadata ?? {},
            });
        }

        // ---- 2. Structural behavior ----
        const behavior = input.behavior ?? NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
        const structuralType = input.structuralType ?? "frame";

        const behaviorDesc = createNTC2018StructuralBehavior({
            behavior,
            structuralType,
            regularity: {
                plan: "regular",   // will be updated after regularity assessment
                elevation: "regular",
            },
        });

        // ---- 3. Storey data extraction ----
        const storeys = buildStoreyDisplacementData({
            model: modelVal.value,
            mapping: mappingVal?.value ?? input.mapping,
            result: resultVal?.value ?? input.result,
        });

        // ---- 4. Regularity assessment (WP2) ----
        let regularityAssessment = null;
        if (mappingVal?.ok && storeys.length >= 2) {
            regularityAssessment = createNTC2018RegularityAssessment({
                planInput: {
                    planLengthX: input.planLengthX ?? 20,
                    planLengthY: input.planLengthY ?? 15,
                },
                elevationInput: {
                    storeys: storeys.map((s) => ({
                        storeyId: s.storeyId,
                        elevation: 0,
                        height: s.height,
                        mass: s.weight > 0 ? s.weight : 200,
                    })),
                },
                behavior,
            });

            // Update behavior with actual regularity
            behaviorDesc.regularity = {
                plan: regularityAssessment.planRegularity,
                elevation: regularityAssessment.elevationRegularity,
            };
            behaviorDesc.kr = regularityAssessment.reductionFactorKr;
            behaviorDesc.q = behaviorDesc.q0 * behaviorDesc.kr;
        }

        // ---- 5. Displacement checks (WP5) ----
        let displacementAssessment = null;
        if (storeys.length > 0) {
            displacementAssessment = createDisplacementAssessment({
                storeys,
                limitState: "SLU",
                behavior,
            });
        }

        // ---- 6. Capacity design (WP4) ----
        const capacityDesignSummary = {
            applicable: behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
            jointCount: mappingVal?.value?.joints?.length ?? 0,
            checks: [],
        };

        // If joints are mapped, create a placeholder assessment for each.
        // Full capacity design requires member resistances from local
        // verifiers (deferred to follow-up increment).
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

        // ---- 6b. Member verification (WP3/WP6) via consumer verifiers ----
        const memberVerifications = runMemberVerifications({
            members: mappingVal?.value?.members ?? [],
            memberVerifiers: input.memberVerifiers ?? null,
            memberData: input.memberData ?? null,
            context: {
                behavior,
                structuralType,
                q: behaviorDesc.q,
                q0: behaviorDesc.q0,
                kr: behaviorDesc.kr,
                units: input.units ?? null,
            },
        });

        // ---- 6c. Beam-column joint hierarchy (WP4) ----
        const jointHierarchyVerifications = runJointHierarchyVerifications({
            joints: mappingVal?.value?.joints ?? [],
            jointHierarchy: input.jointHierarchy ?? null,
            behavior,
        });

        // ---- 6d. Shear-wall biaxial bending (SETTI-2) ----
        const wallBiaxialVerifications = runWallBiaxialVerifications({
            walls: mappingVal?.value?.walls ?? [],
            wallSections: input.wallSections ?? null,
        });

        // ---- 7. Readiness evaluation ----
        const readiness = evaluateReadiness({
            contracts: {
                mapping: mappingVal,
                result: resultVal,
            },
            input,
        });

        // ---- 8. Aggregate results ----
        const membersOk = memberVerifications.every(
            (m) => m.status !== "not-verified" && m.status !== "failed",
        );
        const jointsOk = jointHierarchyVerifications.every(
            (j) => j.status !== "not-verified" && j.status !== "failed",
        );
        const wallsOk = wallBiaxialVerifications.every(
            (w) => w.status !== "not-verified" && w.status !== "failed",
        );
        const allOk =
            (regularityAssessment?.allChecksOk ?? true) &&
            (displacementAssessment?.allChecksOk ?? true) &&
            membersOk &&
            jointsOk &&
            wallsOk;

        const allChecks = [
            ...(regularityAssessment?.checks ?? []),
            ...(displacementAssessment?.checks ?? []),
            ...memberVerifications.flatMap((m) => m.checks ?? []),
            ...jointHierarchyVerifications
                .filter((j) => j.check != null)
                .map((j) => ({
                    id: `joint-hierarchy-${j.jointId}`,
                    demand: j.demand,
                    capacity: j.capacity,
                    utilizationRatio: j.utilizationRatio,
                    ok: j.status === "ok",
                    metadata: { reference: j.reference },
                })),
        ];

        return new CalculationResult({
            applicationId: APP_ID,
            status: allOk ? RESULT_STATUS_OK : RESULT_STATUS_NOT_VERIFIED,
            summary: allOk
                ? "Building verification completed: all checks satisfied."
                : "Building verification completed: some checks not satisfied.",
            outputs: {
                behavior: {
                    behavior: behaviorDesc.behavior,
                    structuralType: behaviorDesc.structuralType,
                    isDissipative: behaviorDesc.isDissipative,
                    ductilityClass: behaviorDesc.ductilityClass,
                    q0: behaviorDesc.q0,
                    q: behaviorDesc.q,
                    kr: behaviorDesc.kr,
                },
                regularity: regularityAssessment ? {
                    planRegularity: regularityAssessment.planRegularity,
                    elevationRegularity: regularityAssessment.elevationRegularity,
                    reductionFactorKr: regularityAssessment.reductionFactorKr,
                    analysisMethods: regularityAssessment.analysisMethodsX,
                } : { status: "not-evaluated" },
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
                    count: jointHierarchyVerifications.length,
                    verified: jointHierarchyVerifications.filter((j) => j.status === "ok").length,
                    notAnalyzed: jointHierarchyVerifications.filter((j) => j.status === "not-analyzed").length,
                    results: jointHierarchyVerifications,
                },
                walls: {
                    count: wallBiaxialVerifications.length,
                    verified: wallBiaxialVerifications.filter((w) => w.status === "ok").length,
                    notAnalyzed: wallBiaxialVerifications.filter((w) => w.status === "not-analyzed").length,
                    results: wallBiaxialVerifications,
                },
                readiness,
                checks: allChecks,
                checkCount: allChecks.length,
            },
            warnings,
            assumptions: [
                "Member-level verifications run only for members with a consumer-injected verifier (memberVerifiers).",
                "Per-member material and reinforcement data must be provided by the consumer (no automatic reinforcement).",
                "Beam-column hierarchy runs only for joints with jointHierarchy data.",
                ...assumptions,
            ],
            metadata: {
                appVersion: APP_VERSION,
                maturity: APP_MATURITY,
                ...input.metadata ?? {},
            },
        });
    }
}
