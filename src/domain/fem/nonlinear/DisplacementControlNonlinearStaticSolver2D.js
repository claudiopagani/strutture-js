import { DenseLinearSolver } from "../../math/DenseLinearSolver.js";
import { createZeroVector } from "../../math/arrayLinearAlgebra.js";
import { KinematicConstraintReducer2D } from "../KinematicConstraintReducer2D.js";

function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}

function scalarVector(scalar, vector) {
  return vector.map((value) => scalar * value);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function norm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
}

function buildAugmentedMatrix(tangentMatrix, referenceLoadVector, controlVector) {
  const size = tangentMatrix.length;
  const augmented = tangentMatrix.map((row, rowIndex) => [
    ...row,
    -referenceLoadVector[rowIndex],
  ]);

  augmented.push([...controlVector, 0]);

  if (augmented.length !== size + 1 || augmented.some((row) => row.length !== size + 1)) {
    throw new Error(
      "DisplacementControlNonlinearStaticSolver2D could not assemble the augmented displacement-control system.",
    );
  }

  return augmented;
}

function maxAbs(values) {
  return values.reduce((maxValue, value) => Math.max(maxValue, Math.abs(value)), 0);
}

function detectRelevantLocalDofIndices(
  tangentMatrix,
  referenceLoadVector,
  controlVector,
  residualVector,
  relativeTolerance = 1e-12,
) {
  const size = tangentMatrix.length;
  const scale = Math.max(
    maxAbs(referenceLoadVector),
    maxAbs(controlVector),
    maxAbs(residualVector),
    ...tangentMatrix.map((row) => maxAbs(row)),
  );
  const threshold = Math.max(relativeTolerance * Math.max(scale, 1), 1e-14);
  const indices = [];

  for (let index = 0; index < size; index += 1) {
    const rowNorm = maxAbs(tangentMatrix[index]);
    const columnNorm = maxAbs(tangentMatrix.map((row) => row[index]));
    const signature = Math.max(
      rowNorm,
      columnNorm,
      Math.abs(referenceLoadVector[index] ?? 0),
      Math.abs(controlVector[index] ?? 0),
      Math.abs(residualVector[index] ?? 0),
    );

    if (signature > threshold) {
      indices.push(index);
    }
  }

  return indices.length > 0 ? indices : Array.from({ length: size }, (_, index) => index);
}

function defaultCloneState(state) {
  if (state == null) {
    return state;
  }

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(state);
    } catch {
      // Fall through to shallow clones below when class instances are not structured-clone friendly.
    }
  }

  if (Array.isArray(state)) {
    return [...state];
  }

  if (typeof state === "object") {
    return { ...state };
  }

  return state;
}

function normalizeEvaluation(evaluation, fallbackState) {
  if (!evaluation || typeof evaluation !== "object") {
    throw new Error(
      "DisplacementControlNonlinearStaticSolver2D evaluator must return an object with internal forces and tangent stiffness.",
    );
  }

  return {
    ...evaluation,
    state:
      evaluation.state ??
      evaluation.hingeStatesByElementId ??
      fallbackState,
    events: evaluation.events ?? evaluation.hingeEvents ?? [],
    responses: evaluation.responses ?? evaluation.elementResponses ?? [],
  };
}

function scatterLocalCorrection(size, activeIndices, reducedCorrection) {
  const fullCorrection = createZeroVector(size);

  for (let index = 0; index < activeIndices.length; index += 1) {
    fullCorrection[activeIndices[index]] = reducedCorrection[index];
  }

  return fullCorrection;
}

function basePoint({
  step,
  iterationCount,
  controlDisplacement,
  loadFactor,
}) {
  return {
    step,
    iterationCount,
    controlDisplacement,
    loadFactor,
  };
}

export class DisplacementControlNonlinearStaticSolver2D {
  constructor({
    linearSolver = new DenseLinearSolver(),
    constraintReducer = new KinematicConstraintReducer2D(),
  } = {}) {
    this.linearSolver = linearSolver;
    this.constraintReducer = constraintReducer;
  }

