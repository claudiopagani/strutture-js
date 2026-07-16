function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

export class AxialMember2D {
  constructor({ id, startNode, endNode, axialRigidity, metadata = {} } = {}) {
    if (!id || !startNode?.id || !endNode?.id) {
      throw new Error("AxialMember2D requires an id and two nodes.");
    }

    const dx = endNode.x - startNode.x;
    const dy = endNode.y - startNode.y;
    const length = Math.hypot(dx, dy);

    positive(length, `AxialMember2D ${id} length`);

    this.id = id;
    this.startNode = startNode;
    this.endNode = endNode;
    this.nodes = [startNode, endNode];
    this.axialRigidity = positive(
      axialRigidity,
      `AxialMember2D ${id} axialRigidity`,
    );
    this.length = length;
    this.cosine = dx / length;
    this.sine = dy / length;
    this.metadata = { ...metadata };
  }

  getDofIds(dofRegistry) {
    return [
      dofRegistry.getDofId(this.startNode, "ux"),
      dofRegistry.getDofId(this.startNode, "uy"),
      dofRegistry.getDofId(this.endNode, "ux"),
      dofRegistry.getDofId(this.endNode, "uy"),
    ];
  }

  globalStiffness() {
    const c = this.cosine;
    const s = this.sine;
    const scale = this.axialRigidity / this.length;

    return [
      [c * c, c * s, -c * c, -c * s],
      [c * s, s * s, -c * s, -s * s],
      [-c * c, -c * s, c * c, c * s],
      [-c * s, -s * s, c * s, s * s],
    ].map((row) => row.map((value) => value * scale));
  }

  axialResponse(displacementByNode = {}) {
    const start = displacementByNode[this.startNode.id] ?? {};
    const end = displacementByNode[this.endNode.id] ?? {};
    const extension =
      this.cosine * ((end.ux ?? 0) - (start.ux ?? 0)) +
      this.sine * ((end.uy ?? 0) - (start.uy ?? 0));
    const strain = extension / this.length;
    const force = this.axialRigidity * strain;

    return {
      force,
      extension,
      strain,
      signConvention: "tension-positive",
    };
  }
}
