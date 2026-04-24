import { DenseLinearSolver } from "../math/DenseLinearSolver.js";
import { DofRegistry } from "./DofRegistry.js";
import { FemAssembler2D } from "./FemAssembler2D.js";
import { KinematicConstraintReducer2D } from "./KinematicConstraintReducer2D.js";

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}

function vectorToDofMap(vector, dofRegistry) {
  const result = {};
  const dofIds = dofRegistry.getDofIds();

  for (let index = 0; index < dofIds.length; index += 1) {
    result[dofIds[index]] = vector[index];
  }

  return result;
}

function vectorToNodeMap(vector, dofRegistry) {
  const result = {};

  for (const descriptor of dofRegistry.getDescriptors()) {
    if (!result[descriptor.nodeId]) {
      result[descriptor.nodeId] = {};
    }

    result[descriptor.nodeId][descriptor.dof] = vector[descriptor.index];
  }

  return result;
}

export class LinearStaticSolver2D {
  constructor({
    linearSolver = new DenseLinearSolver(),
    dofRegistry = new DofRegistry(),
    assembler = null,
    constraintReducer = new KinematicConstraintReducer2D(),
  } = {}) {
    if (!linearSolver || typeof linearSolver.solve !== "function") {
      throw new Error("LinearStaticSolver2D requires a linearSolver with a solve method.");
    }

    this.linearSolver = linearSolver;
    this.dofRegistry = dofRegistry;
    this.assembler = assembler ?? new FemAssembler2D({ dofRegistry });
    this.constraintReducer = constraintReducer;
  }

  solve(model = {}) {
    const assembly = this.assembler.assemble(model);
    const {
      dofRegistry,
      stiffnessMatrix,
      loadVector,
      supports = [],
      constraints = [],
    } = assembly;
    const reduction = this.constraintReducer.build({
      dofRegistry,
      supports,
      constraints,
    });
    const reducedAssembly = reduction.reduceLinearSystem(
      stiffnessMatrix,
      loadVector,
    );
    let displacements = reduction.expandReducedVector(
      new Array(reduction.reducedSize()).fill(0),
    );

    let reducedSystem = {
      stiffnessMatrix: [],
      loadVector: [],
      solution: [],
      diagnostics: null,
    };

    if (reduction.reducedSize() > 0) {
      const solved =
        typeof this.linearSolver.solveWithDiagnostics === "function"
          ? this.linearSolver.solveWithDiagnostics(
              reducedAssembly.stiffnessMatrix,
              reducedAssembly.loadVector,
            )
          : {
              solution: this.linearSolver.solve(
                reducedAssembly.stiffnessMatrix,
                reducedAssembly.loadVector,
              ),
              warnings: [],
            };

      displacements = reduction.expandReducedVector(solved.solution);

      reducedSystem = {
        stiffnessMatrix: reducedAssembly.stiffnessMatrix,
        loadVector: reducedAssembly.loadVector,
        solution: [...solved.solution],
        diagnostics: solved,
      };
    }

    const internalForceVector = multiplyMatrixVector(stiffnessMatrix, displacements);
    const reactionVector = subtractVectors(internalForceVector, loadVector);

    return {
      dofRegistry,
      dofIds: dofRegistry.getDofIds(),
      freeDofIds: [...reduction.reducedDofIds],
      constrainedDofIds: [...reduction.constrainedDofIds],
      displacements,
      displacementByDof: vectorToDofMap(displacements, dofRegistry),
      displacementByNode: vectorToNodeMap(displacements, dofRegistry),
      reactions: reactionVector,
      reactionByDof: vectorToDofMap(reactionVector, dofRegistry),
      reactionByNode: vectorToNodeMap(reactionVector, dofRegistry),
      internalForceVector,
      stiffnessMatrix,
      loadVector,
      reducedSystem,
      kinematicReduction: reduction.toJSON(),
      assembly,
    };
  }
}
