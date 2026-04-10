import { DenseLinearSolver } from "../math/DenseLinearSolver.js";
import { DofRegistry } from "./DofRegistry.js";
import { FemAssembler2D } from "./FemAssembler2D.js";

function createZeroVector(size) {
  return new Array(size).fill(0);
}

function extractSubmatrix(matrix, rowIndices, columnIndices) {
  return rowIndices.map((row) => columnIndices.map((column) => matrix[row][column]));
}

function extractSubvector(vector, indices) {
  return indices.map((index) => vector[index]);
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}

function resolveConstraintDofId(constraint, dofRegistry) {
  if (constraint?.dofId) {
    return constraint.dofId;
  }

  if (constraint?.node && constraint?.dof) {
    return dofRegistry.getDofId(constraint.node, constraint.dof);
  }

  if (constraint?.nodeId && constraint?.dof) {
    return dofRegistry.getDofId(constraint.nodeId, constraint.dof);
  }

  throw new Error("LinearStaticSolver2D constraint requires dofId or node/nodeId plus dof.");
}

function resolveConstraintValue(constraint) {
  const value =
    constraint?.value ??
    constraint?.displacement ??
    constraint?.prescribedValue ??
    0;

  if (!Number.isFinite(value)) {
    throw new Error("LinearStaticSolver2D constraint value must be finite.");
  }

  return value;
}

function supportConstraintValue(support, dof) {
  return (
    support?.prescribedDisplacements?.[dof] ??
    support?.imposedDisplacements?.[dof] ??
    support?.settlements?.[dof] ??
    0
  );
}

function addConstraint(constrainedValuesByIndex, index, value, dofId) {
  if (constrainedValuesByIndex.has(index)) {
    const existing = constrainedValuesByIndex.get(index);

    if (Math.abs(existing - value) > 1e-12) {
      throw new Error(
        `LinearStaticSolver2D received conflicting constraints for DOF ${dofId}.`,
      );
    }

    return;
  }

  constrainedValuesByIndex.set(index, value);
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
  } = {}) {
    if (!linearSolver || typeof linearSolver.solve !== "function") {
      throw new Error("LinearStaticSolver2D requires a linearSolver with a solve method.");
    }

    this.linearSolver = linearSolver;
    this.dofRegistry = dofRegistry;
    this.assembler = assembler ?? new FemAssembler2D({ dofRegistry });
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
    const size = dofRegistry.size();
    const constrainedValuesByIndex = this.collectConstrainedValues({
      dofRegistry,
      supports,
      constraints,
    });
    const constrainedIndices = [...constrainedValuesByIndex.keys()].sort((a, b) => a - b);
    const constrainedSet = new Set(constrainedIndices);
    const freeIndices = [];

    for (let index = 0; index < size; index += 1) {
      if (!constrainedSet.has(index)) {
        freeIndices.push(index);
      }
    }

    const displacements = createZeroVector(size);

    for (const [index, value] of constrainedValuesByIndex.entries()) {
      displacements[index] = value;
    }

    let reducedSystem = {
      stiffnessMatrix: [],
      loadVector: [],
      solution: [],
      diagnostics: null,
    };

    if (freeIndices.length > 0) {
      const constrainedDisplacements = extractSubvector(displacements, constrainedIndices);
      const kff = extractSubmatrix(stiffnessMatrix, freeIndices, freeIndices);
      const kfc = extractSubmatrix(stiffnessMatrix, freeIndices, constrainedIndices);
      const ff = extractSubvector(loadVector, freeIndices);
      const rhs = subtractVectors(ff, multiplyMatrixVector(kfc, constrainedDisplacements));
      const solved =
        typeof this.linearSolver.solveWithDiagnostics === "function"
          ? this.linearSolver.solveWithDiagnostics(kff, rhs)
          : { solution: this.linearSolver.solve(kff, rhs), warnings: [] };

      for (let localIndex = 0; localIndex < freeIndices.length; localIndex += 1) {
        displacements[freeIndices[localIndex]] = solved.solution[localIndex];
      }

      reducedSystem = {
        stiffnessMatrix: kff,
        loadVector: rhs,
        solution: [...solved.solution],
        diagnostics: solved,
      };
    }

    const internalForceVector = multiplyMatrixVector(stiffnessMatrix, displacements);
    const reactionVector = subtractVectors(internalForceVector, loadVector);

    return {
      dofRegistry,
      dofIds: dofRegistry.getDofIds(),
      freeDofIds: freeIndices.map((index) => dofRegistry.getDofIds()[index]),
      constrainedDofIds: constrainedIndices.map((index) => dofRegistry.getDofIds()[index]),
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
      assembly,
    };
  }

  collectConstrainedValues({ dofRegistry, supports = [], constraints = [] }) {
    const constrainedValuesByIndex = new Map();

    for (const support of supports) {
      if (!support?.node) {
        continue;
      }

      for (const dof of dofRegistry.dofsPerNode) {
        const isRestrained =
          typeof support.isRestrained === "function"
            ? support.isRestrained(dof)
            : Boolean(support.restraints?.[dof]);

        if (!isRestrained) {
          continue;
        }

        const value = supportConstraintValue(support, dof);

        if (!Number.isFinite(value)) {
          throw new Error(
            `LinearStaticSolver2D support ${support.id ?? "<unknown>"} prescribed displacement for DOF ${dof} must be finite.`,
          );
        }

        const dofId = dofRegistry.getDofId(support.node, dof);
        addConstraint(
          constrainedValuesByIndex,
          dofRegistry.getIndex(dofId),
          value,
          dofId,
        );
      }
    }

    for (const constraint of constraints) {
      const dofId = resolveConstraintDofId(constraint, dofRegistry);
      addConstraint(
        constrainedValuesByIndex,
        dofRegistry.getIndex(dofId),
        resolveConstraintValue(constraint),
        dofId,
      );
    }

    return constrainedValuesByIndex;
  }
}
