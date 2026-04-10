const DEFAULT_NODE_DOFS_2D = ["ux", "uy", "rz"];

function resolveNodeId(nodeOrId) {
  if (typeof nodeOrId === "string") {
    return nodeOrId;
  }

  if (nodeOrId?.id) {
    return nodeOrId.id;
  }

  throw new Error("DofRegistry requires a node id or a node-like object with an id.");
}

function validateDofName(dof) {
  if (typeof dof !== "string" || dof.length === 0) {
    throw new Error("DofRegistry requires non-empty string DOF names.");
  }
}

export class DofRegistry {
  constructor({ dofsPerNode = DEFAULT_NODE_DOFS_2D } = {}) {
    if (!Array.isArray(dofsPerNode) || dofsPerNode.length === 0) {
      throw new Error("DofRegistry requires a non-empty dofsPerNode array.");
    }

    const uniqueDofs = new Set();

    for (const dof of dofsPerNode) {
      validateDofName(dof);

      if (uniqueDofs.has(dof)) {
        throw new Error(`DofRegistry received a duplicate DOF name: ${dof}.`);
      }

      uniqueDofs.add(dof);
    }

    this.dofsPerNode = [...dofsPerNode];
    this.dofIds = [];
    this.dofIndexById = new Map();
    this.descriptorById = new Map();
    this.nodeIds = [];
    this.nodeIdSet = new Set();
  }

  registerNode(nodeOrId, dofs = this.dofsPerNode) {
    const nodeId = resolveNodeId(nodeOrId);

    if (!this.nodeIdSet.has(nodeId)) {
      this.nodeIds.push(nodeId);
      this.nodeIdSet.add(nodeId);
    }

    for (const dof of dofs) {
      this.registerDof(nodeId, dof);
    }

    return this;
  }

  registerNodes(nodes = []) {
    if (!Array.isArray(nodes)) {
      throw new Error("DofRegistry registerNodes requires an array.");
    }

    for (const node of nodes) {
      this.registerNode(node);
    }

    return this;
  }

  registerElement(element) {
    if (!element) {
      throw new Error("DofRegistry registerElement requires an element.");
    }

    if (Array.isArray(element.nodes)) {
      this.registerNodes(element.nodes);
    }

    return this;
  }

  registerElements(elements = []) {
    if (!Array.isArray(elements)) {
      throw new Error("DofRegistry registerElements requires an array.");
    }

    for (const element of elements) {
      this.registerElement(element);
    }

    return this;
  }

  registerDof(nodeOrId, dof) {
    const nodeId = resolveNodeId(nodeOrId);
    validateDofName(dof);

    const dofId = this.getDofId(nodeId, dof);

    if (this.dofIndexById.has(dofId)) {
      return this.dofIndexById.get(dofId);
    }

    const index = this.dofIds.length;
    this.dofIds.push(dofId);
    this.dofIndexById.set(dofId, index);
    this.descriptorById.set(dofId, { id: dofId, nodeId, dof, index });

    return index;
  }

  getDofId(nodeOrId, dof) {
    const nodeId = resolveNodeId(nodeOrId);
    validateDofName(dof);

    return `${nodeId}.${dof}`;
  }

  hasDof(dofId) {
    return this.dofIndexById.has(dofId);
  }

  getIndex(dofIdOrNode, dof = null) {
    const dofId = dof === null ? dofIdOrNode : this.getDofId(dofIdOrNode, dof);
    const index = this.dofIndexById.get(dofId);

    if (index === undefined) {
      throw new Error(`DofRegistry does not contain DOF ${dofId}.`);
    }

    return index;
  }

  getDescriptor(dofIdOrNode, dof = null) {
    const dofId = dof === null ? dofIdOrNode : this.getDofId(dofIdOrNode, dof);
    const descriptor = this.descriptorById.get(dofId);

    if (!descriptor) {
      throw new Error(`DofRegistry does not contain DOF ${dofId}.`);
    }

    return { ...descriptor };
  }

  getDofIds() {
    return [...this.dofIds];
  }

  getDescriptors() {
    return this.dofIds.map((dofId) => this.getDescriptor(dofId));
  }

  size() {
    return this.dofIds.length;
  }

  toJSON() {
    return {
      dofsPerNode: [...this.dofsPerNode],
      nodeIds: [...this.nodeIds],
      dofs: this.getDescriptors(),
    };
  }
}
