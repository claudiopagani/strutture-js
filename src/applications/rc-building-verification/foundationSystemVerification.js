import {
  collectConcurrentSupportReactionStates,
  projectFoundationReactionStatesToResistanceAxes,
} from "../../domain/fem/index.js";

function groupReactionStates(states, supportNodeIds) {
  const groups = new Map();
  for (const state of states) {
    const key = JSON.stringify(state.reference ?? {});
    if (!groups.has(key)) {
      groups.set(key, {
        reference: state.reference,
        reactions: [],
      });
    }
    groups.get(key).reactions.push(state);
  }
  return [...groups.values()].map((group) => {
    const supplied = new Set(group.reactions.map((state) => state.nodeId));
    const missingSupportNodeIds = supportNodeIds.filter((nodeId) =>
      !supplied.has(nodeId));
    return {
      ...group,
      complete: missingSupportNodeIds.length === 0,
      missingSupportNodeIds,
    };
  });
}

function hasSeismicCombinations(analysis) {
  const cases = new Map((analysis?.loadCases ?? []).map((item) => [
    item.id,
    item,
  ]));
  return (analysis?.combinations ?? []).some((combination) =>
    combination.terms?.some((term) =>
      cases.get(term.loadCaseId)?.nature?.startsWith("seismic")));
}

export function runFoundationSystemVerifications({
  foundations,
  foundationSystemData,
  foundationVerifier,
  demandSet,
  context,
}) {
  const results = [];
  for (const foundation of foundations ?? []) {
    const data = foundationSystemData?.[foundation.id];
    if (data == null || typeof foundationVerifier !== "function") {
      results.push({
        foundationId: foundation.id,
        status: "not-implemented",
        complete: false,
        ok: false,
        missing: [
          ...(data == null
            ? [`foundationSystemData.${foundation.id}`]
            : []),
          ...(typeof foundationVerifier !== "function"
            ? ["foundationVerifier"]
            : []),
        ],
        checks: [],
      });
      continue;
    }
    try {
      const sourceStates = foundation.supportNodeIds.flatMap((nodeId) =>
        collectConcurrentSupportReactionStates({
          nodeId,
          globalResponses: demandSet?.globalResponses,
        }));
      const resistanceStates =
        projectFoundationReactionStatesToResistanceAxes({
          foundation,
          states: sourceStates,
        });
      const groupedStates = groupReactionStates(
        resistanceStates,
        foundation.supportNodeIds,
      );
      const expectedCombinationIds =
        (context.analysis?.combinations ?? []).map((item) => item.id);
      const outcome = foundationVerifier({
        foundation,
        data,
        demand: {
          schema: "strutture-js/rc-foundation-fem-demand-context",
          version: 0,
          units: demandSet?.units ?? null,
          signConventions: demandSet?.signConventions ?? null,
          concurrentReactionStates: sourceStates,
          concurrentResistanceReactionStates: resistanceStates,
          groupedResistanceReactionStates: groupedStates,
        },
        context,
      });
      const requiredFamilies = [
        "structural",
        "geotechnicalUltimate",
        "serviceability",
        "supportConnection",
        ...(hasSeismicCombinations(context.analysis)
          ? ["seismicFoundation"]
          : []),
      ];
      const missingFamilies = requiredFamilies.filter((name) =>
        typeof outcome?.[name]?.ok !== "boolean");
      const assessedCombinationIds =
        outcome?.assessedCombinationIds ?? [];
      const missingCombinationIds = expectedCombinationIds.filter((id) =>
        !assessedCombinationIds.includes(id));
      const checks = requiredFamilies
        .filter((name) => typeof outcome?.[name]?.ok === "boolean")
        .map((name) => ({
          ...outcome[name],
          id: outcome[name].id ??
            `foundation-${name}-${foundation.id}`,
          metadata: {
            ...outcome[name].metadata,
            foundationId: foundation.id,
            foundationType: foundation.type,
          },
        }));
      const complete =
        sourceStates.length > 0 &&
        groupedStates.every((group) => group.complete) &&
        missingFamilies.length === 0 &&
        missingCombinationIds.length === 0;
      const ok = complete && checks.every((item) => item.ok);
      results.push({
        foundationId: foundation.id,
        foundationType: foundation.type,
        status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
        complete,
        ok,
        missing: [
          ...(sourceStates.length === 0 ? ["reaction states"] : []),
          ...missingFamilies,
        ],
        missingCombinationIds,
        sourceStateCount: sourceStates.length,
        resistanceStateCount: resistanceStates.length,
        groupedResistanceReactionStates: groupedStates,
        checks,
        outputs: outcome?.outputs ?? null,
      });
    } catch (error) {
      results.push({
        foundationId: foundation.id,
        foundationType: foundation.type,
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
