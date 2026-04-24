import { DenseLinearSolver } from "../../../domain/math/DenseLinearSolver.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
const EPS = 1e-9;

const PLASTIC_GENERALIZED_DOF_DEFINITIONS = Object.freeze({
  start: Object.freeze({
    id: "start",
    hVector: [0, 0, -1, 0, 0, 0],
    capacityKind: "moment",
    physicalForce(localEndForces) {
      return localEndForces[2];
    },
    prescribedGeneralizedForce(sign, capacity) {
      return sign === "negative" ? capacity : -capacity;
    },
  }),
  end: Object.freeze({
    id: "end",
    hVector: [0, 0, 0, 0, 0, -1],
    capacityKind: "moment",
    physicalForce(localEndForces) {
      return localEndForces[5];
    },
    prescribedGeneralizedForce(sign, capacity) {
      return sign === "negative" ? capacity : -capacity;
    },
  }),
  shear: Object.freeze({
    id: "shear",
    hVector: [0, -0.5, 0, 0, 0.5, 0],
    capacityKind: "force",
    physicalForce(localEndForces) {
      return -0.5 * localEndForces[1] + 0.5 * localEndForces[4];
    },
    prescribedGeneralizedForce(sign, capacity) {
      return sign === "negative" ? -capacity : capacity;
    },
  }),
});

function createZeroMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function createZeroVector(size) {
  return new Array(size).fill(0);
}

function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function multiplyMatrices(left, right) {
  if (left.length === 0 || right.length === 0) {
    return createZeroMatrix(left.length);
  }

  return left.map((leftRow) =>
    right[0].map((_, column) =>
      leftRow.reduce((sum, value, index) => sum + value * right[index][column], 0),
    ),
  );
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function subtractMatrices(left, right) {
  return left.map((row, rowIndex) =>
    row.map((value, columnIndex) => value - right[rowIndex][columnIndex]),
  );
}

function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}

function invertDenseMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0 || matrix.length !== matrix[0].length) {
    throw new Error("Masonry equivalent-frame pushover requires a square dense matrix.");
  }

  const solver = new DenseLinearSolver();
  const size = matrix.length;
  const inverse = createZeroMatrix(size);

  for (let column = 0; column < size; column += 1) {
    const unitVector = new Array(size).fill(0);
    unitVector[column] = 1;
    const solution = solver.solve(matrix, unitVector);

    for (let row = 0; row < size; row += 1) {
      inverse[row][column] = solution[row];
    }
  }

  return inverse;
}

function signLabel(value) {
  if (!Number.isFinite(value) || value >= 0) {
    return "positive";
  }

  return "negative";
}

function cloneHingeState(state = null) {
  return {
    start: state?.start ?? null,
    end: state?.end ?? null,
    shear: state?.shear ?? null,
    history: [...(state?.history ?? [])],
  };
}

function activeHingeCount(state = null) {
  return (
    Number(state?.start != null) +
    Number(state?.end != null) +
    Number(state?.shear != null)
  );
}

function cloneContributorState(state = null) {
  return {
    failed: Boolean(state?.failed),
    hingeState: cloneHingeState(state?.hingeState),
  };
}

function withActivation(state, position, sign, metadata = {}) {
  if (state?.[position] != null) {
    return cloneHingeState(state);
  }

  return {
    ...cloneHingeState(state),
    [position]: sign,
    history: [
      ...(state?.history ?? []),
      {
        type: "plastic-hinge-activation",
        position,
        sign,
        ...metadata,
      },
    ],
  };
}

function activationDelta(previousState, nextState) {
  const events = [];

  for (const position of ["start", "end", "shear"]) {
    if (previousState?.[position] == null && nextState?.[position] != null) {
      events.push({ position, sign: nextState[position] });
    }
  }

  return events;
}

function minPositive(values = []) {
  const finitePositiveValues = values.filter(
    (value) => Number.isFinite(value) && value > EPS,
  );

  return finitePositiveValues.length > 0
    ? Math.min(...finitePositiveValues)
    : null;
}

function postFailureDisplacement(displacement) {
  return displacement + Math.max(displacement * 1e-6, 1e-6);
}

