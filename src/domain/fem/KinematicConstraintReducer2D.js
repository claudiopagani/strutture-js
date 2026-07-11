import { createZeroMatrix } from "../math/arrayLinearAlgebra.js";

function validateDenseSquareMatrix(matrix, size, context) {
  if (!Array.isArray(matrix) || matrix.length !== size) {
    throw new Error(`${context} requires a ${size}x${size} matrix.`);
  }

  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== size) {
      throw new Error(`${context} requires a ${size}x${size} matrix.`);
    }
  }
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

  throw new Error(
    "KinematicConstraintReducer2D displacement constraint requires dofId or node/nodeId plus dof.",
  );
}

function resolveConstraintValue(constraint) {
  const value =
    constraint?.value ??
    constraint?.displacement ??
    constraint?.prescribedValue ??
    0;

  if (!Number.isFinite(value)) {
    throw new Error("KinematicConstraintReducer2D constraint value must be finite.");
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

function isEqualDofConstraint(constraint) {
  const type = String(constraint?.type ?? "")
    .trim()
    .toLowerCase();

  if (
    type === "equal-dof" ||
    type === "equal dof" ||
    type === "kinematic-link" ||
    type === "diaphragm-link"
  ) {
    return true;
  }

  return (
    (constraint?.masterDofId ||
      constraint?.masterNode ||
      constraint?.masterNodeId) &&
    (constraint?.slaveDofId ||
      constraint?.slaveNode ||
      constraint?.slaveNodeId)
  );
}

function resolveEqualDofEndpoint(constraint, role, dofRegistry) {
  const explicitDofId = constraint?.[`${role}DofId`];

  if (explicitDofId) {
    return explicitDofId;
  }

  const node = constraint?.[`${role}Node`] ?? null;
  const nodeId = constraint?.[`${role}NodeId`] ?? null;
  const dof =
    constraint?.[`${role}Dof`] ??
    constraint?.dof ??
    constraint?.[`${role}Component`] ??
    null;

  if (node && dof) {
    return dofRegistry.getDofId(node, dof);
  }

  if (nodeId && dof) {
    return dofRegistry.getDofId(nodeId, dof);
  }

  throw new Error(
    `KinematicConstraintReducer2D equal-DOF constraint requires ${role}DofId or ${role}Node/${role}NodeId plus a DOF.`,
  );
}

function resolveEqualDofScale(constraint) {
  const scale = constraint?.scale ?? constraint?.ratio ?? 1;

  if (!Number.isFinite(scale) || Math.abs(scale) <= 0) {
    throw new Error("KinematicConstraintReducer2D equal-DOF scale must be finite and non-zero.");
  }

  return scale;
}

function resolveEqualDofOffset(constraint) {
  const offset = constraint?.offset ?? constraint?.constant ?? 0;

  if (!Number.isFinite(offset)) {
    throw new Error("KinematicConstraintReducer2D equal-DOF offset must be finite.");
  }

  return offset;
}

function compareEqualDependencies(left, right) {
  return (
    left.masterIndex === right.masterIndex &&
    Math.abs(left.scale - right.scale) <= 1e-12 &&
    Math.abs(left.offset - right.offset) <= 1e-12
  );
}

function addPrescribedConstraint(prescribedByIndex, dependentByIndex, index, value, dofId) {
  if (dependentByIndex.has(index)) {
    throw new Error(
      `KinematicConstraintReducer2D received both a prescribed displacement and an equal-DOF dependency for DOF ${dofId}.`,
    );
  }

  if (prescribedByIndex.has(index)) {
    const existing = prescribedByIndex.get(index);

    if (Math.abs(existing - value) > 1e-12) {
      throw new Error(
        `KinematicConstraintReducer2D received conflicting constraints for DOF ${dofId}.`,
      );
    }

    return;
  }

  prescribedByIndex.set(index, value);
}

function addEqualDependency(dependentByIndex, prescribedByIndex, index, dependency, dofId) {
  if (prescribedByIndex.has(index)) {
    throw new Error(
      `KinematicConstraintReducer2D received both a prescribed displacement and an equal-DOF dependency for DOF ${dofId}.`,
    );
  }

  if (dependentByIndex.has(index)) {
    const existing = dependentByIndex.get(index);

    if (!compareEqualDependencies(existing, dependency)) {
      throw new Error(
        `KinematicConstraintReducer2D received conflicting constraints for DOF ${dofId}.`,
      );
    }

    return;
  }

  dependentByIndex.set(index, dependency);
}

export class KinematicConstraintReducer2D {
  build({
    dofRegistry,
    supports = [],
    constraints = [],
  } = {}) {
    const size = dofRegistry?.size?.();

    if (!Number.isFinite(size) || size < 0) {
      throw new Error(
        "KinematicConstraintReducer2D requires a valid dofRegistry with a finite size.",
      );
    }

    const dofIds = dofRegistry.getDofIds();
    const prescribedByIndex = new Map();
    const dependentByIndex = new Map();

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
            `KinematicConstraintReducer2D support ${support.id ?? "<unknown>"} prescribed displacement for DOF ${dof} must be finite.`,
          );
        }

        const dofId = dofRegistry.getDofId(support.node, dof);
        addPrescribedConstraint(
          prescribedByIndex,
          dependentByIndex,
          dofRegistry.getIndex(dofId),
          value,
          dofId,
        );
      }
    }

    for (const constraint of constraints) {
      if (isEqualDofConstraint(constraint)) {
        const slaveDofId = resolveEqualDofEndpoint(constraint, "slave", dofRegistry);
        const masterDofId = resolveEqualDofEndpoint(constraint, "master", dofRegistry);

        if (slaveDofId === masterDofId) {
          throw new Error(
            `KinematicConstraintReducer2D equal-DOF constraint cannot tie DOF ${slaveDofId} to itself.`,
          );
        }

        addEqualDependency(
          dependentByIndex,
          prescribedByIndex,
          dofRegistry.getIndex(slaveDofId),
          {
            masterIndex: dofRegistry.getIndex(masterDofId),
            scale: resolveEqualDofScale(constraint),
            offset: resolveEqualDofOffset(constraint),
          },
          slaveDofId,
        );
        continue;
      }

      const dofId = resolveConstraintDofId(constraint, dofRegistry);

      addPrescribedConstraint(
        prescribedByIndex,
        dependentByIndex,
        dofRegistry.getIndex(dofId),
        resolveConstraintValue(constraint),
        dofId,
      );
    }

    const expressionByIndex = new Map();

    const resolveExpression = (index, trail = []) => {
      if (expressionByIndex.has(index)) {
        return expressionByIndex.get(index);
      }

      if (trail.includes(index)) {
        const cycle = [...trail, index]
          .map((cycleIndex) => dofIds[cycleIndex])
          .join(" -> ");

        throw new Error(
          `KinematicConstraintReducer2D detected a cyclic equal-DOF dependency: ${cycle}.`,
        );
      }

      let expression;

      if (prescribedByIndex.has(index)) {
        expression = {
          rootIndex: null,
          scale: 0,
          offset: prescribedByIndex.get(index),
        };
      } else if (dependentByIndex.has(index)) {
        const dependency = dependentByIndex.get(index);
        const masterExpression = resolveExpression(dependency.masterIndex, [
          ...trail,
          index,
        ]);

        if (masterExpression.rootIndex == null) {
          expression = {
            rootIndex: null,
            scale: 0,
            offset:
              dependency.scale * masterExpression.offset + dependency.offset,
          };
        } else {
          expression = {
            rootIndex: masterExpression.rootIndex,
            scale: dependency.scale * masterExpression.scale,
            offset:
              dependency.scale * masterExpression.offset + dependency.offset,
          };
        }
      } else {
        expression = {
          rootIndex: index,
          scale: 1,
          offset: 0,
        };
      }

      expressionByIndex.set(index, expression);

      return expression;
    };

    const rootIndices = [];
    const rootIndexSet = new Set();

    for (let index = 0; index < size; index += 1) {
      const expression = resolveExpression(index);

      if (expression.rootIndex == null || rootIndexSet.has(expression.rootIndex)) {
        continue;
      }

      rootIndices.push(expression.rootIndex);
      rootIndexSet.add(expression.rootIndex);
    }

    rootIndices.sort((left, right) => left - right);

    const reducedIndexByRoot = new Map(
      rootIndices.map((rootIndex, reducedIndex) => [rootIndex, reducedIndex]),
    );
    const transformationMatrix = createZeroMatrix(size, rootIndices.length);
    const offsetVector = new Array(size).fill(0);
    const reducedIndexByFullIndex = new Array(size).fill(-1);
    const scaleByFullIndex = new Array(size).fill(0);
    const activeMappings = [];

    for (let index = 0; index < size; index += 1) {
      const expression = resolveExpression(index);

      offsetVector[index] = expression.offset;

      if (expression.rootIndex == null) {
        continue;
      }

      const reducedIndex = reducedIndexByRoot.get(expression.rootIndex);

      transformationMatrix[index][reducedIndex] = expression.scale;
      reducedIndexByFullIndex[index] = reducedIndex;
      scaleByFullIndex[index] = expression.scale;
      activeMappings.push({
        fullIndex: index,
        reducedIndex,
        scale: expression.scale,
      });
    }

    const reducedDofIds = rootIndices.map((rootIndex) => dofIds[rootIndex]);
    const prescribedDofIds = [...prescribedByIndex.keys()]
      .sort((left, right) => left - right)
      .map((index) => dofIds[index]);
    const dependentDofIds = [...dependentByIndex.keys()]
      .sort((left, right) => left - right)
      .map((index) => dofIds[index]);
    const constrainedDofIds = [
      ...new Set([...prescribedDofIds, ...dependentDofIds]),
    ];
    const hasNonZeroOffset = offsetVector.some((value) => value !== 0);
    const identityTransformation =
      activeMappings.length === size &&
      activeMappings.every(
        (mapping) =>
          mapping.fullIndex === mapping.reducedIndex && mapping.scale === 1,
      ) &&
      !hasNonZeroOffset;

    const reduceVectorWithMappings = (vector) => {
      const reduced = new Array(rootIndices.length).fill(0);

      for (const mapping of activeMappings) {
        reduced[mapping.reducedIndex] +=
          mapping.scale * (vector[mapping.fullIndex] ?? 0);
      }

      return reduced;
    };

    return {
      fullSize: size,
      transformationMatrix,
      offsetVector,
      reducedDofIds,
      prescribedDofIds,
      dependentDofIds,
      constrainedDofIds,
      reduceVector(vector = []) {
        if (!Array.isArray(vector) || vector.length !== size) {
          throw new Error(
            `KinematicConstraintReducer2D reduceVector requires a vector with ${size} entries.`,
          );
        }

        return reduceVectorWithMappings(vector);
      },
      expandReducedVector(reducedVector = []) {
        if (!Array.isArray(reducedVector) || reducedVector.length !== rootIndices.length) {
          throw new Error(
            `KinematicConstraintReducer2D expandReducedVector requires a vector with ${rootIndices.length} entries.`,
          );
        }

        return offsetVector.map((offset, fullIndex) => {
          const reducedIndex = reducedIndexByFullIndex[fullIndex];

          return reducedIndex < 0
            ? offset
            : offset +
                scaleByFullIndex[fullIndex] * reducedVector[reducedIndex];
        });
      },
      reduceStiffnessMatrix(stiffnessMatrix = []) {
        validateDenseSquareMatrix(
          stiffnessMatrix,
          size,
          "KinematicConstraintReducer2D reduceStiffnessMatrix",
        );

        if (identityTransformation) {
          return stiffnessMatrix.map((row) => [...row]);
        }

        const reduced = createZeroMatrix(rootIndices.length);

        for (const rowMapping of activeMappings) {
          const sourceRow = stiffnessMatrix[rowMapping.fullIndex];
          const reducedRow = reduced[rowMapping.reducedIndex];

          for (const columnMapping of activeMappings) {
            reducedRow[columnMapping.reducedIndex] +=
              rowMapping.scale *
              sourceRow[columnMapping.fullIndex] *
              columnMapping.scale;
          }
        }

        return reduced;
      },
      reduceLinearSystem(stiffnessMatrix = [], loadVector = []) {
        validateDenseSquareMatrix(
          stiffnessMatrix,
          size,
          "KinematicConstraintReducer2D reduceLinearSystem",
        );

        if (!Array.isArray(loadVector) || loadVector.length !== size) {
          throw new Error(
            `KinematicConstraintReducer2D reduceLinearSystem requires a vector with ${size} entries.`,
          );
        }

        let effectiveLoadVector = loadVector;

        if (hasNonZeroOffset) {
          effectiveLoadVector = new Array(size).fill(0);

          for (let row = 0; row < size; row += 1) {
            let stiffnessOffset = 0;

            for (let column = 0; column < size; column += 1) {
              stiffnessOffset +=
                stiffnessMatrix[row][column] * offsetVector[column];
            }

            effectiveLoadVector[row] = loadVector[row] - stiffnessOffset;
          }
        }

        return {
          stiffnessMatrix: this.reduceStiffnessMatrix(stiffnessMatrix),
          loadVector: reduceVectorWithMappings(effectiveLoadVector),
        };
      },
      reducedSize() {
        return rootIndices.length;
      },
      toJSON() {
        return {
          fullSize: size,
          reducedSize: rootIndices.length,
          reducedDofIds: [...reducedDofIds],
          prescribedDofIds: [...prescribedDofIds],
          dependentDofIds: [...dependentDofIds],
          constrainedDofIds: [...constrainedDofIds],
          transformationMatrix: transformationMatrix.map((row) => [...row]),
          offsetVector: [...offsetVector],
        };
      },
    };
  }
}
