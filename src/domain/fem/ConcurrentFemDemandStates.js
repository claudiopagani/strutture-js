/**
 * Solver-neutral projections of GlobalFemDemandSet states.
 *
 * Every returned record represents one real solver state at one element
 * station. Components are never enveloped independently, remapped to a
 * normative axis, converted to another unit system, or defaulted to zero.
 */

export const GLOBAL_FEM_LINE_ACTION_COMPONENTS = Object.freeze([
  "N",
  "Vy",
  "Vz",
  "T",
  "My",
  "Mz",
]);

export const GLOBAL_FEM_SHELL_RESULTANT_COMPONENTS = Object.freeze([
  "Nx",
  "Ny",
  "Nxy",
  "Mx",
  "My",
  "Mxy",
  "Vx",
  "Vy",
]);

export const GLOBAL_FEM_SECTION_CUT_COMPONENTS = Object.freeze([
  "Fx",
  "Fy",
  "Fz",
  "Mx",
  "My",
  "Mz",
]);

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
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finiteActions(actions, label) {
  if (actions == null || typeof actions !== "object" || Array.isArray(actions)) {
    throw new Error(`${label} must contain line-element actions.`);
  }

  return Object.fromEntries(GLOBAL_FEM_LINE_ACTION_COMPONENTS.map((component) => {
    const value = actions[component];
    if (!Number.isFinite(value)) {
      throw new Error(`${label}.${component} must be finite; got ${value}.`);
    }
    return [component, value];
  }));
}

function finiteComponents(value, components, label) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain numeric components.`);
  }

  return Object.fromEntries(components.map((component) => {
    const componentValue = value[component];
    if (!Number.isFinite(componentValue)) {
      throw new Error(
        `${label}.${component} must be finite; got ${componentValue}.`,
      );
    }
    return [component, componentValue];
  }));
}

function finiteStation(station, label) {
  if (!Number.isFinite(station?.xi) || station.xi < 0 || station.xi > 1) {
    throw new Error(`${label}.xi must be finite and lie in [0, 1].`);
  }
  if (station.position != null && !Number.isFinite(station.position)) {
    throw new Error(`${label}.position must be finite when supplied.`);
  }

  return {
    xi: station.xi,
    ...(station.position == null ? {} : { position: station.position }),
    ...(station.side == null ? {} : { side: station.side }),
  };
}

function referenceMatches(reference, selector) {
  return REFERENCE_KEYS.every((key) =>
    selector[key] === undefined || reference?.[key] === selector[key]);
}

/**
 * Flatten one line-element demand without losing concurrent components.
 */
export function collectConcurrentLineElementActionStates(lineElementDemand) {
  if (lineElementDemand == null) {
    throw new Error("A lineElementDemand is required.");
  }

  return (lineElementDemand.actionStates ?? []).flatMap((state, stateIndex) =>
    (state.stations ?? []).map((station, stationIndex) => ({
      lineElementId: lineElementDemand.lineElementId,
      sectionId: lineElementDemand.sectionId ?? null,
      materialId: lineElementDemand.materialId ?? null,
      localAxes: clone(lineElementDemand.localAxes ?? null),
      coordinateSystem: state.coordinateSystem ?? null,
      reference: clone(state.reference ?? {}),
      station: finiteStation(
        station,
        `actionStates[${stateIndex}].stations[${stationIndex}]`,
      ),
      actions: finiteActions(
        station.actions,
        `actionStates[${stateIndex}].stations[${stationIndex}].actions`,
      ),
    })),
  );
}

/**
 * Flatten every finite-element segment assigned to one structural member.
 */
export function collectConcurrentMemberActionStates(memberDemand) {
  if (memberDemand == null) {
    throw new Error("A memberDemand is required.");
  }

  return (memberDemand.elementDemands ?? []).flatMap((elementDemand) =>
    collectConcurrentLineElementActionStates(elementDemand).map((state) => ({
      memberId: memberDemand.id,
      classification: clone(memberDemand.classification ?? null),
      ...state,
    })),
  );
}

/**
 * Select concurrent states by an exact subset of their FEM result reference.
 */
export function filterConcurrentFemStates(states, selector = {}) {
  if (!Array.isArray(states)) {
    throw new Error("Concurrent FEM states must be an array.");
  }
  const unknownKeys = Object.keys(selector).filter((key) =>
    !REFERENCE_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unsupported FEM reference selector keys: ${unknownKeys.join(", ")}.`,
    );
  }

  return states.filter((state) => referenceMatches(state.reference, selector));
}