function activePositions(state = null, capacitiesByPosition = {}) {
  return ["start", "end", "shear"].filter(
    (position) =>
      state?.[position] != null &&
      Number.isFinite(capacitiesByPosition[position]?.value) &&
      capacitiesByPosition[position].value > EPS,
  );
}

function responseForState(element, localDisplacements, state, capacitiesByPosition) {
  const localElasticStiffness = element.localStiffness();
  const positions = activePositions(state, capacitiesByPosition);

  if (positions.length === 0) {
    return {
      localEndForces: multiplyMatrixVector(localElasticStiffness, localDisplacements),
      tangentLocalStiffness: localElasticStiffness,
      plasticGeneralizedDisplacements: [],
    };
  }

  const h = Array.from({ length: 6 }, () => new Array(positions.length).fill(0));

  positions.forEach((position, columnIndex) => {
    const vector = PLASTIC_GENERALIZED_DOF_DEFINITIONS[position].hVector;

    for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
      h[rowIndex][columnIndex] = vector[rowIndex];
    }
  });

  const ht = transpose(h);
  const kaa = multiplyMatrices(ht, multiplyMatrices(localElasticStiffness, h));
  const inverseKaa = invertDenseMatrix(kaa);
  const elasticGeneralizedForces = multiplyMatrixVector(
    ht,
    multiplyMatrixVector(localElasticStiffness, localDisplacements),
  );
  const prescribedGeneralizedForces = positions.map((position) =>
    PLASTIC_GENERALIZED_DOF_DEFINITIONS[position].prescribedGeneralizedForce(
      state[position],
      capacitiesByPosition[position].value,
    ),
  );
  const plasticGeneralizedDisplacements = multiplyMatrixVector(
    inverseKaa,
    subtractVectors(prescribedGeneralizedForces, elasticGeneralizedForces),
  );
  const localElasticDisplacements = addVectors(
    localDisplacements,
    multiplyMatrixVector(h, plasticGeneralizedDisplacements),
  );
  const localEndForces = multiplyMatrixVector(
    localElasticStiffness,
    localElasticDisplacements,
  );
  const tangentLocalStiffness = subtractMatrices(
    localElasticStiffness,
    multiplyMatrices(
      multiplyMatrices(localElasticStiffness, h),
      multiplyMatrices(inverseKaa, multiplyMatrices(ht, localElasticStiffness)),
    ),
  );

  return {
    localEndForces,
    tangentLocalStiffness,
    plasticGeneralizedDisplacements,
  };
}

function activateMissingMechanisms(
  localEndForces,
  state,
  capacitiesByPosition,
  yieldTolerance,
  elementId,
  contributor,
) {
  let updatedState = cloneHingeState(state);

  for (const position of ["start", "end", "shear"]) {
    if (updatedState[position] != null) {
      continue;
    }

    const capacity = capacitiesByPosition[position]?.value;

    if (!Number.isFinite(capacity) || capacity <= EPS) {
      continue;
    }

    const definition = PLASTIC_GENERALIZED_DOF_DEFINITIONS[position];
    const physicalForce = definition.physicalForce(localEndForces);
    const activationThreshold =
      capacity * (1 - Math.max(0, yieldTolerance ?? 1e-9));

    if (Math.abs(physicalForce) >= activationThreshold) {
      updatedState = withActivation(updatedState, position, signLabel(physicalForce), {
        elementId,
        pierId: contributor.pierId,
        wallId: contributor.wallId,
        capacityKind: definition.capacityKind,
        physicalCapacity: capacity,
        trialForce: physicalForce,
      });
    }
  }

  return updatedState;
}

function absolutePierTopDisplacement(frame, element, displacements) {
  const topIndex = frame.dofRegistry.getIndex(element.endNode, "ux");
  const baseIndex = frame.dofRegistry.getIndex(element.startNode, "ux");

  return Math.abs((displacements[topIndex] ?? 0) - (displacements[baseIndex] ?? 0));
}

