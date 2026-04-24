import { DofRegistry } from "./DofRegistry.js";

const NODAL_LOAD_COMPONENT_BY_DOF = {
  ux: "fx",
  uy: "fy",
  rz: "mz",
};

function createZeroMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

function createZeroVector(size) {
  return new Array(size).fill(0);
}

function isNodeLike(value) {
  return value?.id && !Array.isArray(value.nodes);
}

function validateDenseMatrix(matrix, size, context) {
  if (!Array.isArray(matrix) || matrix.length !== size) {
    throw new Error(`${context} must be a ${size}x${size} dense matrix.`);
  }

  for (let row = 0; row < size; row += 1) {
    if (!Array.isArray(matrix[row]) || matrix[row].length !== size) {
      throw new Error(`${context} must be a ${size}x${size} dense matrix.`);
    }

    for (let column = 0; column < size; column += 1) {
      if (!Number.isFinite(matrix[row][column])) {
        throw new Error(
          `${context} contains a non-finite value at row ${row + 1}, column ${column + 1}.`,
        );
      }
    }
  }
}

function validateVector(vector, size, context) {
  if (!Array.isArray(vector) || vector.length !== size) {
    throw new Error(`${context} must be a vector with ${size} entries.`);
  }

  for (let index = 0; index < size; index += 1) {
    if (!Number.isFinite(vector[index])) {
      throw new Error(`${context} contains a non-finite value at index ${index + 1}.`);
    }
  }
}

function resolveElementDofIds(element, dofRegistry) {
  if (typeof element.getDofIds === "function") {
    return element.getDofIds(dofRegistry);
  }

  if (typeof element.dofIds === "function") {
    return element.dofIds(dofRegistry);
  }

  if (Array.isArray(element.dofIds)) {
    return [...element.dofIds];
  }

  if (Array.isArray(element.nodes)) {
    return element.nodes.flatMap((node) =>
      dofRegistry.dofsPerNode.map((dof) => dofRegistry.getDofId(node, dof)),
    );
  }

  throw new Error(
    `FEM element ${element.id ?? "<unknown>"} cannot provide its DOF ids.`,
  );
}

function resolveElementStiffness(element, context) {
  if (typeof element.globalStiffness === "function") {
    return element.globalStiffness(context);
  }

  if (typeof element.getGlobalStiffness === "function") {
    return element.getGlobalStiffness(context);
  }

  if (Array.isArray(element.globalStiffnessMatrix)) {
    return element.globalStiffnessMatrix;
  }

  if (Array.isArray(element.stiffnessMatrix)) {
    return element.stiffnessMatrix;
  }

  throw new Error(
    `FEM element ${element.id ?? "<unknown>"} cannot provide a global stiffness matrix.`,
  );
}

function resolveElementEquivalentLoad(element, context, size) {
  let loadVector = null;

  if (typeof element.equivalentNodalLoadVector === "function") {
    loadVector = element.equivalentNodalLoadVector(context);
  } else if (typeof element.getEquivalentNodalLoadVector === "function") {
    loadVector = element.getEquivalentNodalLoadVector(context);
  } else if (Array.isArray(element.equivalentNodalLoads)) {
    loadVector = element.equivalentNodalLoads;
  }

  if (loadVector === null || loadVector === undefined) {
    return null;
  }

  validateVector(
    loadVector,
    size,
    `Equivalent nodal load vector for FEM element ${element.id ?? "<unknown>"}`,
  );

  return loadVector;
}

function loadTargetsElement(load, element) {
  const target = load?.element ?? load?.target;

  if (!target || !element) {
    return false;
  }

  return target === element || target.id === element.id;
}

function registerReferencedNodes(dofRegistry, { nodes, elements, supports, loads, constraints }) {
  dofRegistry.registerNodes(nodes);
  dofRegistry.registerElements(elements);

  for (const support of supports) {
    if (support?.node) {
      dofRegistry.registerNode(support.node);
    }
  }

  for (const load of loads) {
    const target = load?.node ?? load?.target;

    if (isNodeLike(target)) {
      dofRegistry.registerNode(target);
    }
  }

  for (const constraint of constraints) {
    if (constraint?.node) {
      dofRegistry.registerNode(constraint.node);
    }

    if (constraint?.masterNode) {
      dofRegistry.registerNode(constraint.masterNode);
    }

    if (constraint?.slaveNode) {
      dofRegistry.registerNode(constraint.slaveNode);
    }
  }
}

export class FemAssembler2D {
  constructor({ dofRegistry = new DofRegistry() } = {}) {
    this.dofRegistry = dofRegistry;
  }

