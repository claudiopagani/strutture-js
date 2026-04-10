import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class Node {
  constructor({
    id,
    x = 0,
    y = 0,
    z = 0,
    units = null,
    rotationalDofs = ["rx", "ry", "rz"],
    translationalDofs = ["ux", "uy", "uz"],
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A node id is required.");
    }

    assertExplicitUnitSystem(units, "Node");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });

    this.id = id;
    this.x = unitResolver.length(x);
    this.y = unitResolver.length(y);
    this.z = unitResolver.length(z);
    this.translationalDofs = [...translationalDofs];
    this.rotationalDofs = [...rotationalDofs];
    this.metadata = {
      ...metadata,
      unitSystem: units ? unitResolver.unitSystem : metadata.unitSystem,
    };
  }

  coordinates() {
    return [this.x, this.y, this.z];
  }

  distanceTo(node) {
    const [x1, y1, z1] = this.coordinates();
    const [x2, y2, z2] = node.coordinates();

    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
  }

  toJSON() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      z: this.z,
      translationalDofs: [...this.translationalDofs],
      rotationalDofs: [...this.rotationalDofs],
      metadata: { ...this.metadata },
    };
  }
}