function baseShearFromGlobalEndForces(frame, element, globalEndForces) {
  const dofIds = element.getDofIds(frame.dofRegistry);
  const baseUxIndex = dofIds.findIndex(
    (dofId) => dofId === frame.dofRegistry.getDofId(element.startNode, "ux"),
  );

  return baseUxIndex >= 0 ? Math.abs(globalEndForces[baseUxIndex] ?? 0) : 0;
}

export function createMasonryEquivalentFrameContributorDefinition({
  alignment,
  pier,
  topRotation = "free",
} = {}) {
  const toFem = createUnitResolver(alignment.units, FEM_UNITS);
  const flexuralCapacity = pier.mechanics?.flexural?.MRd;
  const shearCapacity = minPositive([
    pier.mechanics?.bedJointSliding?.V,
    pier.mechanics?.diagonalCracking?.V,
  ]);
  const endFlexuralCapacity =
    topRotation === "fixed"
      ? flexuralCapacity
      : flexuralCapacity;

  return {
    pierId: pier.id,
    wallId: pier.wallId,
    topRotation,
    governingFamily: pier.governingFamily,
    governingMode: pier.governingMode,
    failureDisplacement: postFailureDisplacement(
      toFem.length(pier.ultimateDisplacement),
    ),
    capacitiesByPosition: {
      start:
        Number.isFinite(flexuralCapacity) && flexuralCapacity > EPS
          ? {
              kind: "moment",
              value: toFem.moment(flexuralCapacity),
            }
          : null,
      end:
        Number.isFinite(endFlexuralCapacity) && endFlexuralCapacity > EPS
          ? {
              kind: "moment",
              value: toFem.moment(endFlexuralCapacity),
            }
          : null,
      shear:
        Number.isFinite(shearCapacity) && shearCapacity > EPS
          ? {
              kind: "force",
              value: toFem.force(shearCapacity),
            }
          : null,
    },
  };
}

function evaluateContributor({
  frame,
  element,
  displacements,
  contributor,
  state = null,
  yieldTolerance = 1e-9,
}) {
  const previous = cloneContributorState(state);
  const topDisplacement = absolutePierTopDisplacement(frame, element, displacements);

  if (previous.failed || topDisplacement >= contributor.failureDisplacement) {
    const nextState = {
      ...cloneContributorState(previous),
      failed: true,
    };

    return {
      internalForceVector: createZeroVector(frame.dofRegistry.size()),
      tangentStiffnessMatrix: createZeroMatrix(frame.dofRegistry.size()),
      state: nextState,
      events:
        previous.failed
          ? []
          : [
              {
                type: "pier-failure",
                elementId: element.id,
                pierId: contributor.pierId,
                wallId: contributor.wallId,
                failureMode: contributor.governingMode,
              },
            ],
      response: {
        elementId: element.id,
        pierId: contributor.pierId,
        wallId: contributor.wallId,
        governingMode: contributor.governingMode,
        mechanismModel: "equivalent-frame-hinges-and-shear-plateau",
        baseShear: 0,
        failed: true,
        hingeCount: activeHingeCount(previous.hingeState),
        hingeState: cloneHingeState(previous.hingeState),
      },
    };
  }

  const localDisplacements = element.localDisplacements(
    displacements,
    frame.dofRegistry,
  );
  let trialHingeState = cloneHingeState(previous.hingeState);
  let response = null;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    response = responseForState(
      element,
      localDisplacements,
      trialHingeState,
      contributor.capacitiesByPosition,
    );
    const updatedState = activateMissingMechanisms(
      response.localEndForces,
      trialHingeState,
      contributor.capacitiesByPosition,
      yieldTolerance,
      element.id,
      contributor,
    );

    if (
      updatedState.start === trialHingeState.start &&
      updatedState.end === trialHingeState.end &&
      updatedState.shear === trialHingeState.shear
    ) {
      break;
    }

    trialHingeState = updatedState;
  }

  const transformation = element.transformationMatrix();
  const tangentGlobalStiffness = multiplyMatrices(
    transpose(transformation),
    multiplyMatrices(response.tangentLocalStiffness, transformation),
  );
  const globalEndForces = multiplyMatrixVector(
    transpose(transformation),
    response.localEndForces,
  );
  const dofIds = element.getDofIds(frame.dofRegistry);
  const indices = dofIds.map((dofId) => frame.dofRegistry.getIndex(dofId));
  const internalForceVector = createZeroVector(frame.dofRegistry.size());
  const tangentStiffnessMatrix = createZeroMatrix(frame.dofRegistry.size());

  for (let localRow = 0; localRow < indices.length; localRow += 1) {
    const globalRow = indices[localRow];

    internalForceVector[globalRow] += globalEndForces[localRow];

    for (let localColumn = 0; localColumn < indices.length; localColumn += 1) {
      const globalColumn = indices[localColumn];

      tangentStiffnessMatrix[globalRow][globalColumn] +=
        tangentGlobalStiffness[localRow][localColumn];
    }
  }

  const nextState = {
    failed: false,
    hingeState: cloneHingeState(trialHingeState),
  };

  return {
    internalForceVector,
    tangentStiffnessMatrix,
    state: nextState,
    events: activationDelta(previous.hingeState, trialHingeState).map((event) => ({
      ...event,
      type: "plastic-hinge-activation",
      elementId: element.id,
      pierId: contributor.pierId,
      wallId: contributor.wallId,
      capacityKind:
        PLASTIC_GENERALIZED_DOF_DEFINITIONS[event.position].capacityKind,
      plasticCapacity:
        contributor.capacitiesByPosition[event.position]?.value ?? null,
    })),
    response: {
      elementId: element.id,
      pierId: contributor.pierId,
      wallId: contributor.wallId,
      governingMode: contributor.governingMode,
      mechanismModel: "equivalent-frame-hinges-and-shear-plateau",
      baseShear: baseShearFromGlobalEndForces(frame, element, globalEndForces),
      failed: false,
      hingeCount: activeHingeCount(trialHingeState),
      hingeState: cloneHingeState(trialHingeState),
      localEndForces: [...response.localEndForces],
      globalEndForces: [...globalEndForces],
      plasticGeneralizedDisplacements: [...response.plasticGeneralizedDisplacements],
    },
  };
}