  assemble({
    nodes = [],
    elements = [],
    supports = [],
    loads = [],
    nodalLoads = [],
    constraints = [],
  } = {}) {
    const allLoads = [...loads, ...nodalLoads];

    registerReferencedNodes(this.dofRegistry, {
      nodes,
      elements,
      supports,
      loads: allLoads,
      constraints,
    });

    const size = this.dofRegistry.size();
    const stiffnessMatrix = createZeroMatrix(size);
    const loadVector = createZeroVector(size);
    const elementAssemblies = [];

    for (const element of elements) {
      const dofIds = resolveElementDofIds(element, this.dofRegistry);
      const elementLoads = allLoads.filter((load) => loadTargetsElement(load, element));
      const stiffness = resolveElementStiffness(element, {
        dofRegistry: this.dofRegistry,
        element,
        loads: elementLoads,
      });

      validateDenseMatrix(
        stiffness,
        dofIds.length,
        `Global stiffness matrix for FEM element ${element.id ?? "<unknown>"}`,
      );

      const indices = dofIds.map((dofId) => this.dofRegistry.getIndex(dofId));

      for (let localRow = 0; localRow < dofIds.length; localRow += 1) {
        const globalRow = indices[localRow];

        for (let localColumn = 0; localColumn < dofIds.length; localColumn += 1) {
          const globalColumn = indices[localColumn];
          stiffnessMatrix[globalRow][globalColumn] += stiffness[localRow][localColumn];
        }
      }

      const equivalentLoad = resolveElementEquivalentLoad(
        element,
        { dofRegistry: this.dofRegistry, element, loads: elementLoads },
        dofIds.length,
      );

      if (equivalentLoad) {
        for (let localIndex = 0; localIndex < dofIds.length; localIndex += 1) {
          loadVector[indices[localIndex]] += equivalentLoad[localIndex];
        }
      }

      elementAssemblies.push({
        elementId: element.id ?? null,
        dofIds,
        indices,
        loadIds: elementLoads.map((load) => load.id ?? null),
      });
    }

    this.addNodalLoads(loadVector, allLoads);
    this.addSupportSprings(stiffnessMatrix, supports);

    return {
      dofRegistry: this.dofRegistry,
      stiffnessMatrix,
      loadVector,
      supports: [...supports],
      constraints: [...constraints],
      elementAssemblies,
    };
  }

  addNodalLoads(loadVector, loads = []) {
    for (const load of loads) {
      if (typeof load?.getGlobalLoadContributions === "function") {
        const contributions = load.getGlobalLoadContributions(this.dofRegistry);
        this.addLoadContributions(loadVector, contributions);
        continue;
      }

      const node = load?.node ?? load?.target;

      if (!isNodeLike(node) || !load?.components) {
        continue;
      }

      for (const dof of this.dofRegistry.dofsPerNode) {
        const component = NODAL_LOAD_COMPONENT_BY_DOF[dof];
        const value = component ? load.components[component] ?? 0 : 0;

        if (value === 0) {
          continue;
        }

        const index = this.dofRegistry.getIndex(node, dof);
        loadVector[index] += value;
      }
    }
  }

  addLoadContributions(loadVector, contributions) {
    if (Array.isArray(contributions)) {
      validateVector(
        contributions,
        this.dofRegistry.size(),
        "Global load contribution",
      );

      for (let index = 0; index < contributions.length; index += 1) {
        loadVector[index] += contributions[index];
      }

      return;
    }

    if (contributions && typeof contributions === "object") {
      for (const [dofId, value] of Object.entries(contributions)) {
        if (!Number.isFinite(value)) {
          throw new Error(`Global load contribution for DOF ${dofId} must be finite.`);
        }

        loadVector[this.dofRegistry.getIndex(dofId)] += value;
      }
    }
  }

  addSupportSprings(stiffnessMatrix, supports = []) {
    for (const support of supports) {
      if (!support?.node || !support?.springStiffness) {
        continue;
      }

      for (const dof of this.dofRegistry.dofsPerNode) {
        const stiffness = support.springStiffness[dof] ?? 0;

        if (stiffness === 0) {
          continue;
        }

        if (!Number.isFinite(stiffness)) {
          throw new Error(
            `Spring stiffness for support ${support.id ?? "<unknown>"} DOF ${dof} must be finite.`,
          );
        }

        const index = this.dofRegistry.getIndex(support.node, dof);
        stiffnessMatrix[index][index] += stiffness;
      }
    }
  }
}
