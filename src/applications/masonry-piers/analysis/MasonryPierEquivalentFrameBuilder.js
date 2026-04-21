import {
  FrameElement2DTimoshenkoRigidOffsets,
  LinearStaticSolver2D,
} from "../../../domain/fem/index.js";
import { Node } from "../../../domain/geometry/Node.js";
import { Support } from "../../../domain/supports/Support.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { MasonryPierModel } from "../models/MasonryPierModel.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function serializeModel(nodes, elements, supports) {
  return {
    nodes: nodes.map((node) => node.toJSON()),
    elements: elements.map((element) => element.toJSON()),
    supports: supports.map((support) => support.toJSON()),
  };
}

function resolveModel(input) {
  return input instanceof MasonryPierModel
    ? input
    : new MasonryPierModel(input);
}

export class MasonryPierEquivalentFrameBuilder {
  build({ model } = {}) {
    const resolvedModel = resolveModel(model ?? {});
    const warnings = [];
    const assumptions = [
      "The equivalent-frame idealization uses one 2D Timoshenko element with rigid end zones embedded through a local kinematic transformation Q^T K Q, without additional internal nodes.",
      "The base node is always fully fixed in the equivalent-frame idealization, in line with the requested standalone cantilever scheme.",
    ];

    if (
      resolvedModel.idealization.elementClass !== "frame-2d-timoshenko" &&
      resolvedModel.idealization.elementClass !==
        "frame-2d-timoshenko-rigid-offsets"
    ) {
      throw new Error(
        `MasonryPierEquivalentFrameBuilder supports only frame-2d-timoshenko based idealizations. Received: ${resolvedModel.idealization.elementClass}.`,
      );
    }

    const rigidities = resolvedModel.resolvedEquivalentFrameRigidities();

    if (!Number.isFinite(rigidities.axialRigidity) || rigidities.axialRigidity <= 0) {
      throw new Error(
        "MasonryPierEquivalentFrameBuilder requires a positive axial rigidity or a masonry material with finite E.",
      );
    }

    if (!Number.isFinite(rigidities.flexuralRigidity) || rigidities.flexuralRigidity <= 0) {
      throw new Error(
        "MasonryPierEquivalentFrameBuilder requires a positive flexural rigidity or a masonry material with finite E.",
      );
    }

    if (!Number.isFinite(rigidities.shearRigidity) || rigidities.shearRigidity <= 0) {
      throw new Error(
        "MasonryPierEquivalentFrameBuilder requires a positive shear rigidity or a masonry material with finite G.",
      );
    }

    const geometryToFem = createUnitResolver(resolvedModel.units, FEM_UNITS);
    const baseNode = new Node({
      id: `${resolvedModel.id}-base`,
      x: resolvedModel.geometry.baseX,
      y: resolvedModel.geometry.baseY,
      units: resolvedModel.units,
      metadata: { role: "base" },
    });
    const topNode = new Node({
      id: `${resolvedModel.id}-top`,
      x: resolvedModel.geometry.baseX,
      y: resolvedModel.geometry.baseY + resolvedModel.geometry.height,
      units: resolvedModel.units,
      metadata: { role: "top" },
    });
    const nodes = [baseNode, topNode];
    const deformableElement = new FrameElement2DTimoshenkoRigidOffsets({
      id: `${resolvedModel.id}-element-1`,
      startNode: baseNode,
      endNode: topNode,
      axialRigidity: geometryToFem.force(rigidities.axialRigidity),
      flexuralRigidity: geometryToFem.convert(rigidities.flexuralRigidity, {
        forceExponent: 1,
        lengthExponent: 2,
      }),
      shearRigidity: geometryToFem.force(rigidities.shearRigidity),
      shearCorrectionFactor: rigidities.shearCorrectionFactor,
      rigidStartOffset: geometryToFem.length(
        resolvedModel.idealization.rigidEndZoneBottom,
      ),
      rigidEndOffset: geometryToFem.length(
        resolvedModel.idealization.rigidEndZoneTop,
      ),
      metadata: {
        sourceModelId: resolvedModel.id,
        deformableHeight: geometryToFem.length(resolvedModel.deformableHeight()),
      },
    });
    const supports = [
      new Support({
        id: `${resolvedModel.id}-base-fix`,
        node: baseNode,
        restraints: { ux: true, uy: true, rz: true },
      }),
    ];
    const serializable = serializeModel(nodes, [deformableElement], supports);

    return {
      id: `${resolvedModel.id}-equivalent-frame`,
      model: {
        id: `${resolvedModel.id}-equivalent-frame`,
        units: FEM_UNITS,
        nodes,
        elements: [deformableElement],
        supports,
        constraints: [],
        loads: [],
      },
      snapshot: {
        id: `${resolvedModel.id}-equivalent-frame`,
        units: FEM_UNITS,
        ...serializable,
        constraints: [],
        metadata: {
          sourceModelId: resolvedModel.id,
          baseNodeId: baseNode.id,
          topNodeId: topNode.id,
          elementId: deformableElement.id,
          rigidOffsetsEmbedded: true,
          rigidEndZoneBottom: geometryToFem.length(
            resolvedModel.idealization.rigidEndZoneBottom,
          ),
          rigidEndZoneTop: geometryToFem.length(
            resolvedModel.idealization.rigidEndZoneTop,
          ),
          deformableHeight: geometryToFem.length(resolvedModel.deformableHeight()),
          axialRigidity: geometryToFem.force(rigidities.axialRigidity),
          flexuralRigidity: geometryToFem.convert(rigidities.flexuralRigidity, {
            forceExponent: 1,
            lengthExponent: 2,
          }),
          shearRigidity: geometryToFem.force(rigidities.shearRigidity),
          shearCorrectionFactor: rigidities.shearCorrectionFactor,
        },
      },
      warnings,
      assumptions,
      createSolver() {
        return new LinearStaticSolver2D();
      },
    };
  }
}