export class MasonryEquivalentFramePushoverInternalForces {
  constructor({
    contributorsByElementId = {},
  } = {}) {
    this.contributorsByElementId = contributorsByElementId;
  }

  evaluate({
    frame,
    model,
    displacements,
    state = {},
    yieldTolerance = 1e-9,
  } = {}) {
    const resolvedFrame = model ?? frame;
    const size = resolvedFrame?.dofRegistry?.size?.();

    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(
        "MasonryEquivalentFramePushoverInternalForces requires a frame with a populated dofRegistry.",
      );
    }

    if (!Array.isArray(displacements) || displacements.length !== size) {
      throw new Error(
        "MasonryEquivalentFramePushoverInternalForces requires a displacement vector matching the frame DOF count.",
      );
    }

    const internalForceVector = createZeroVector(size);
    const tangentStiffnessMatrix = createZeroMatrix(size);
    const updatedStates = {};
    const events = [];
    const responses = [];

    for (const element of resolvedFrame.elements ?? []) {
      const contributor = this.contributorsByElementId[element.id];

      if (!contributor) {
        continue;
      }

      const evaluation = evaluateContributor({
        frame: resolvedFrame,
        element,
        displacements,
        contributor,
        state: state?.[element.id],
        yieldTolerance,
      });

      updatedStates[element.id] = evaluation.state;
      events.push(...evaluation.events);
      responses.push(evaluation.response);

      for (let row = 0; row < size; row += 1) {
        internalForceVector[row] += evaluation.internalForceVector[row];

        for (let column = 0; column < size; column += 1) {
          tangentStiffnessMatrix[row][column] +=
            evaluation.tangentStiffnessMatrix[row][column];
        }
      }
    }

    return {
      internalForceVector,
      tangentStiffnessMatrix,
      state: updatedStates,
      events,
      responses,
      hingeStatesByElementId: updatedStates,
      hingeEvents: events,
      elementResponses: responses,
    };
  }
}
