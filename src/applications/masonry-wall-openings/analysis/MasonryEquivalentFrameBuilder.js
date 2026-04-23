import {
  DofRegistry,
  FrameElement2DTimoshenkoRigidOffsets,
  LinearStaticSolver2D,
} from "../../../domain/fem/index.js";
import { Node } from "../../../domain/geometry/Node.js";
import { Support } from "../../../domain/supports/Support.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { MasonryPierModel } from "../../masonry-piers/models/MasonryPierModel.js";
import { extractEquivalentFrameMembers } from "../geometry/extractEquivalentFrameMembers.js";
import { sanitizeAlignmentOpenings } from "../geometry/sanitizeAlignmentOpenings.js";
import { resolveAlignmentMechanicalState } from "../materials/resolveAlignmentMechanicalState.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
const EPS = 1e-9;

function normalizeTopRotation(value = "free") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  const aliases = new Map([
    ["free", "free"],
    ["libera", "free"],
    ["hinged", "free"],
    ["fixed", "fixed"],
    ["fissa", "fixed"],
    ["incastrata", "fixed"],
    ["clamped", "fixed"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(`Unsupported equivalent-frame topRotation option: ${value}.`);
  }

  return resolved;
}

function serializeFrame(nodes, elements, supports, constraints = [], loads = []) {
  return {
    nodes: nodes.map((node) => node.toJSON()),
    elements: elements.map((element) => element.toJSON()),
    supports: supports.map((support) => support.toJSON()),
    constraints: [...constraints],
    loads: [...loads],
  };
}

function resolvePierCenterX(pier) {
  const effectiveLength =
    Number.isFinite(pier.effectiveLength) && pier.effectiveLength > EPS
      ? pier.effectiveLength
      : pier.length;
  const leftReduction = pier.metadata?.leftReduction ?? 0;

  return pier.x + leftReduction + effectiveLength / 2;
}

function buildPierFrameMember({ alignment, pier, topRotation }) {
  const effectiveLength =
    Number.isFinite(pier.effectiveLength) && pier.effectiveLength > EPS
      ? pier.effectiveLength
      : pier.length;
  const pierModel = new MasonryPierModel({
    id: `${pier.id}-fem`,
    units: alignment.units,
    geometry: {
      baseX: resolvePierCenterX(pier),
      baseY: 0,
      height: pier.height,
      length: effectiveLength,
      thickness: pier.thickness,
    },
    material: pier.material,
    idealization: {
      rigidEndZoneBottom: pier.rigidBottomLength,
      rigidEndZoneTop: pier.rigidTopLength,
      elementClass: "frame-2d-timoshenko-rigid-offsets",
    },
    metadata: {
      sourcePierId: pier.id,
      alignmentId: pier.alignmentId,
      topBoundaryMode: topRotation,
    },
  });
  const rigidities = pierModel.resolvedEquivalentFrameRigidities();
  const toFem = createUnitResolver(pierModel.units, FEM_UNITS);
  const baseNode = new Node({
    id: `${pier.id}-base`,
    x: pierModel.geometry.baseX,
    y: pierModel.geometry.baseY,
    units: pierModel.units,
    metadata: {
      role: "base",
      sourcePierId: pier.id,
      alignmentId: pier.alignmentId,
    },
  });
  const topNode = new Node({
    id: `${pier.id}-top`,
    x: pierModel.geometry.baseX,
    y: pierModel.geometry.baseY + pierModel.geometry.height,
    units: pierModel.units,
    metadata: {
      role: "top",
      sourcePierId: pier.id,
      alignmentId: pier.alignmentId,
    },
  });
  const element = new FrameElement2DTimoshenkoRigidOffsets({
    id: `${pier.id}-element`,
    startNode: baseNode,
    endNode: topNode,
    axialRigidity: toFem.force(rigidities.axialRigidity),
    flexuralRigidity: toFem.convert(rigidities.flexuralRigidity, {
      forceExponent: 1,
      lengthExponent: 2,
    }),
    shearRigidity: toFem.force(rigidities.shearRigidity),
    shearCorrectionFactor: rigidities.shearCorrectionFactor,
    rigidStartOffset: toFem.length(pier.rigidBottomLength),
    rigidEndOffset: toFem.length(pier.rigidTopLength),
    metadata: {
      role: "pier",
      sourcePierId: pier.id,
      wallId: pier.wallId,
      alignmentId: pier.alignmentId,
      topBoundaryMode: topRotation,
      deformableHeight: toFem.length(pier.deformableHeight),
      effectiveLength: toFem.length(effectiveLength),
    },
  });
  const supports = [
    new Support({
      id: `${pier.id}-base-fix`,
      node: baseNode,
      restraints: { ux: true, uy: true, rz: true },
      metadata: {
        role: "base-fix",
        sourcePierId: pier.id,
        topBoundaryMode: topRotation,
      },
    }),
  ];

  if (topRotation === "fixed") {
    supports.push(
      new Support({
        id: `${pier.id}-top-rot-fix`,
        node: topNode,
        restraints: { rz: true },
        metadata: {
          role: "top-rotation-fix",
          sourcePierId: pier.id,
          topBoundaryMode: topRotation,
        },
      }),
    );
  }

  return {
    pierModel,
    pier,
    nodes: [baseNode, topNode],
    element,
    supports,
    snapshot: {
      id: pier.id,
      wallId: pier.wallId,
      topBoundaryMode: topRotation,
      baseNodeId: baseNode.id,
      topNodeId: topNode.id,
      elementId: element.id,
      effectiveLength: toFem.length(effectiveLength),
      deformableHeight: toFem.length(pier.deformableHeight),
      rigidBottomLength: toFem.length(pier.rigidBottomLength),
      rigidTopLength: toFem.length(pier.rigidTopLength),
    },
  };
}

export class MasonryEquivalentFrameBuilder {
  build({
    alignment,
    stage = "design",
    options = {},
    sanitizedOpenings = null,
    extractedMembers = null,
    resolvedAlignmentState = null,
  } = {}) {
    if (!alignment) {
      throw new Error("MasonryEquivalentFrameBuilder requires an alignment model.");
    }

    const warnings = [];
    const assumptions = [
      "The first wall-level FEM builder assembles one vertical 2D Timoshenko element with rigid end offsets for each extracted masonry pier, without spandrels or diaphragm coupling between top nodes.",
      "Each pier keeps a fully fixed base; the requested topRotation option is represented only through the rotational restraint at the corresponding top node.",
      "The resulting frame is intended as the first validation scaffold for pier-only wall alignments before introducing explicit spandrels, diaphragms and non-linear global pushover control.",
    ];
    const topRotation = normalizeTopRotation(options.topRotation ?? "free");
    const includeSpandrels = Boolean(options.includeSpandrels);
    const mechanicalState =
      resolvedAlignmentState ??
      resolveAlignmentMechanicalState({
        alignment,
        stage,
        options: options.materialResolution ?? options,
      });
    const resolvedAlignment = mechanicalState.alignment;

    if (includeSpandrels) {
      warnings.push(
        "Explicit spandrels are not yet assembled in the equivalent-frame builder; the current release keeps a pier-only frame and uses topRotation to represent the upper boundary condition.",
      );
    }

    const resolvedSanitizedOpenings =
      sanitizedOpenings ??
      sanitizeAlignmentOpenings({ alignment: resolvedAlignment }).openings;
    const extracted =
      extractedMembers ??
      extractEquivalentFrameMembers({
        alignment: resolvedAlignment,
        sanitizedOpenings: resolvedSanitizedOpenings,
      });

    if (extracted.spandrels.length > 0) {
      warnings.push(
        `The equivalent-frame builder found ${extracted.spandrels.length} spandrel candidate(s), but they are intentionally ignored in this first pier-only FEM milestone.`,
      );
    }

    const pierFrames = extracted.piers.map((pier) =>
      buildPierFrameMember({
        alignment: resolvedAlignment,
        pier,
        topRotation,
      }),
    );
    const nodes = pierFrames.flatMap((frame) => frame.nodes);
    const elements = pierFrames.map((frame) => frame.element);
    const supports = pierFrames.flatMap((frame) => frame.supports);
    const constraints = [];
    const loads = [];
    const dofRegistry = new DofRegistry();

    dofRegistry.registerNodes(nodes);
    dofRegistry.registerElements(elements);
    dofRegistry.registerNodes(supports.map((support) => support.node));

    return {
      id: `${resolvedAlignment.id}-equivalent-frame`,
      stage,
      topRotation,
      model: {
        id: `${resolvedAlignment.id}-equivalent-frame`,
        units: FEM_UNITS,
        nodes,
        elements,
        supports,
        constraints,
        loads,
      },
      pierFrames: pierFrames.map((frame) => frame.snapshot),
      dofRegistry,
      snapshot: {
        id: `${resolvedAlignment.id}-equivalent-frame`,
        units: FEM_UNITS,
        ...serializeFrame(nodes, elements, supports, constraints, loads),
        metadata: {
          sourceAlignmentId: resolvedAlignment.id,
          stage,
          topRotation,
          includeSpandrels: false,
          frameType: "pier-only",
          pierCount: pierFrames.length,
          ignoredSpandrelCount: extracted.spandrels.length,
          topNodeIds: pierFrames.map((frame) => frame.snapshot.topNodeId),
        },
      },
      warnings: [
        ...warnings,
        ...mechanicalState.warnings,
        ...extracted.warnings,
      ],
      assumptions: [
        ...assumptions,
        ...mechanicalState.assumptions,
        ...extracted.assumptions,
      ],
      createSolver() {
        return new LinearStaticSolver2D();
      },
    };
  }
}
