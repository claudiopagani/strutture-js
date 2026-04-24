import { DisplacementControlNonlinearStaticSolver2D } from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import { DenseLinearSolver } from "../../../domain/math/DenseLinearSolver.js";
import { MasonryEquivalentFramePushoverInternalForces } from "./MasonryEquivalentFramePushoverInternalForces.js";

function cloneContributorState(state = null) {
  if (state?.kind === "steel-ring-frame") {
    return {
      kind: "steel-ring-frame",
      hingeState: {
        start: state?.hingeState?.start ?? null,
        end: state?.hingeState?.end ?? null,
        history: [...(state?.hingeState?.history ?? [])],
      },
    };
  }

  return {
    failed: Boolean(state?.failed),
    hingeState: {
      start: state?.hingeState?.start ?? null,
      end: state?.hingeState?.end ?? null,
      shear: state?.hingeState?.shear ?? null,
      history: [...(state?.hingeState?.history ?? [])],
    },
  };
}

function cloneContributorStates(statesByElementId = {}) {
  return Object.fromEntries(
    Object.entries(statesByElementId).map(([elementId, state]) => [
      elementId,
      cloneContributorState(state),
    ]),
  );
}

function countActiveHinges(statesByElementId = {}) {
  return Object.values(statesByElementId).reduce(
    (sum, state) => {
      const shearHingeCount =
        state?.kind === "steel-ring-frame"
          ? 0
          : Number(state?.hingeState?.shear != null);

      return (
        sum +
        Number(state?.hingeState?.start != null) +
        Number(state?.hingeState?.end != null) +
        shearHingeCount
      );
    },
    0,
  );
}

function baseShearFromEvaluation(frame, evaluation) {
  const constrainedUxIndices = (frame.supports ?? [])
    .filter((support) => support.isRestrained?.("ux") ?? support.restraints?.ux)
    .map((support) => frame.dofRegistry.getIndex(support.node, "ux"));

  return Math.abs(
    constrainedUxIndices.reduce(
      (sum, index) => sum + (evaluation?.internalForceVector?.[index] ?? 0),
      0,
    ),
  );
}

function pierBaseShearsById(responses = []) {
  const result = {};

  for (const response of responses) {
    if (!response?.pierId) {
      continue;
    }

    result[response.pierId] = response.baseShear ?? 0;
  }

  return result;
}

function pierHingeCountsById(responses = []) {
  const result = {};

  for (const response of responses) {
    if (!response?.pierId) {
      continue;
    }

    result[response.pierId] = response.hingeCount ?? 0;
  }

  return result;
}

export class MasonryEquivalentFramePushoverSolver2D {
  constructor({
    linearSolver = new DenseLinearSolver(),
    nonlinearSolver = new DisplacementControlNonlinearStaticSolver2D({
      linearSolver,
    }),
  } = {}) {
    this.linearSolver = linearSolver;
    this.nonlinearSolver = nonlinearSolver;
  }

  solve({
    frame,
    contributorsByElementId,
    controlDisplacementIncrement,
    maxControlDisplacement,
    tolerance = 1e-2,
    maxIterations = 100,
    maxSteps = 200,
    yieldTolerance = 1e-9,
  } = {}) {
    const internalForces = new MasonryEquivalentFramePushoverInternalForces({
      contributorsByElementId,
    });
    const solverResult = this.nonlinearSolver.solve({
      model: frame,
      evaluator: internalForces,
      initialState: {},
      cloneState: cloneContributorStates,
      controlDisplacementIncrement,
      maxControlDisplacement,
      tolerance,
      maxIterations,
      maxSteps,
      evaluationOptions: { yieldTolerance },
      pointBuilder: ({
        model,
        evaluation,
        state,
      }) => ({
        baseShear: evaluation ? baseShearFromEvaluation(model, evaluation) : 0,
        hingeCount: countActiveHinges(state),
        pierBaseShearsById: pierBaseShearsById(evaluation?.responses ?? []),
        pierHingeCountsById: pierHingeCountsById(evaluation?.responses ?? []),
      }),
    });

    return {
      ...solverResult,
      hingeEvents: solverResult.events,
      hingeStatesByElementId: solverResult.finalState ?? {},
    };
  }
}
