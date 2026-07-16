import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const MEMBER_TYPES = new Set(["strut", "tie"]);

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function finite(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }

  return value;
}

function uniqueById(values, label) {
  const ids = new Set();

  for (const value of values) {
    if (!value?.id) {
      throw new Error(`${label} entries require an id.`);
    }

    if (ids.has(value.id)) {
      throw new Error(`${label} contains duplicate id ${value.id}.`);
    }

    ids.add(value.id);
  }
}

export class StrutAndTieModel2D {
  constructor({
    id,
    nodes = [],
    members = [],
    loads = [],
    supports = [],
    units = null,
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("A strut-and-tie model id is required.");
    }

    assertExplicitUnitSystem(units, "StrutAndTieModel2D");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    if (nodes.length < 2 || members.length < 1) {
      throw new Error("StrutAndTieModel2D requires at least two nodes and one member.");
    }

    uniqueById(nodes, "nodes");
    uniqueById(members, "members");
    uniqueById(loads, "loads");
    uniqueById(supports, "supports");

    this.id = id;
    this.nodes = nodes.map((node) => ({
      id: node.id,
      x: finite(resolver.length(Number(node.x)), `node ${node.id} x`),
      y: finite(resolver.length(Number(node.y)), `node ${node.id} y`),
      metadata: { ...(node.metadata ?? {}) },
    }));
    const nodeById = new Map(this.nodes.map((node) => [node.id, node]));

    this.members = members.map((member) => {
      const type = String(member.type ?? "").toLowerCase();

      if (!MEMBER_TYPES.has(type)) {
        throw new Error(`Member ${member.id} has unsupported type ${member.type}.`);
      }

      const startNodeId = member.startNodeId ?? member.start;
      const endNodeId = member.endNodeId ?? member.end;
      const startNode = nodeById.get(startNodeId);
      const endNode = nodeById.get(endNodeId);

      if (!startNode || !endNode || startNodeId === endNodeId) {
        throw new Error(`Member ${member.id} requires two distinct existing nodes.`);
      }

      const length = Math.hypot(endNode.x - startNode.x, endNode.y - startNode.y);
      positive(length, `member ${member.id} length`);

      return {
        id: member.id,
        type,
        startNodeId,
        endNodeId,
        area: positive(
          resolver.area(Number(member.area)),
          `member ${member.id} area`,
        ),
        axialRigidity: positive(
          resolver.force(Number(member.axialRigidity)),
          `member ${member.id} axialRigidity`,
        ),
        length,
        metadata: { ...(member.metadata ?? {}) },
      };
    });

    this.loads = loads.map((load) => {
      if (!nodeById.has(load.nodeId)) {
        throw new Error(`Load ${load.id} references unknown node ${load.nodeId}.`);
      }

      return {
        id: load.id,
        nodeId: load.nodeId,
        fx: finite(resolver.force(Number(load.fx ?? 0)), `load ${load.id} fx`),
        fy: finite(resolver.force(Number(load.fy ?? 0)), `load ${load.id} fy`),
        metadata: { ...(load.metadata ?? {}) },
      };
    });
    this.supports = supports.map((support) => {
      if (!nodeById.has(support.nodeId)) {
        throw new Error(
          `Support ${support.id} references unknown node ${support.nodeId}.`,
        );
      }

      const ux = support.ux === true;
      const uy = support.uy === true;

      if (!ux && !uy) {
        throw new Error(`Support ${support.id} must restrain ux or uy.`);
      }

      return {
        id: support.id,
        nodeId: support.nodeId,
        ux,
        uy,
        metadata: { ...(support.metadata ?? {}) },
      };
    });
    this.units = INTERNAL_UNITS;
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  toJSON() {
    return {
      id: this.id,
      nodes: this.nodes.map((value) => ({ ...value })),
      members: this.members.map((value) => ({ ...value })),
      loads: this.loads.map((value) => ({ ...value })),
      supports: this.supports.map((value) => ({ ...value })),
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}

export const STRUT_AND_TIE_MEMBER_TYPES = Object.freeze([...MEMBER_TYPES]);