  solve({
    model,
    evaluator,
    initialState = null,
    cloneState = defaultCloneState,
    controlDisplacementIncrement,
    maxControlDisplacement,
    tolerance = 1e-2,
    maxIterations = 100,
    maxSteps = 200,
    evaluationOptions = {},
    pointBuilder = null,
  } = {}) {
    const fullSize = model?.dofRegistry?.size?.();

    if (!Number.isFinite(fullSize) || fullSize <= 0) {
      throw new Error(
        "DisplacementControlNonlinearStaticSolver2D requires a model with a valid dofRegistry.",
      );
    }

    if (
      !Number.isFinite(controlDisplacementIncrement) ||
      controlDisplacementIncrement <= 0
    ) {
      throw new Error(
        "DisplacementControlNonlinearStaticSolver2D requires a positive controlDisplacementIncrement.",
      );
    }

    if (
      !Number.isFinite(maxControlDisplacement) ||
      maxControlDisplacement <= 0
    ) {
      throw new Error(
        "DisplacementControlNonlinearStaticSolver2D requires a positive maxControlDisplacement.",
      );
    }

    const evaluatorFunction =
      typeof evaluator?.evaluate === "function"
        ? evaluator.evaluate.bind(evaluator)
        : typeof evaluator === "function"
          ? evaluator
          : null;

    if (!evaluatorFunction) {
      throw new Error(
        "DisplacementControlNonlinearStaticSolver2D requires an evaluator with an evaluate() method or a function.",
      );
    }

    const reduction = this.constraintReducer.build({
      dofRegistry: model.dofRegistry,
      supports: model.supports ?? [],
      constraints: model.constraints ?? [],
    });
    const reducedLoadVector = reduction.reduceVector(model.referenceLoadVector);
    const reducedControlVector = reduction.reduceVector(model.controlVector);
    let reducedDisplacements = createZeroVector(reduction.reducedSize());
    let displacements = reduction.expandReducedVector(reducedDisplacements);
    let loadFactor = 0;
    let state = cloneState(initialState);
    let finalEvaluation = null;
    const warnings = [];
    const assumptions = [
      "The non-linear displacement-control solver uses the augmented equilibrium system [Kt -Fext; c^T 0], so it can continue through singular tangents when the control equation regularizes the mechanism.",
      "The displacement-control step length is currently constant; no adaptive step-size strategy or line search is applied yet.",
    ];
    const events = [];
    const points = [
      {
        ...basePoint({
          step: 0,
          iterationCount: 0,
          controlDisplacement: 0,
          loadFactor: 0,
        }),
        ...(pointBuilder?.({
          step: 0,
          iterationCount: 0,
          model,
          displacements,
          loadFactor: 0,
          controlDisplacement: 0,
          state,
          evaluation: null,
          freeIndices: [...reduction.reducedDofIds],
          restrainedIndices: [...reduction.constrainedDofIds],
          reducedDisplacements,
          kinematicReduction: reduction.toJSON(),
        }) ?? {}),
      },
    ];
    let termination = {
      reason: "max-steps-reached",
      step: 0,
      iteration: 0,
    };

    for (let step = 1; step <= maxSteps; step += 1) {
      let deltaDisplacements = createZeroVector(reduction.reducedSize());
      let deltaLoadFactor = 0;
      let trialState = cloneState(state);
      let committedStepState = null;
      let converged = false;
      let abortAnalysis = false;
      let stepIterationCount = 0;
      const stepEvents = [];

      for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
        stepIterationCount = iteration;
        const trialReducedDisplacements = addVectors(
          reducedDisplacements,
          deltaDisplacements,
        );
        const trialFullDisplacements =
          reduction.expandReducedVector(trialReducedDisplacements);
        const evaluation = normalizeEvaluation(
          evaluatorFunction({
            model,
            displacements: trialFullDisplacements,
            state: trialState,
            ...evaluationOptions,
          }),
          trialState,
        );
        const tangentFree = reduction.reduceStiffnessMatrix(
          evaluation.tangentStiffnessMatrix,
        );
        const internalFree = reduction.reduceVector(
          evaluation.internalForceVector,
        );
        const residual = subtractVectors(
          scalarVector(loadFactor + deltaLoadFactor, reducedLoadVector),
          internalFree,
        );
        const residualNorm = norm(residual);
        const controlGap =
          controlDisplacementIncrement -
          dot(reducedControlVector, deltaDisplacements);

        trialState = cloneState(evaluation.state);
        stepEvents.push(
          ...evaluation.events.map((event) => ({
            ...event,
            step,
            iteration,
          })),
        );

        if (
          iteration > 1 &&
          residualNorm < tolerance &&
          Math.abs(controlGap) < tolerance &&
          evaluation.events.length === 0
        ) {
          committedStepState = {
            fullDisplacements: trialFullDisplacements,
            evaluation,
          };
          converged = true;
          break;
        }

        try {
          const activeLocalIndices = detectRelevantLocalDofIndices(
            tangentFree,
            reducedLoadVector,
            reducedControlVector,
            residual,
          );
          const reducedTangent = activeLocalIndices.map((row) =>
            activeLocalIndices.map((column) => tangentFree[row][column]),
          );
          const reducedLoadSubvector = activeLocalIndices.map(
            (index) => reducedLoadVector[index],
          );
          const reducedControlSubvector = activeLocalIndices.map(
            (index) => reducedControlVector[index],
          );
          const reducedResidual = activeLocalIndices.map(
            (index) => residual[index],
          );
          const augmentedMatrix = buildAugmentedMatrix(
            reducedTangent,
            reducedLoadSubvector,
            reducedControlSubvector,
          );
          const augmentedCorrection = this.linearSolver.solve(augmentedMatrix, [
            ...reducedResidual,
            controlGap,
          ]);
          const displacementCorrection = scatterLocalCorrection(
            reduction.reducedSize(),
            activeLocalIndices,
            augmentedCorrection.slice(0, activeLocalIndices.length),
          );
          const loadFactorCorrection = augmentedCorrection.at(-1);

          deltaDisplacements = addVectors(deltaDisplacements, displacementCorrection);
          deltaLoadFactor += loadFactorCorrection;
        } catch (error) {
          warnings.push(
            `Non-linear displacement-control analysis stopped at step ${step}, iteration ${iteration} because the augmented system became singular or ill-conditioned: ${error.message}`,
          );
          termination = {
            reason: "singular-augmented-system",
            step,
            iteration,
          };
          abortAnalysis = true;
          break;
        }
      }

      if (!converged && committedStepState == null) {
        if (abortAnalysis) {
          break;
        }

        if (stepIterationCount >= maxIterations) {
          warnings.push(
            `Non-linear displacement-control analysis stopped at step ${step} because convergence was not reached within ${maxIterations} iterations.`,
          );
          termination = {
            reason: "max-iterations",
            step,
            iteration: stepIterationCount,
          };
        }

        break;
      }

      if (!committedStepState) {
        const committedReducedDisplacements = addVectors(
          reducedDisplacements,
          deltaDisplacements,
        );
        const committedFullDisplacements =
          reduction.expandReducedVector(committedReducedDisplacements);

        committedStepState = {
          fullDisplacements: committedFullDisplacements,
          evaluation: normalizeEvaluation(
            evaluatorFunction({
              model,
              displacements: committedFullDisplacements,
              state: trialState,
              ...evaluationOptions,
            }),
            trialState,
          ),
        };
      }

      displacements = [...committedStepState.fullDisplacements];
      reducedDisplacements = addVectors(reducedDisplacements, deltaDisplacements);
      loadFactor += deltaLoadFactor;
      state = cloneState(committedStepState.evaluation.state);
      finalEvaluation = committedStepState.evaluation;
      events.push(...stepEvents);

      const controlDisplacement = dot(model.controlVector, displacements);

      points.push({
        ...basePoint({
          step,
          iterationCount: stepIterationCount,
          controlDisplacement,
          loadFactor,
        }),
        ...(pointBuilder?.({
          step,
          iterationCount: stepIterationCount,
          model,
          displacements,
          loadFactor,
          controlDisplacement,
          state,
          evaluation: committedStepState.evaluation,
          freeIndices: [...reduction.reducedDofIds],
          restrainedIndices: [...reduction.constrainedDofIds],
          reducedDisplacements,
          kinematicReduction: reduction.toJSON(),
        }) ?? {}),
      });

      if (
        controlDisplacement >= maxControlDisplacement - Math.max(1e-9, tolerance)
      ) {
        termination = {
          reason: "target-displacement-reached",
          step,
          iteration: stepIterationCount,
        };
        break;
      }
    }

    if (points.length === 1 && termination.reason === "max-steps-reached") {
      termination = {
        reason: "no-progress",
        step: 0,
        iteration: 0,
      };
    }

    return {
      points,
      events,
      finalState: state,
      finalEvaluation,
      finalDisplacements: displacements,
      finalLoadFactor: loadFactor,
      warnings,
      assumptions,
      termination,
      freeDofIds: [...reduction.reducedDofIds],
      restrainedDofIds: [...reduction.constrainedDofIds],
      kinematicReduction: reduction.toJSON(),
    };
  }
}
