import { FrameElement2DTimoshenko } from "./FrameElement2DTimoshenko.js";
import { createZeroVector } from "../../math/arrayLinearAlgebra.js";

function assertNode(node, label) {
  if (!node?.id) {
    throw new Error(`FrameElement2DTimoshenkoRigidOffsets requires a ${label} node.`);
  }
}

function assertNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`FrameElement2DTimoshenkoRigidOffsets requires a non-negative ${label}.`);
  }
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`FrameElement2DTimoshenkoRigidOffsets requires a positive ${label}.`);
  }
}

function cloneReferenceNode(node, label) {
  if (node == null) {
    return null;
  }

  assertNode(node, label);

  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
    throw new Error(
      `FrameElement2DTimoshenkoRigidOffsets requires finite ${label} reference-node coordinates.`,
    );
  }

  return {
    id: node.id,
    x: node.x,
    y: node.y,
  };
}

function transpose(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function multiplyMatrices(left, right) {
  return left.map((leftRow) =>
    right[0].map((_, column) =>
      leftRow.reduce((sum, value, index) => sum + value * right[index][column], 0),
    ),
  );
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function subtractVectors(left, right) {
  return left.map((value, index) => value - right[index]);
}

function resolveGlobalElementDisplacements(element, globalDisplacements, dofRegistry) {
  if (!Array.isArray(globalDisplacements)) {
    throw new Error(
      "FrameElement2DTimoshenkoRigidOffsets localDisplacements requires a displacement vector.",
    );
  }

  return element.getDofIds(dofRegistry).map((dofId) => {
    const value = globalDisplacements[dofRegistry.getIndex(dofId)];

    if (!Number.isFinite(value)) {
      throw new Error(
        `FrameElement2DTimoshenkoRigidOffsets displacement for DOF ${dofId} must be finite.`,
      );
    }

    return value;
  });
}

export class FrameElement2DTimoshenkoRigidOffsets {
  constructor({
    id,
    startNode,
    endNode,
    material = null,
    crossSection = null,
    axialRigidity = null,
    flexuralRigidity = null,
    shearRigidity = null,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = null,
    rigidStartOffset = 0,
    rigidEndOffset = 0,
    referenceStartNode = null,
    referenceEndNode = null,
    metadata = {},
  }) {
    if (!id) {
      throw new Error("A FrameElement2DTimoshenkoRigidOffsets id is required.");
    }

    assertNode(startNode, "start");
    assertNode(endNode, "end");
    assertNonNegative(rigidStartOffset, "rigidStartOffset");
    assertNonNegative(rigidEndOffset, "rigidEndOffset");

    this.id = id;
    this.type = "frame-2d-timoshenko-rigid-offsets";
    this.startNode = startNode;
    this.endNode = endNode;
    this.nodes = [startNode, endNode];
    this.material = material;
    this.crossSection = crossSection;
    this.axialRigidity = axialRigidity;
    this.flexuralRigidity = flexuralRigidity;
    this.shearRigidity = shearRigidity;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.rigidStartOffset = rigidStartOffset;
    this.rigidEndOffset = rigidEndOffset;
    this._explicitReferenceStartNode = cloneReferenceNode(
      referenceStartNode,
      "start",
    );
    this._explicitReferenceEndNode = cloneReferenceNode(referenceEndNode, "end");
    this.metadata = { ...metadata };

    if (
      (this._explicitReferenceStartNode == null) !==
      (this._explicitReferenceEndNode == null)
    ) {
      throw new Error(
        "FrameElement2DTimoshenkoRigidOffsets requires both referenceStartNode and referenceEndNode when using explicit reference nodes.",
      );
    }
  }

  geometry() {
    return {
      dx: this.endNode.x - this.startNode.x,
      dy: this.endNode.y - this.startNode.y,
    };
  }

  directionCosines() {
    const { dx, dy } = this.geometry();
    const length = Math.sqrt(dx ** 2 + dy ** 2);

    assertPositive(length, "physical element length");

    return {
      length,
      c: dx / length,
      s: dy / length,
    };
  }

  physicalLength() {
    return this.directionCosines().length;
  }

  deformableLength() {
    return this.referenceDirectionCosines().length;
  }

  referenceNodes() {
    if (this._explicitReferenceStartNode && this._explicitReferenceEndNode) {
      return {
        start: { ...this._explicitReferenceStartNode },
        end: { ...this._explicitReferenceEndNode },
      };
    }

    const { c, s } = this.directionCosines();

    return {
      start: {
        id: `${this.id}__deformable_start`,
        x: this.startNode.x + this.rigidStartOffset * c,
        y: this.startNode.y + this.rigidStartOffset * s,
      },
      end: {
        id: `${this.id}__deformable_end`,
        x: this.endNode.x - this.rigidEndOffset * c,
        y: this.endNode.y - this.rigidEndOffset * s,
      },
    };
  }

  referenceDirectionCosines() {
    const nodes = this.referenceNodes();
    const dx = nodes.end.x - nodes.start.x;
    const dy = nodes.end.y - nodes.start.y;
    const length = Math.sqrt(dx ** 2 + dy ** 2);

    assertPositive(length, "deformable element length after rigid end offsets");

    return {
      length,
      c: dx / length,
      s: dy / length,
    };
  }

  rigidOffsetVector(node, referenceNode) {
    const { c, s } = this.referenceDirectionCosines();
    const dx = referenceNode.x - node.x;
    const dy = referenceNode.y - node.y;

    return {
      x: c * dx + s * dy,
      y: -s * dx + c * dy,
    };
  }

  referenceElement() {
    if (!this._referenceElement) {
      const nodes = this.referenceNodes();

      this._referenceElement = new FrameElement2DTimoshenko({
        id: `${this.id}__deformable`,
        startNode: nodes.start,
        endNode: nodes.end,
        material: this.material,
        crossSection: this.crossSection,
        axialRigidity: this.axialRigidity,
        flexuralRigidity: this.flexuralRigidity,
        shearRigidity: this.shearRigidity,
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        shearCorrectionFactor: this.shearCorrectionFactor,
        metadata: {
          ...this.metadata,
          parentElementId: this.id,
        },
      });
    }

    return this._referenceElement;
  }

  kinematicTransformationMatrix() {
    const nodes = this.referenceNodes();
    const startOffset = this.rigidOffsetVector(this.startNode, nodes.start);
    const endOffset = this.rigidOffsetVector(this.endNode, nodes.end);

    return [
      [1, 0, -startOffset.y, 0, 0, 0],
      [0, 1, startOffset.x, 0, 0, 0],
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, 1, 0, -endOffset.y],
      [0, 0, 0, 0, 1, endOffset.x],
      [0, 0, 0, 0, 0, 1],
    ];
  }

  getDofIds(dofRegistry) {
    return [
      dofRegistry.getDofId(this.startNode, "ux"),
      dofRegistry.getDofId(this.startNode, "uy"),
      dofRegistry.getDofId(this.startNode, "rz"),
      dofRegistry.getDofId(this.endNode, "ux"),
      dofRegistry.getDofId(this.endNode, "uy"),
      dofRegistry.getDofId(this.endNode, "rz"),
    ];
  }

  localStiffness() {
    const q = this.kinematicTransformationMatrix();
    const k = this.referenceElement().localStiffness();

    return multiplyMatrices(transpose(q), multiplyMatrices(k, q));
  }

  transformationMatrix() {
    return this.referenceElement().transformationMatrix();
  }

  globalStiffness() {
    const transformation = this.transformationMatrix();
    const localStiffness = this.localStiffness();

    return multiplyMatrices(
      transpose(transformation),
      multiplyMatrices(localStiffness, transformation),
    );
  }

  getGlobalStiffness() {
    return this.globalStiffness();
  }

  localPhysicalDisplacements(globalDisplacements, dofRegistry) {
    const globalElementDisplacements = resolveGlobalElementDisplacements(
      this,
      globalDisplacements,
      dofRegistry,
    );

    return multiplyMatrixVector(
      this.transformationMatrix(),
      globalElementDisplacements,
    );
  }

  localDeformableDisplacements(globalDisplacements, dofRegistry) {
    const localPhysicalDisplacements = this.localPhysicalDisplacements(
      globalDisplacements,
      dofRegistry,
    );

    return multiplyMatrixVector(
      this.kinematicTransformationMatrix(),
      localPhysicalDisplacements,
    );
  }

  localDisplacements(globalDisplacements, dofRegistry) {
    return this.localPhysicalDisplacements(globalDisplacements, dofRegistry);
  }

  equivalentNodalLoadVector({ loads = [] } = {}) {
    if (!Array.isArray(loads) || loads.length === 0) {
      return createZeroVector(6);
    }

    if (this.rigidStartOffset !== 0 || this.rigidEndOffset !== 0) {
      throw new Error(
        "FrameElement2DTimoshenkoRigidOffsets does not yet support element loads together with non-zero rigid end offsets.",
      );
    }

    return this.referenceElement().equivalentNodalLoadVector({ loads });
  }

  localEndForces(globalDisplacements, dofRegistry, { equivalentNodalLoad = null } = {}) {
    const loadVector = equivalentNodalLoad ?? createZeroVector(6);

    if (!Array.isArray(loadVector) || loadVector.length !== 6) {
      throw new Error(
        "FrameElement2DTimoshenkoRigidOffsets equivalentNodalLoad must be a 6-entry vector.",
      );
    }

    const localPhysicalDisplacements = this.localPhysicalDisplacements(
      globalDisplacements,
      dofRegistry,
    );
    const elasticForces = multiplyMatrixVector(
      this.localStiffness(),
      localPhysicalDisplacements,
    );

    return subtractVectors(elasticForces, loadVector);
  }

  toJSON() {
    const nodes = this.referenceNodes();
    const startOffset = this.rigidOffsetVector(this.startNode, nodes.start);
    const endOffset = this.rigidOffsetVector(this.endNode, nodes.end);

    return {
      id: this.id,
      type: this.type,
      startNodeId: this.startNode.id,
      endNodeId: this.endNode.id,
      length: this.physicalLength(),
      deformableLength: this.deformableLength(),
      rigidStartOffset: this.rigidStartOffset,
      rigidEndOffset: this.rigidEndOffset,
      referenceStartNode: { ...nodes.start },
      referenceEndNode: { ...nodes.end },
      rigidStartOffsetVector: { ...startOffset },
      rigidEndOffsetVector: { ...endOffset },
      axialRigidity: this.axialRigidity,
      flexuralRigidity: this.flexuralRigidity,
      bendingInertiaAxis: this.bendingInertiaAxis,
      material: this.material?.toJSON?.() ?? this.material,
      crossSection: this.crossSection?.toJSON?.() ?? this.crossSection,
      metadata: { ...this.metadata },
      shearRigidity: this.shearRigidity,
      shearAreaAxis: this.shearAreaAxis,
      shearCorrectionFactor: this.shearCorrectionFactor,
    };
  }
}
