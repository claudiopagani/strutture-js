import {
  collectConcurrentSurfaceResultantStates,
  projectSlabResultantStatesToResistanceAxes,
} from "../../domain/fem/index.js";
import {
  amplifyNTC2018DiaphragmActions,
  createDiaphragmAssessment,
} from "../../norms/ntc2018/reinforced-concrete/ntc2018Diaphragm.js";

function referenceLimitState(reference, analysis, data) {
  if (reference?.combinationId != null) {
    const combination = analysis?.combinations?.find((item) =>
      item.id === reference.combinationId);
    if (combination) return combination.limitState;
  }
  const key = JSON.stringify(reference ?? {});
  return data.limitStateByReference?.[key] ?? null;
}

function isSeismicReference(reference, analysis, data) {
  if (reference?.combinationId != null) {
    const combination = analysis?.combinations?.find((item) =>
      item.id === reference.combinationId);
    const cases = new Map((analysis?.loadCases ?? []).map((item) => [
      item.id,
      item,
    ]));
    if (combination?.terms?.some((term) =>
      cases.get(term.loadCaseId)?.nature?.startsWith("seismic"))) {
      return true;
    }
  }
  const key = JSON.stringify(reference ?? {});
  return data.seismicReferenceKeys?.includes(key) ?? false;
}

function normalizeSlabState({
  slab,
  state,
  outcome,
  limitState,
}) {
  const required = limitState === "ultimate"
    ? ["bending", "oneWayShear"]
    : limitState === "serviceability"
      ? ["stress", "cracking", "deflection"]
      : [];
  const missing = [
    ...(required.length === 0 ? ["recognized-limit-state"] : []),
    ...required.filter((name) =>
      typeof outcome?.[name]?.ok !== "boolean"),
  ];
  const checks = required
    .filter((name) => typeof outcome?.[name]?.ok === "boolean")
    .map((name) => ({
      ...outcome[name],
      id: outcome[name].id ??
        `slab-${name}-${slab.id}-${state.shellElementId}`,
      metadata: {
        ...outcome[name].metadata,
        slabId: slab.id,
        shellElementId: state.shellElementId,
        reference: state.reference,
      },
    }));
  return {
    slabId: slab.id,
    shellElementId: state.shellElementId,
    reference: state.reference,
    limitState,
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

function verifyPunchingForSlab({
  slab,
  data,
  punchingConnections,
  punchingVerifier,
  demandSet,
  context,
}) {
  if (typeof data.punchingRequired !== "boolean") {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing: ["punchingRequired"],
      connections: [],
      checks: [],
    };
  }
  if (!data.punchingRequired) {
    const reason = data.punchingNotApplicableReason;
    const complete = typeof reason === "string" && reason.length > 0;
    return {
      status: complete ? "not-applicable" : "not-implemented",
      complete,
      ok: complete,
      reason: complete ? reason : null,
      missing: complete ? [] : ["punchingNotApplicableReason"],
      connections: [],
      checks: [],
    };
  }
  const connections = (punchingConnections ?? []).filter((item) =>
    item.slabId === slab.id);
  if (connections.length === 0 ||
      typeof punchingVerifier !== "function") {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing: [
        ...(connections.length === 0
          ? [`punchingConnections for ${slab.id}`]
          : []),
        ...(typeof punchingVerifier !== "function"
          ? ["punchingVerifier"]
          : []),
      ],
      connections: [],
      checks: [],
    };
  }
  const requiredCombinationIds = (context.analysis?.combinations ?? [])
    .filter((item) => item.limitState === "ultimate")
    .map((item) => item.id);
  const results = connections.map((connection) => {
    try {
      const outcome = punchingVerifier({
        connection,
        slab,
        data,
        demandSet,
        context,
      });
      const assessed = outcome?.assessedCombinationIds ?? [];
      const missingCombinations = requiredCombinationIds.filter((id) =>
        !assessed.includes(id));
      const checks = Array.isArray(outcome?.checks)
        ? outcome.checks
        : [];
      const checksValid = checks.length > 0 &&
        checks.every((item) => typeof item?.ok === "boolean");
      const complete = missingCombinations.length === 0 && checksValid;
      return {
        connectionId: connection.id,
        status: complete
          ? checks.every((item) => item.ok)
            ? "ok"
            : "not-verified"
          : "not-implemented",
        complete,
        ok: complete && checks.every((item) => item.ok),
        missingCombinationIds: missingCombinations,
        checks,
        outputs: outcome?.outputs ?? null,
      };
    } catch (error) {
      return {
        connectionId: connection.id,
        status: "failed",
        complete: false,
        ok: false,
        reason: error?.message ?? String(error),
        checks: [],
      };
    }
  });
  const complete = results.every((item) => item.complete);
  const ok = complete && results.every((item) => item.ok);
  return {
    status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
    complete,
    ok,
    missing: [],
    connections: results,
    checks: results.flatMap((item) => item.checks),
  };
}

