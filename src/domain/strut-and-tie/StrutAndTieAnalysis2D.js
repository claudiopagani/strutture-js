import { DofRegistry } from "../fem/DofRegistry.js";
import { LinearStaticSolver2D } from "../fem/LinearStaticSolver2D.js";
import { AxialMember2D } from "./AxialMember2D.js";
import { StrutAndTieModel2D } from "./StrutAndTieModel2D.js";

function round(value, decimals = 9) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;
}

export class StrutAndTieAnalysis2D {
  constructor({ solver = null } = {}) {
    this.solver = solver ?? new LinearStaticSolver2D({
      dofRegistry: new DofRegistry({ dofsPerNode: ["ux", "uy"] }),
    });
  }

  analyze(input) {
    const model = input instanceof StrutAndTieModel2D
      ? input
      : new StrutAndTieModel2D(input);
    const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
    const elements = model.members.map((member) => new AxialMember2D({
      id: member.id,
      startNode: nodeById.get(member.startNodeId),
      endNode: nodeById.get(member.endNodeId),
      axialRigidity: member.axialRigidity,
      metadata: { type: member.type },
    }));
    const solved = this.solver.solve({
      nodes: model.nodes,
      elements,
      loads: model.loads.map((load) => ({
        id: load.id,
        node: nodeById.get(load.nodeId),
        components: { fx: load.fx, fy: load.fy },
      })),
      supports: model.supports.map((support) => ({
        id: support.id,
        node: nodeById.get(support.nodeId),
        restraints: { ux: support.ux, uy: support.uy },
      })),
    });
    const memberById = new Map(model.members.map((member) => [member.id, member]));
    const members = elements.map((element) => {
      const source = memberById.get(element.id);
      const response = element.axialResponse(solved.displacementByNode);
      const tolerance = Math.max(1, Math.abs(response.force)) * 1e-9;
      const state = response.force > tolerance
        ? "tension"
        : response.force < -tolerance
          ? "compression"
          : "zero";

      return {
        id: source.id,
        type: source.type,
        startNodeId: source.startNodeId,
        endNodeId: source.endNodeId,
        length: round(source.length),
        area: round(source.area),
        axialRigidity: round(source.axialRigidity),
        force: round(response.force),
        stress: round(response.force / source.area),
        extension: round(response.extension),
        strain: round(response.strain, 12),
        state,
        signConvention: response.signConvention,
      };
    });
    const reactionByNode = Object.fromEntries(model.nodes.map((node) => [
      node.id,
      {
        fx: round(solved.reactionByNode[node.id]?.ux ?? 0),
        fy: round(solved.reactionByNode[node.id]?.uy ?? 0),
      },
    ]));
    const loadResultant = model.loads.reduce(
      (sum, load) => ({ fx: sum.fx + load.fx, fy: sum.fy + load.fy }),
      { fx: 0, fy: 0 },
    );
    const reactionResultant = Object.values(reactionByNode).reduce(
      (sum, reaction) => ({
        fx: sum.fx + reaction.fx,
        fy: sum.fy + reaction.fy,
      }),
      { fx: 0, fy: 0 },
    );
    const restraintCount = model.supports.reduce(
      (sum, support) => sum + Number(support.ux) + Number(support.uy),
      0,
    );
    const staticIndeterminacy = model.members.length + restraintCount -
      2 * model.nodes.length;

    return {
      modelId: model.id,
      units: { ...model.units },
      nodes: model.nodes.map((node) => ({
        ...node,
        displacements: {
          ux: round(solved.displacementByNode[node.id]?.ux ?? 0),
          uy: round(solved.displacementByNode[node.id]?.uy ?? 0),
        },
        reaction: reactionByNode[node.id],
      })),
      members,
      loads: model.loads.map((load) => ({ ...load })),
      reactions: reactionByNode,
      equilibrium: {
        loadResultant: {
          fx: round(loadResultant.fx),
          fy: round(loadResultant.fy),
        },
        reactionResultant,
        residual: {
          fx: round(loadResultant.fx + reactionResultant.fx),
          fy: round(loadResultant.fy + reactionResultant.fy),
        },
      },
      topology: {
        nodeCount: model.nodes.length,
        memberCount: model.members.length,
        restraintCount,
        staticIndeterminacy,
        forceDistributionDependsOnAxialRigidity: staticIndeterminacy > 0,
      },
      diagnostics: {
        method: solved.reducedSystem.diagnostics?.method ?? null,
        residual: solved.reducedSystem.diagnostics?.residual ?? null,
        warnings: [...(solved.reducedSystem.diagnostics?.warnings ?? [])],
      },
    };
  }
}