/**
 * Preserve each complete/incomplete joint state exactly as extracted.
 */
export function collectConcurrentJointActionStates(jointDemand) {
  if (jointDemand == null) {
    throw new Error("A jointDemand is required.");
  }

  return (jointDemand.demandStates ?? []).map((state, stateIndex) => ({
    jointId: jointDemand.jointId,
    nodeId: jointDemand.nodeId,
    reference: clone(state.reference ?? {}),
    complete: state.complete === true,
    missingElementEnds: clone(state.missingElementEnds ?? []),
    elementEnds: (state.elementEnds ?? []).map((elementEnd, endIndex) => ({
      lineElementId: elementEnd.lineElementId,
      end: elementEnd.end,
      coordinateSystem: elementEnd.coordinateSystem ?? null,
      atElementEnd: elementEnd.atElementEnd === true,
      station: elementEnd.station == null
        ? null
        : {
            ...finiteStation(
              elementEnd.station,
              `demandStates[${stateIndex}].elementEnds[${endIndex}].station`,
            ),
            actions: finiteActions(
              elementEnd.station.actions,
              `demandStates[${stateIndex}].elementEnds[${endIndex}].station.actions`,
            ),
          },
    })),
  }));
}

/**
 * Flatten shell-resultant states across every finite element of one mapped
 * structural surface. No cross-element axis aggregation is performed.
 */
export function collectConcurrentSurfaceResultantStates(surfaceDemand) {
  if (surfaceDemand == null) {
    throw new Error("A surfaceDemand is required.");
  }

  return (surfaceDemand.elementDemands ?? []).flatMap((elementDemand) =>
    (elementDemand.resultantStates ?? []).map((state, stateIndex) => ({
      surfaceId: surfaceDemand.id,
      classification: clone(surfaceDemand.classification ?? null),
      shellElementId: elementDemand.shellElementId,
      sectionId: elementDemand.sectionId ?? null,
      materialId: elementDemand.materialId ?? null,
      localAxes: clone(elementDemand.localAxes ?? null),
      coordinateSystem: state.coordinateSystem ?? null,
      face: state.face ?? null,
      location: clone(state.location ?? null),
      reference: clone(state.reference ?? {}),
      components: finiteComponents(
        state.components,
        GLOBAL_FEM_SHELL_RESULTANT_COMPONENTS,
        `resultantStates[${stateIndex}].components`,
      ),
    })),
  );
}

/**
 * Collect section-cut resultants for a declared set of cut identifiers.
 */
export function collectConcurrentSectionCutStates({
  sectionCutIds,
  globalResponses,
} = {}) {
  if (!Array.isArray(sectionCutIds)) {
    throw new Error("sectionCutIds must be an array.");
  }
  const selectedIds = new Set(sectionCutIds);

  return (globalResponses?.sectionCuts ?? [])
    .filter((state) => selectedIds.has(state.sectionCutId))
    .map((state, stateIndex) => ({
      sectionCutId: state.sectionCutId,
      coordinateSystem: state.coordinateSystem ?? null,
      position: clone(state.position ?? null),
      reference: Object.fromEntries(REFERENCE_KEYS
        .filter((key) => state[key] !== undefined)
        .map((key) => [key, state[key]])),
      resultants: finiteComponents(
        state.resultants,
        GLOBAL_FEM_SECTION_CUT_COMPONENTS,
        `sectionCuts[${stateIndex}].resultants`,
      ),
    }));
}

/**
 * Return support reactions as concurrent solver states. Signs and units remain
 * exactly those declared by GlobalFemDemandSet.
 */
export function collectConcurrentSupportReactionStates({
  nodeId,
  globalResponses,
} = {}) {
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    throw new Error("A support nodeId is required.");
  }

  return (globalResponses?.reactions ?? [])
    .filter((reaction) => reaction.nodeId === nodeId)
    .map((reaction, reactionIndex) => ({
      nodeId,
      coordinateSystem: reaction.coordinateSystem ?? null,
      reference: Object.fromEntries(REFERENCE_KEYS
        .filter((key) => reaction[key] !== undefined)
        .map((key) => [key, reaction[key]])),
      forces: finiteComponents(
        reaction.forces,
        ["x", "y", "z"],
        `reactions[${reactionIndex}].forces`,
      ),
      moments: finiteComponents(
        reaction.moments,
        ["x", "y", "z"],
        `reactions[${reactionIndex}].moments`,
      ),
    }));
}
