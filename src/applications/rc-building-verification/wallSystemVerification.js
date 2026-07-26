import {
  collectConcurrentSectionCutStates,
  projectWallSectionCutStatesToResistanceAxes,
} from "../../domain/fem/index.js";
import {
  NTC2018_STRUCTURAL_BEHAVIOR,
} from "../../norms/ntc2018/reinforced-concrete/structuralBehavior.js";
import {
  createCouplingBeamAssessment,
  createWallHeightSystemAssessment,
  verifyWallGeneralDetailing,
} from "../../norms/ntc2018/reinforced-concrete/wallSystemChecks.js";

function normalizeStateAssessment({
  wall,
  state,
  outcome,
  behavior,
  dissipativeSectionCutIds,
}) {
  const dissipative =
    behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
  const inDissipativeZone = dissipative &&
    dissipativeSectionCutIds.includes(state.sectionCutId);
  const required = [
    "flexure",
    "shear",
    ...(dissipative ? ["axialCompression"] : []),
    ...(inDissipativeZone ? ["ductility"] : []),
  ];
  const missing = required.filter((name) =>
    typeof outcome?.[name]?.ok !== "boolean");
  const checks = required
    .filter((name) => !missing.includes(name))
    .map((name) => ({
      ...outcome[name],
      id: outcome[name].id ??
        `wall-${name}-${wall.id}-${state.sectionCutId}`,
      metadata: {
        ...outcome[name].metadata,
        wallId: wall.id,
        sectionCutId: state.sectionCutId,
        reference: state.reference,
      },
    }));
  return {
    wallId: wall.id,
    sectionCutId: state.sectionCutId,
    reference: state.reference,
    complete: missing.length === 0,
    status: missing.length > 0
      ? "not-implemented"
      : checks.every((item) => item.ok)
        ? "ok"
        : "not-verified",
    ok: missing.length === 0 && checks.every((item) => item.ok),
    missing,
    checks,
    outputs: outcome?.outputs ?? null,
  };
}

function requiredWallSystemChecks({
  data,
  behavior,
  context,
}) {
  const allowedTypes = [
    "wall",
    "mixed",
    "coupled-wall",
    "weakly-reinforced",
  ];
  if (!allowedTypes.includes(data.systemType)) {
    throw new Error(
      `systemType must be one of ${allowedTypes.join(", ")}.`,
    );
  }
  if (typeof data.redistributionApplied !== "boolean") {
    throw new Error("redistributionApplied must be boolean.");
  }
  if (!Array.isArray(data.additionalChecks)) {
    throw new Error("additionalChecks must be an array.");
  }
  const dissipative =
    behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
  const required = [
    ...(dissipative
      ? [
          "wall-moment-envelope",
          "wall-shear-amplification",
          "wall-boundary-detailing",
        ]
      : []),
    ...(data.systemType === "mixed"
      ? ["wall-mixed-system-shear-envelope"]
      : []),
    ...(data.systemType === "weakly-reinforced"
      ? [
          "wall-weakly-reinforced-shear-amplification",
          "wall-out-of-plane-stability",
        ]
      : []),
    ...(data.systemType === "weakly-reinforced" && context.q > 2
      ? ["wall-weakly-reinforced-axial-dynamic"]
      : []),
    ...(data.redistributionApplied
      ? ["wall-seismic-demand-redistribution"]
      : []),
  ];
  const supplied = new Map(data.additionalChecks.map((item) => [
    item?.id,
    item,
  ]));
  const missing = required.filter((id) =>
    typeof supplied.get(id)?.ok !== "boolean");
  if (data.additionalChecks.some((item) =>
    typeof item?.id !== "string" ||
    typeof item?.ok !== "boolean")) {
    missing.push("valid-additional-checks");
  }
  return [...new Set(missing)];
}

/**
 * Run wall-height verification over every mapped section cut and every
 * concurrent FEM state. The injected section verifier supplies chapter-4
 * capacities; this orchestrator owns completeness and chapter-7 aggregation.
 */
