import { StrutAndTieModel2D } from "../../domain/strut-and-tie/StrutAndTieModel2D.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
} from "../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });
const STRENGTH_MODELS = new Set([
  "uncracked-uniaxial",
  "transverse-tension",
]);
const NODE_TYPES = new Set(["ccc", "cct", "ctt"]);
const FORCE_REFERENCE_KINDS = new Set([
  "member",
  "load",
  "reaction",
  "explicit",
]);

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function normalizedDirection(value, label) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const length = Math.hypot(x, y);

  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`${label} requires a finite non-zero x-y direction.`);
  }

  return { x: x / length, y: y / length };
}

function normalizeFactors(factors = {}) {
  return Object.fromEntries(
    Object.entries(factors).map(([key, value]) => [
      key,
      positive(Number(value), `nodalFactors.${key}`),
    ]),
  );
}

export class ReinforcedConcreteStrutAndTieModel {
  constructor({
    id,
    nodes = [],
    members = [],
    loads = [],
    supports = [],
    nodalZones = [],
    materials = {},
    units = null,
    metadata = {},
  } = {}) {
    if (!id) {
      throw new Error("A reinforced-concrete strut-and-tie model id is required.");
    }

    assertExplicitUnitSystem(units, "ReinforcedConcreteStrutAndTieModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const concreteMaterial = materials.concreteMaterial;
    const reinforcementMaterial = materials.reinforcementMaterial;

    if (!concreteMaterial || !reinforcementMaterial) {
      throw new Error("Concrete and reinforcement materials are required.");
    }

    if (!Number.isFinite(concreteMaterial.elasticModulus) ||
        !Number.isFinite(reinforcementMaterial.elasticModulus)) {
      throw new Error("Concrete and reinforcement elastic moduli are required.");
    }

    const normalizedMembers = members.map((member) => {
      const type = String(member.type ?? "").toLowerCase();
      const area = positive(
        resolver.area(Number(member.area)),
        `member ${member.id} area`,
      );
      const material = type === "strut"
        ? concreteMaterial
        : reinforcementMaterial;
      const elasticModulus = member.analysisElasticModulus == null
        ? material?.elasticModulus
        : resolver.stress(Number(member.analysisElasticModulus));

      if (type === "strut" && !STRENGTH_MODELS.has(member.strengthModel)) {
        throw new Error(
          `Strut ${member.id} requires strengthModel uncracked-uniaxial or transverse-tension.`,
        );
      }

      return {
        id: member.id,
        type,
        startNodeId: member.startNodeId ?? member.start,
        endNodeId: member.endNodeId ?? member.end,
        area,
        axialRigidity: area * positive(
          elasticModulus,
          `member ${member.id} analysis elastic modulus`,
        ),
        strengthModel: type === "strut" ? member.strengthModel : null,
        metadata: { ...(member.metadata ?? {}) },
      };
    });
    const normalizedNodes = nodes.map((node) => ({
      id: node.id,
      x: resolver.length(Number(node.x)),
      y: resolver.length(Number(node.y)),
      metadata: { ...(node.metadata ?? {}) },
    }));
    const normalizedLoads = loads.map((load) => ({
      id: load.id,
      nodeId: load.nodeId,
      fx: resolver.force(Number(load.fx ?? 0)),
      fy: resolver.force(Number(load.fy ?? 0)),
      metadata: { ...(load.metadata ?? {}) },
    }));
    const normalizedSupports = supports.map((support) => ({ ...support }));

    this.domainModel = new StrutAndTieModel2D({
      id,
      nodes: normalizedNodes,
      members: normalizedMembers,
      loads: normalizedLoads,
      supports: normalizedSupports,
      units: INTERNAL_UNITS,
      metadata,
    });
    const nodeIds = new Set(this.domainModel.nodes.map((node) => node.id));
    const memberById = new Map(
      this.domainModel.members.map((member) => [member.id, member]),
    );
    const loadById = new Map(
      this.domainModel.loads.map((load) => [load.id, load]),
    );

    if (nodalZones.length === 0) {
      throw new Error(
        "At least one explicitly mapped nodal zone is required for RC strut-and-tie verification.",
      );
    }

    const zoneIds = new Set();
    this.nodalZones = nodalZones.map((zone) => {
      if (!zone.id || zoneIds.has(zone.id)) {
        throw new Error("Nodal zones require unique ids.");
      }

      zoneIds.add(zone.id);

      if (!nodeIds.has(zone.nodeId) || !NODE_TYPES.has(zone.type)) {
        throw new Error(
          `Nodal zone ${zone.id} requires an existing node and type ccc, cct or ctt.`,
        );
      }

      const reference = zone.forceReference ?? {};
      const kind = String(reference.kind ?? "").toLowerCase();

      if (!FORCE_REFERENCE_KINDS.has(kind)) {
        throw new Error(`Nodal zone ${zone.id} has unsupported force reference.`);
      }

      if (kind === "member") {
        const member = memberById.get(reference.id);

        if (!member) {
          throw new Error(`Nodal zone ${zone.id} references unknown member ${reference.id}.`);
        }

        if (![member.startNodeId, member.endNodeId].includes(zone.nodeId)) {
          throw new Error(
            `Nodal zone ${zone.id} must reference a member incident to node ${zone.nodeId}.`,
          );
        }
      }

      if (kind === "load") {
        const load = loadById.get(reference.id);

        if (!load) {
          throw new Error(`Nodal zone ${zone.id} references unknown load ${reference.id}.`);
        }

        if (load.nodeId !== zone.nodeId) {
          throw new Error(
            `Nodal zone ${zone.id} must reference a load applied at node ${zone.nodeId}.`,
          );
        }
      }

      if (kind === "reaction" &&
          (reference.nodeId ?? zone.nodeId) !== zone.nodeId) {
        throw new Error(
          `Nodal zone ${zone.id} reaction must belong to node ${zone.nodeId}.`,
        );
      }

      const normal = ["load", "reaction"].includes(kind)
        ? normalizedDirection(reference.normal, `nodal zone ${zone.id} normal`)
        : null;
      const designForce = kind === "explicit"
        ? positive(
            resolver.force(Number(reference.designForce)),
            `nodal zone ${zone.id} designForce`,
          )
        : null;

      return {
        id: zone.id,
        nodeId: zone.nodeId,
        type: zone.type,
        area: positive(
          resolver.area(Number(zone.area)),
          `nodal zone ${zone.id} area`,
        ),
        forceReference: {
          kind,
          id: reference.id ?? null,
          nodeId: reference.nodeId ?? zone.nodeId,
          normal,
          designForce,
        },
        factors: normalizeFactors(zone.factors),
        metadata: { ...(zone.metadata ?? {}) },
      };
    });
    this.id = id;
    this.members = normalizedMembers.map((member) => ({ ...member }));
    this.materials = { concreteMaterial, reinforcementMaterial };
    this.units = INTERNAL_UNITS;
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }
}