function verifyDiaphragmForSlab({
  slab,
  data,
  states,
  diaphragmStateVerifier,
  context,
}) {
  if (typeof data.diaphragmRequired !== "boolean") {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing: ["diaphragmRequired"],
      stateAssessments: [],
      checks: [],
    };
  }
  if (!data.diaphragmRequired) {
    const reason = data.diaphragmNotApplicableReason;
    const complete = typeof reason === "string" && reason.length > 0;
    return {
      status: complete ? "not-applicable" : "not-implemented",
      complete,
      ok: complete,
      reason: complete ? reason : null,
      missing: complete ? [] : ["diaphragmNotApplicableReason"],
      stateAssessments: [],
      checks: [],
    };
  }
  if (!Array.isArray(slab.diaphragmIds) ||
      slab.diaphragmIds.length === 0 ||
      typeof diaphragmStateVerifier !== "function") {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing: [
        ...(!(slab.diaphragmIds?.length > 0)
          ? ["slab.diaphragmIds"]
          : []),
        ...(typeof diaphragmStateVerifier !== "function"
          ? ["diaphragmStateVerifier"]
          : []),
      ],
      stateAssessments: [],
      checks: [],
    };
  }
  const seismicStates = states.filter((state) =>
    isSeismicReference(
      state.reference,
      context.analysis,
      data,
    ));
  const stateAssessments = seismicStates.map((state) => {
    const analysisActions = {
      Nx: state.resistanceResultants.Nx,
      Ny: state.resistanceResultants.Ny,
      Nxy: state.resistanceResultants.Nxy,
    };
    const amplified = amplifyNTC2018DiaphragmActions({
      analysisActions,
    });
    try {
      const outcome = diaphragmStateVerifier({
        slab,
        data,
        state,
        designActions: amplified.designActions,
        context,
      });
      return createDiaphragmAssessment({
        diaphragmId: slab.diaphragmIds.join("+"),
        analysisActions,
        capacityChecks: outcome?.capacityChecks ?? [],
      });
    } catch (error) {
      return {
        status: "failed",
        complete: false,
        allChecksOk: false,
        reason: error?.message ?? String(error),
        checks: [],
      };
    }
  });
  const complete = stateAssessments.length > 0 &&
    stateAssessments.every((item) => item.complete);
  const ok = complete &&
    stateAssessments.every((item) => item.allChecksOk);
  return {
    status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
    complete,
    ok,
    missing: seismicStates.length === 0
      ? ["seismic shell-resultant states"]
      : [],
    stateAssessments,
    checks: stateAssessments.flatMap((item) => item.checks),
  };
}

export function runSlabSystemVerifications({
  slabs,
  slabSystemData,
  slabStateVerifier,
  punchingConnections,
  punchingVerifier,
  diaphragmStateVerifier,
  demandSet,
  context,
}) {
  const results = [];
  for (const slab of slabs ?? []) {
    const data = slabSystemData?.[slab.id];
    if (data == null || typeof slabStateVerifier !== "function") {
      results.push({
        slabId: slab.id,
        status: "not-implemented",
        complete: false,
        ok: false,
        missing: [
          ...(data == null ? [`slabSystemData.${slab.id}`] : []),
          ...(typeof slabStateVerifier !== "function"
            ? ["slabStateVerifier"]
            : []),
        ],
        checks: [],
      });
      continue;
    }
    try {
      const demand = demandSet?.surfaceDemands?.find((item) =>
        item.id === slab.id);
      const sourceStates = demand
        ? collectConcurrentSurfaceResultantStates(demand)
        : [];
      const states = projectSlabResultantStatesToResistanceAxes({
        slab,
        states: sourceStates,
      });
      const stateAssessments = states.map((state) => {
        const limitState = referenceLimitState(
          state.reference,
          context.analysis,
          data,
        );
        let outcome = null;
        try {
          outcome = slabStateVerifier({
            slab,
            data,
            state,
            limitState,
            context,
          });
        } catch (error) {
          return {
            slabId: slab.id,
            shellElementId: state.shellElementId,
            reference: state.reference,
            limitState,
            status: "failed",
            complete: false,
            ok: false,
            missing: [],
            reason: error?.message ?? String(error),
            checks: [],
          };
        }
        return normalizeSlabState({
          slab,
          state,
          outcome,
          limitState,
        });
      });
      const detailingChecks = Array.isArray(data.detailingChecks)
        ? data.detailingChecks
        : [];
      const detailingComplete = detailingChecks.length > 0 &&
        detailingChecks.every((item) => typeof item?.ok === "boolean");
      const punching = verifyPunchingForSlab({
        slab,
        data,
        punchingConnections,
        punchingVerifier,
        demandSet,
        context,
      });
      const diaphragm = verifyDiaphragmForSlab({
        slab,
        data,
        states,
        diaphragmStateVerifier,
        context,
      });
      const complete =
        states.length > 0 &&
        stateAssessments.every((item) => item.complete) &&
        detailingComplete &&
        punching.complete &&
        diaphragm.complete;
      const checks = [
        ...stateAssessments.flatMap((item) => item.checks),
        ...detailingChecks,
        ...punching.checks,
        ...diaphragm.checks,
      ];
      const ok = complete && checks.every((item) => item.ok === true);
      results.push({
        slabId: slab.id,
        status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
        complete,
        ok,
        missing: [
          ...(states.length === 0 ? ["shell-resultant states"] : []),
          ...(!detailingComplete ? ["detailingChecks"] : []),
          ...(punching.complete ? [] : punching.missing),
          ...(diaphragm.complete ? [] : diaphragm.missing),
        ],
        sourceStateCount: sourceStates.length,
        resistanceStateCount: states.length,
        stateAssessments,
        detailingChecks,
        punching,
        diaphragm,
        checks,
      });
    } catch (error) {
      results.push({
        slabId: slab.id,
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
