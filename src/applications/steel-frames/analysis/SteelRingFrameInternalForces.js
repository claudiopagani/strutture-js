import { SteelPlasticHingeState } from "./SteelPlasticHingeState.js";

function createZeroMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function createZeroVector(size) {
  return new Array(size).fill(0);
}

function normalizeState(stateLike) {
  return stateLike instanceof SteelPlasticHingeState
    ? stateLike
    : new SteelPlasticHingeState(stateLike);
}

export class SteelRingFrameInternalForces {
  evaluate({
    frame,
    model,
    displacements,
    state = undefined,
    hingeStatesByElementId = {},
    yieldTolerance = 1e-9,
  } = {}) {
    const resolvedFrame = model ?? frame;
    const size = resolvedFrame?.dofRegistry?.size?.();

    if (!Number.isFinite(size) || size <= 0) {
      throw new Error("SteelRingFrameInternalForces requires a frame with a populated dofRegistry.");
    }

    if (!Array.isArray(displacements) || displacements.length !== size) {
      throw new Error(
        "SteelRingFrameInternalForces requires a displacement vector matching the frame DOF count.",
      );
    }

    const internalForceVector = createZeroVector(size);
    const tangentStiffnessMatrix = createZeroMatrix(size);
    const updatedStates = {};
    const elementResponses = [];
    const hingeEvents = [];

    const currentStates =
      state && typeof state === "object"
        ? state
        : hingeStatesByElementId;

    for (const element of resolvedFrame.elements) {
      const previousState = normalizeState(currentStates[element.id]);
      const response = element.evaluate({
        globalDisplacements: displacements,
        dofRegistry: resolvedFrame.dofRegistry,
        hingeState: previousState,
        yieldTolerance,
      });
      const dofIds = element.getDofIds(resolvedFrame.dofRegistry);
      const indices = dofIds.map((dofId) => resolvedFrame.dofRegistry.getIndex(dofId));

      updatedStates[element.id] = response.hingeState;

      for (let localRow = 0; localRow < indices.length; localRow += 1) {
        const globalRow = indices[localRow];

        internalForceVector[globalRow] += response.globalEndForces[localRow];

        for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
          const globalColumn = indices[localColumn];

          tangentStiffnessMatrix[globalRow][globalColumn] +=
            response.tangentGlobalStiffness[localRow][localColumn];
        }
      }

      hingeEvents.push(
        ...response.newActivations.map((event) => ({
          ...event,
          elementId: element.id,
          role: element.metadata?.role ?? null,
          plasticMoment: element.plasticMomentCapacity(event.position),
        })),
      );

      elementResponses.push({
        elementId: element.id,
        role: element.metadata?.role ?? null,
        localEndForces: [...response.localEndForces],
        globalEndForces: [...response.globalEndForces],
        plasticRotations: [...response.plasticRotations],
        hingeState: response.hingeState.toJSON(),
      });
    }

    return {
      internalForceVector,
      tangentStiffnessMatrix,
      state: updatedStates,
      events: hingeEvents,
      responses: elementResponses,
      hingeStatesByElementId: updatedStates,
      hingeEvents,
      elementResponses,
    };
  }
}