export function runWallSystemVerifications({
  walls,
  wallSystemData,
  wallSectionStateVerifier,
  demandSet,
  context,
}) {
  const results = [];
  for (const wall of walls ?? []) {
    const data = wallSystemData?.[wall.id];
    if (data == null || typeof wallSectionStateVerifier !== "function") {
      results.push({
        wallId: wall.id,
        status: "not-implemented",
        complete: false,
        ok: false,
        missing: [
          ...(data == null ? [`wallSystemData.${wall.id}`] : []),
          ...(typeof wallSectionStateVerifier !== "function"
            ? ["wallSectionStateVerifier"]
            : []),
        ],
        checks: [],
      });
      continue;
    }
    if (!Array.isArray(data.couplingBeamInputs)) {
      results.push({
        wallId: wall.id,
        status: "not-implemented",
        complete: false,
        ok: false,
        missing: [`wallSystemData.${wall.id}.couplingBeamInputs`],
        checks: [],
      });
      continue;
    }

    try {
      const sourceStates = collectConcurrentSectionCutStates({
        sectionCutIds: wall.sectionCutIds,
        globalResponses: demandSet?.globalResponses,
      });
      const states = projectWallSectionCutStatesToResistanceAxes({
        wall,
        states: sourceStates,
      });
      const dissipativeSectionCutIds =
        data.dissipativeSectionCutIds ?? [];
      if (!Array.isArray(dissipativeSectionCutIds)) {
        throw new Error("dissipativeSectionCutIds must be an array.");
      }
      const dissipative =
        context.behavior !==
          NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
      const missingSystemChecks = requiredWallSystemChecks({
        data,
        behavior: context.behavior,
        context,
      });
      if (dissipative && dissipativeSectionCutIds.length === 0) {
        missingSystemChecks.push("dissipativeSectionCutIds");
      }
      if (data.systemType === "coupled-wall" &&
          data.couplingBeamInputs.length === 0) {
        missingSystemChecks.push("couplingBeamInputs");
      }
      if (missingSystemChecks.length > 0) {
        results.push({
          wallId: wall.id,
          status: "not-implemented",
          complete: false,
          ok: false,
          missing: [...new Set(missingSystemChecks)],
          checks: data.additionalChecks,
          sourceStateCount: sourceStates.length,
          resistanceStateCount: states.length,
        });
        continue;
      }
      const stateAssessments = states.map((state) => {
        let outcome = null;
        try {
          outcome = wallSectionStateVerifier({
            wall,
            data,
            state,
            context,
          });
        } catch (error) {
          return {
            wallId: wall.id,
            sectionCutId: state.sectionCutId,
            reference: state.reference,
            complete: false,
            status: "failed",
            ok: false,
            missing: [],
            reason: error?.message ?? String(error),
            checks: [],
          };
        }
        return normalizeStateAssessment({
          wall,
          state,
          outcome,
          behavior: context.behavior,
          dissipativeSectionCutIds,
        });
      });
      const couplingBeamAssessments = data.couplingBeamInputs.map((input) =>
        createCouplingBeamAssessment(input));
      const diagonalRequired = couplingBeamAssessments.some((item) =>
        item.procedure === "diagonal-X");
      const detailingAssessment = data.detailingInput == null
        ? null
        : verifyWallGeneralDetailing({
            ...data.detailingInput,
            diagonalCouplingReinforcementRequired: diagonalRequired,
          });
      const assessment = createWallHeightSystemAssessment({
        wallId: wall.id,
        expectedSectionCutIds: wall.sectionCutIds,
        sectionStateAssessments: stateAssessments,
        detailingAssessment,
        couplingBeamAssessments,
        additionalChecks: data.additionalChecks,
      });
      results.push({
        ...assessment,
        sourceStateCount: sourceStates.length,
        resistanceStateCount: states.length,
      });
    } catch (error) {
      results.push({
        wallId: wall.id,
        status: "failed",
        complete: false,
        ok: false,
        missing: [],
        reason: error?.message ?? String(error),
        checks: [],
      });
    }
  }
  return results;
}
