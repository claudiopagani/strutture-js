export const GLOBAL_FEM_DEMAND_SET_VERSION = 0;

const REFERENCE_KEYS = Object.freeze([
  "procedureId",
  "loadCaseId",
  "combinationId",
  "modeNumber",
  "step",
  "time",
  "envelopeId",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resultReference(entry) {
  return Object.fromEntries(
    REFERENCE_KEYS
      .filter((key) => entry[key] !== undefined)
      .map((key) => [key, entry[key]]),
  );
}

function referenceKey(reference) {
  return JSON.stringify(REFERENCE_KEYS.map((key) => reference[key] ?? null));
}

function updateExtreme(envelope, kind, candidate) {
  if (envelope[kind] == null ||
      (kind === "minimum" && candidate.value < envelope[kind].value) ||
      (kind === "maximum" && candidate.value > envelope[kind].value)) {
    envelope[kind] = candidate;
  }
}

function componentEnvelopes(samples) {
  const envelopes = {};
  for (const sample of samples) {
    for (const [component, value] of Object.entries(sample.components ?? {})) {
      if (!Number.isFinite(value)) continue;
      if (!envelopes[component]) {
        envelopes[component] = { minimum: null, maximum: null };
      }
      const candidate = {
        value,
        reference: clone(sample.reference),
        location: clone(sample.location),
      };
      updateExtreme(envelopes[component], "minimum", candidate);
      updateExtreme(envelopes[component], "maximum", candidate);
    }
  }
  return envelopes;
}

function extractLineElementDemands(model, result) {
  const resultByElement = new Map(model.lineElements.map((element) => [element.id, []]));
  for (const entry of result.results.lineElementActions ?? []) {
    resultByElement.get(entry.lineElementId)?.push(entry);
  }

  return model.lineElements.map((element) => {
    const states = (resultByElement.get(element.id) ?? []).map((entry) => ({
      reference: resultReference(entry),
      coordinateSystem: entry.coordinateSystem,
      stations: clone(entry.stations),
    }));
    const samples = states.flatMap((state) => state.stations.map((station) => ({
      reference: state.reference,
      location: {
        xi: station.xi,
        position: station.position,
        side: station.side,
      },
      components: station.actions,
    })));
    return {
      lineElementId: element.id,
      nodeIds: [...element.nodeIds],
      sectionId: element.sectionId,
      materialId: element.materialId,
      localAxes: clone(element.localAxes),
      actionStates: states,
      componentEnvelopes: componentEnvelopes(samples),
    };
  });
}

function extractShellElementDemands(model, result) {
  const resultByElement = new Map(model.shellElements.map((element) => [element.id, []]));
  for (const entry of result.results.shellResultants ?? []) {
    resultByElement.get(entry.shellElementId)?.push(entry);
  }

  return model.shellElements.map((element) => {
    const states = (resultByElement.get(element.id) ?? []).map((entry) => ({
      reference: resultReference(entry),
      coordinateSystem: entry.coordinateSystem,
      face: entry.face,
      location: clone(entry.location),
      components: clone(entry.components),
    }));
    return {
      shellElementId: element.id,
      nodeIds: [...element.nodeIds],
      sectionId: element.sectionId,
      materialId: element.materialId,
      localAxes: clone(element.localAxes),
      resultantStates: states,
      componentEnvelopes: componentEnvelopes(states.map((state) => ({
        reference: state.reference,
        location: { face: state.face, ...state.location },
        components: state.components,
      }))),
    };
  });
}

function groupDemands(classifications, idKey, demandIndex) {
  return classifications.map((entity) => ({
    id: entity.id,
    classification: clone(entity.classification),
    [idKey]: [...entity[idKey]],
    elementDemands: entity[idKey]
      .map((id) => demandIndex.get(id))
      .filter(Boolean)
      .map(clone),
  }));
}

function closestEndStation(actionState, end) {
  if (actionState.stations.length === 0) return null;
  const targetXi = end === "start" ? 0 : 1;
  return actionState.stations.reduce((closest, station) =>
    Math.abs(station.xi - targetXi) < Math.abs(closest.xi - targetXi) ? station : closest);
}

function extractJointDemands(joints, lineDemandIndex) {
  return joints.map((joint) => {
    const states = new Map();
    for (const elementEnd of joint.lineElementEnds) {
      const demand = lineDemandIndex.get(elementEnd.lineElementId);
      for (const actionState of demand?.actionStates ?? []) {
        const key = referenceKey(actionState.reference);
        if (!states.has(key)) {
          states.set(key, {
            reference: clone(actionState.reference),
            elementEnds: [],
          });
        }
        const station = closestEndStation(actionState, elementEnd.end);
        const targetXi = elementEnd.end === "start" ? 0 : 1;
        states.get(key).elementEnds.push({
          lineElementId: elementEnd.lineElementId,
          end: elementEnd.end,
          coordinateSystem: actionState.coordinateSystem,
          station: clone(station),
          atElementEnd: station != null && Math.abs(station.xi - targetXi) <= 1e-8,
        });
      }
    }

    const demandStates = [...states.values()].map((state) => {
      const present = new Set(state.elementEnds
        .filter((entry) => entry.atElementEnd)
        .map((entry) => `${entry.lineElementId}:${entry.end}`));
      const missingElementEnds = joint.lineElementEnds.filter((entry) =>
        !present.has(`${entry.lineElementId}:${entry.end}`));
      return {
        ...state,
        complete: missingElementEnds.length === 0,
        missingElementEnds: clone(missingElementEnds),
      };
    });
    return {
      jointId: joint.id,
      nodeId: joint.nodeId,
      classification: clone(joint.classification),
      lineElementEnds: clone(joint.lineElementEnds),
      demandStates,
      complete: demandStates.length > 0 && demandStates.every((state) => state.complete),
    };
  });
}

export function extractGlobalFemDemands({ model, analysis, result, classification } = {}) {
  if (!model || !analysis || !result || !classification) {
    throw new Error(
      "Global FEM demand extraction requires model, analysis, result and classification.",
    );
  }
  const lineElementDemands = extractLineElementDemands(model, result);
  const shellElementDemands = extractShellElementDemands(model, result);
  const lineDemandIndex = new Map(lineElementDemands.map((item) => [item.lineElementId, item]));
  const shellDemandIndex = new Map(shellElementDemands.map((item) => [item.shellElementId, item]));

  return {
    schema: "strutture-js/global-fem-demand-set",
    version: GLOBAL_FEM_DEMAND_SET_VERSION,
    model: { id: model.id, hash: model.hash },
    analysis: { id: analysis.id, hash: analysis.hash },
    resultId: result.id,
    units: clone(result.units),
    signConventions: clone(result.signConventions),
    provenance: clone(result.provenance),
    lineElementDemands,
    shellElementDemands,
    memberDemands: groupDemands(
      classification.members,
      "lineElementIds",
      lineDemandIndex,
    ),
    surfaceDemands: groupDemands(
      classification.surfaces,
      "shellElementIds",
      shellDemandIndex,
    ),
    jointDemands: extractJointDemands(classification.joints, lineDemandIndex),
    globalResponses: {
      nodalDisplacements: clone(result.results.nodalDisplacements ?? []),
      reactions: clone(result.results.reactions ?? []),
      modes: clone(result.results.modes ?? []),
      sectionCuts: clone(result.results.sectionCuts ?? []),
      storeyResults: clone(result.results.storeyResults ?? []),
      equilibriumResiduals: clone(result.results.equilibriumResiduals ?? []),
      envelopes: clone(result.results.envelopes ?? []),
      qualityIndicators: clone(result.qualityIndicators ?? {}),
    },
    metadata: {
      noCrossElementAxisAggregation: true,
      normativeVerificationPerformed: false,
    },
  };
}
