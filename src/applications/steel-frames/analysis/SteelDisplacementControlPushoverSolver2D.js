import { DisplacementControlNonlinearStaticSolver2D } from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import { DenseLinearSolver } from "../../../domain/math/DenseLinearSolver.js";
import { SteelRingFrameInternalForces } from "./SteelRingFrameInternalForces.js";

function cloneHingeStates(statesByElementId = {}) {
  return Object.fromEntries(
    Object.entries(statesByElementId).map(([elementId, state]) => [
      elementId,
      typeof state?.clone === "function" ? state.clone() : state,
    ]),
  );
}

function countActiveHinges(statesByElementId = {}) {
  return Object.values(statesByElementId).reduce(
    (sum, state) => sum + (typeof state?.activeCount === "function" ? state.activeCount() : 0),
    0,
  );
}

function baseShearFromEvaluation(frame, evaluation) {
  const constrainedUxIndices = (frame.supports ?? []).map((support) =>
    frame.dofRegistry.getIndex(support.node, "ux"),
  );

  return Math.abs(
    constrainedUxIndices.reduce(
      (sum, index) => sum + (evaluation?.internalForceVector?.[index] ?? 0),
      0,
    ),
  );
}

export class SteelDisplacementControlPushoverSolver2D {
  constructor({
    linearSolver = new DenseLinearSolver(),
    internalForces = new SteelRingFrameInternalForces(),
    nonlinearSolver = new DisplacementControlNonlinearStaticSolver2D({
      linearSolver,
    }),
  } = {}) {
    this.linearSolver = linearSolver;
    this.internalForces = internalForces;
    this.nonlinearSolver = nonlinearSolver;
  }

  solve({
    frame,
    controlDisplacementIncrement,
    maxControlDisplacement,
    tolerance = 1e-2,
    maxIterations = 100,
    maxSteps = 200,
    yieldTolerance = 1e-9,
  } = {}) {
    const solverResult = this.nonlinearSolver.solve({
      model: frame,
      evaluator: this.internalForces,
      initialState: {},
      cloneState: cloneHingeStates,
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
      }),
    });

    return {
      ...solverResult,
      hingeEvents: solverResult.events,
      hingeStatesByElementId: solverResult.finalState ?? {},
    };
  }
}
