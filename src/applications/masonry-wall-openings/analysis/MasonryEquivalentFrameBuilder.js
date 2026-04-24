import {
  DofRegistry,
  FrameElement2DTimoshenkoRigidOffsets,
  LinearStaticSolver2D,
} from "../../../domain/fem/index.js";
import { Node } from "../../../domain/geometry/Node.js";
import { Support } from "../../../domain/supports/Support.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { MasonryPierModel } from "../../masonry-piers/models/MasonryPierModel.js";
import { SteelRingFrame2DBuilder } from "../../steel-frames/analysis/SteelRingFrame2DBuilder.js";
import { extractEquivalentFrameMembers } from "../geometry/extractEquivalentFrameMembers.js";
import { sanitizeAlignmentOpenings } from "../geometry/sanitizeAlignmentOpenings.js";
import { resolveAlignmentMechanicalState } from "../materials/resolveAlignmentMechanicalState.js";
import { resolveMasonryMaterialProperty } from "../materials/resolveMasonryMaterialProperty.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
const SHEAR_CORRECTION_FACTOR = 5 / 6;
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
    constraints: constraints.map((constraint) => ({ ...constraint })),
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

function average(values = []) {
  const finiteValues = values.filter(Number.isFinite);

  if (finiteValues.length === 0) {
    return 0;
  }

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function sameCoordinate(left, right) {
  return Math.abs(left - right) <= EPS;
}

function createDiaphragmControlNode({ alignment, topNodes = [] }) {
  return new Node({
    id: `${alignment.id}-diaphragm-control`,
    x: average(topNodes.map((node) => node.x)),
    y: Math.max(...topNodes.map((node) => node.y)),
    units: alignment.units,
    metadata: {
      role: "diaphragm-control",
      sourceAlignmentId: alignment.id,
    },
  });
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
  const femEffectiveLength = toFem.length(pierModel.geometry.length);
  const femDeformableHeight = toFem.length(pierModel.deformableHeight());
  const femRigidBottomLength = toFem.length(
    pierModel.idealization.rigidEndZoneBottom,
  );
  const femRigidTopLength = toFem.length(pierModel.idealization.rigidEndZoneTop);
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
    rigidStartOffset: femRigidBottomLength,
    rigidEndOffset: femRigidTopLength,
    metadata: {
      role: "pier",
      sourcePierId: pier.id,
      wallId: pier.wallId,
      alignmentId: pier.alignmentId,
      topBoundaryMode: topRotation,
      deformableHeight: femDeformableHeight,
      effectiveLength: femEffectiveLength,
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
      effectiveLength: femEffectiveLength,
      deformableHeight: femDeformableHeight,
      rigidBottomLength: femRigidBottomLength,
      rigidTopLength: femRigidTopLength,
    },
  };
}

function resolveSpandrelRigidities({ alignment, spandrel, warnings }) {
  const elasticModulus = resolveMasonryMaterialProperty({
    material: spandrel.material,
    aliases: ["E", "elasticModulus"],
    targetUnits: alignment.units,
  });
  const shearModulus = resolveMasonryMaterialProperty({
    material: spandrel.material,
    aliases: ["G", "shearModulus"],
    targetUnits: alignment.units,
  });
  const area = spandrel.height * spandrel.thickness;
  const inertia = (spandrel.thickness * spandrel.height ** 3) / 12;

  if (!Number.isFinite(elasticModulus) || elasticModulus <= EPS) {
    warnings.push(
      `Spandrel ${spandrel.id} could not resolve a finite masonry elastic modulus and was skipped in the equivalent-frame assembly.`,
    );
    return null;
  }

  if (!Number.isFinite(shearModulus) || shearModulus <= EPS) {
    warnings.push(
      `Spandrel ${spandrel.id} could not resolve a finite masonry shear modulus and was skipped in the equivalent-frame assembly.`,
    );
    return null;
  }

  return {
    axialRigidity: elasticModulus * area,
    flexuralRigidity: elasticModulus * inertia,
    shearRigidity: shearModulus * area,
    shearCorrectionFactor: SHEAR_CORRECTION_FACTOR,
  };
}

function findAdjacentPierFrame({ pierFrames, spandrel, side }) {
  if (side === "left") {
    return pierFrames.find((frame) =>
      sameCoordinate(frame.pier.metadata?.xEnd, spandrel.xStart),
    );
  }

  return pierFrames.find((frame) => sameCoordinate(frame.pier.x, spandrel.xEnd));
}

function findFrameNode(frame, nodeId) {
  return frame.nodes.find((node) => node.id === nodeId) ?? null;
}

function buildSpandrelFrameMember({ alignment, spandrel, pierFrames, warnings }) {
  const leftPierFrame = findAdjacentPierFrame({
    pierFrames,
    spandrel,
    side: "left",
  });
  const rightPierFrame = findAdjacentPierFrame({
    pierFrames,
    spandrel,
    side: "right",
  });

  if (!leftPierFrame || !rightPierFrame) {
    warnings.push(
      `Spandrel ${spandrel.id} could not find both adjacent pier top nodes and was skipped in the equivalent-frame assembly.`,
    );
    return null;
  }

  const startNode = findFrameNode(leftPierFrame, leftPierFrame.snapshot.topNodeId);
  const endNode = findFrameNode(rightPierFrame, rightPierFrame.snapshot.topNodeId);

  if (!startNode || !endNode) {
    warnings.push(
      `Spandrel ${spandrel.id} could not resolve both adjacent pier top nodes and was skipped in the equivalent-frame assembly.`,
    );
    return null;
  }

  const toFem = createUnitResolver(alignment.units, FEM_UNITS);
  const physicalLength = endNode.x - startNode.x;
  const rigidLeftLength = Math.max(0, spandrel.xStart - startNode.x);
  const rigidRightLength = Math.max(0, endNode.x - spandrel.xEnd);
  const deformableAxisY =
    Number.isFinite(spandrel.metadata?.yStart)
      ? spandrel.metadata.yStart + spandrel.height / 2
      : startNode.y;
  const referenceStartNode = {
    id: `${spandrel.id}-deformable-start`,
    x: toFem.length(spandrel.xStart),
    y: toFem.length(deformableAxisY),
  };
  const referenceEndNode = {
    id: `${spandrel.id}-deformable-end`,
    x: toFem.length(spandrel.xEnd),
    y: toFem.length(deformableAxisY),
  };
  const deformableLength = referenceEndNode.x - referenceStartNode.x;

  if (
    physicalLength <= EPS ||
    deformableLength <= EPS ||
    Math.abs(deformableLength - spandrel.deformableLength) > 1e-6
  ) {
    warnings.push(
      `Spandrel ${spandrel.id} could not be assembled with a positive deformable length matching the underlying opening and was skipped.`,
    );
    return null;
  }

  const rigidities = resolveSpandrelRigidities({
    alignment,
    spandrel,
    warnings,
  });

  if (!rigidities) {
    return null;
  }

  const element = new FrameElement2DTimoshenkoRigidOffsets({
    id: `${spandrel.id}-element`,
    startNode,
    endNode,
    axialRigidity: toFem.force(rigidities.axialRigidity),
    flexuralRigidity: toFem.convert(rigidities.flexuralRigidity, {
      forceExponent: 1,
      lengthExponent: 2,
    }),
    shearRigidity: toFem.force(rigidities.shearRigidity),
    shearCorrectionFactor: rigidities.shearCorrectionFactor,
    rigidStartOffset: toFem.length(rigidLeftLength),
    rigidEndOffset: toFem.length(rigidRightLength),
    referenceStartNode,
    referenceEndNode,
    metadata: {
      role: "spandrel",
      sourceSpandrelId: spandrel.id,
      referenceOpeningId: spandrel.metadata?.referenceOpeningId ?? null,
      sourceWallIds: [...spandrel.sourceWallIds],
      alignmentId: spandrel.alignmentId,
      deformableLength: toFem.length(spandrel.deformableLength),
      deformableAxisY: toFem.length(deformableAxisY),
      sectionHeight: toFem.length(spandrel.height),
      thickness: toFem.length(spandrel.thickness),
    },
  });

  return {
    spandrel,
    element,
    snapshot: {
      id: spandrel.id,
      sourceWallIds: [...spandrel.sourceWallIds],
      referenceOpeningId: spandrel.metadata?.referenceOpeningId ?? null,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      elementId: element.id,
      xStart: toFem.length(spandrel.xStart),
      xEnd: toFem.length(spandrel.xEnd),
      deformableLength: toFem.length(spandrel.deformableLength),
      rigidLeftLength: toFem.length(rigidLeftLength),
      rigidRightLength: toFem.length(rigidRightLength),
      deformableAxisY: toFem.length(deformableAxisY),
      height: toFem.length(spandrel.height),
      thickness: toFem.length(spandrel.thickness),
    },
  };
}

function resolveRingFrameCount(ringFrame) {
  const candidates = [
    ringFrame?.frameCount,
    ringFrame?.parallelFrameCount,
    ringFrame?.framesInThickness,
    ringFrame?.parallelFrames,
    ringFrame?.count,
  ];
  const declared = candidates.find((value) => Number.isFinite(Number(value)));

  return Math.max(1, Math.round(Number(declared ?? 1)));
}

function resolveRingFrameSections(ringFrame = {}) {
  if (ringFrame.memberSections) {
    return ringFrame.memberSections;
  }

  const defaultProfile =
    ringFrame.profileName ??
    ringFrame.profile ??
    ringFrame.sectionProfileName ??
    ringFrame.columnProfileName ??
    ringFrame.topBeamProfileName ??
    null;
  const columns =
    ringFrame.columns ?? ringFrame.column ?? ringFrame.columnProfileName ?? defaultProfile;
  const topBeam =
    ringFrame.topBeam ??
    ringFrame.architrave ??
    ringFrame.topBeamProfileName ??
    defaultProfile;
  const bottomBeam =
    ringFrame.bottomBeam ??
    ringFrame.bottomChord ??
    ringFrame.bottomBeamProfileName ??
    topBeam;

  if (!columns || !topBeam) {
    return null;
  }

  return {
    leftColumn: ringFrame.leftColumn ?? columns,
    rightColumn: ringFrame.rightColumn ?? columns,
    topBeam,
    bottomBeam,
  };
}

function resolveRingFrameMemberOrientations(ringFrame = {}) {
  const orientations =
    ringFrame.memberOrientations ??
    ringFrame.memberOrientation ??
    ringFrame.sectionOrientations ??
    ringFrame.sectionOrientation ??
    ringFrame.orientations ??
    ringFrame.orientation ??
    {};

  if (typeof orientations === "string") {
    return { columns: orientations, topBeam: orientations, bottomBeam: orientations };
  }

  return {
    ...orientations,
    columns:
      orientations.columns ??
      orientations.column ??
      ringFrame.columnOrientation ??
      ringFrame.columnsOrientation,
    leftColumn:
      orientations.leftColumn ??
      orientations.leftPier ??
      ringFrame.leftColumnOrientation,
    rightColumn:
      orientations.rightColumn ??
      orientations.rightPier ??
      ringFrame.rightColumnOrientation,
    topBeam:
      orientations.topBeam ??
      orientations.architrave ??
      ringFrame.topBeamOrientation ??
      ringFrame.architraveOrientation,
    bottomBeam:
      orientations.bottomBeam ??
      orientations.bottomChord ??
      ringFrame.bottomBeamOrientation ??
      ringFrame.bottomChordOrientation,
  };
}

function scaleRingFrameElement(element, factor) {
  if (!Number.isFinite(factor) || factor <= 1) {
    return;
  }

  element.axialRigidity *= factor;
  element.flexuralRigidity *= factor;
  element.plasticMomentStart *= factor;
  element.plasticMomentEnd *= factor;

  if (element.elasticElement) {
    element.elasticElement.axialRigidity = element.axialRigidity;
    element.elasticElement.flexuralRigidity = element.flexuralRigidity;
  }
}

function buildRingFrameMembers({ alignment, openings = [], warnings }) {
  const ringFrameBuilder = new SteelRingFrame2DBuilder();

  return openings
    .map((opening) => {
      const ringFrame = opening.ringFrame;

      if (!ringFrame) {
        return null;
      }

      const memberSections = resolveRingFrameSections(ringFrame);
      const frameCount = resolveRingFrameCount(ringFrame);

      if (!memberSections) {
        warnings.push(
          `Opening ${opening.id} has a ringFrame definition but no member sections/profile names, so the steel ring frame was skipped in the equivalent-frame FEM assembly.`,
        );
        return null;
      }

      const modelId = `${alignment.id}-ring-frame-${opening.id}`;

      try {
        const frame = ringFrameBuilder.build({
          model: {
            id: modelId,
            units: alignment.units,
            geometry: {
              clearWidth: opening.width,
              clearHeight: opening.height,
              originX: opening.x,
              originY: opening.y,
          },
          memberSections,
          memberOrientations: resolveRingFrameMemberOrientations(ringFrame),
          material:
            ringFrame.material ??
              ringFrame.materialGrade ??
              ringFrame.grade ??
              "S275",
            baseCondition:
              ringFrame.baseCondition ??
              (ringFrame.includeBottomBeam
                ? "pinned-base-with-bottom-beam"
                : "fixed-base"),
            includeBottomBeam: ringFrame.includeBottomBeam,
            loading: {
              controlNode: ringFrame.controlNode ?? "top-left",
              referenceHorizontalForce:
                ringFrame.referenceHorizontalForce ??
                ringFrame.horizontalForce ??
                ringFrame.Fh ??
                1,
            },
          },
        });
        const topNodes = frame.nodes.filter((node) =>
          ["top-left", "top-right"].includes(node.metadata?.role),
        );

        frame.nodes.forEach((node) => {
          node.metadata = {
            ...node.metadata,
            sourceOpeningId: opening.id,
            sourceRingFrameId: modelId,
            ringFrameCount: frameCount,
          };
        });
        frame.elements.forEach((element) => {
          scaleRingFrameElement(element, frameCount);
          element.metadata = {
            ...element.metadata,
            sourceOpeningId: opening.id,
            sourceRingFrameId: modelId,
            ringFrameCount: frameCount,
            equivalentParallelFrames: frameCount,
          };
        });
        frame.supports.forEach((support) => {
          support.metadata = {
            ...support.metadata,
            sourceOpeningId: opening.id,
            sourceRingFrameId: modelId,
            ringFrameCount: frameCount,
          };
        });

        return {
          opening,
          frameCount,
          nodes: frame.nodes,
          elements: frame.elements,
          supports: frame.supports,
          topNodes,
          snapshot: {
            id: modelId,
            openingId: opening.id,
            frameCount,
            equivalentParallelFrames: frameCount,
            topNodeIds: topNodes.map((node) => node.id),
            nodeIds: frame.nodes.map((node) => node.id),
            elementIds: frame.elements.map((element) => element.id),
            supportIds: frame.supports.map((support) => support.id),
            baseCondition: frame.snapshot.metadata.baseCondition,
            includeBottomBeam: frame.snapshot.metadata.includeBottomBeam,
          },
          assumptions: frame.assumptions,
          warnings: frame.warnings,
        };
      } catch (error) {
        warnings.push(
          `Opening ${opening.id} steel ring frame could not be assembled in the equivalent-frame FEM model: ${error.message}`,
        );
        return null;
      }
    })
    .filter(Boolean);
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
    const topRotation = normalizeTopRotation(options.topRotation ?? "free");
    const includeSpandrels = Boolean(options.includeSpandrels);
    const includeDiaphragm = Boolean(options.includeDiaphragm);
    const includeRingFrames = options.includeRingFrames !== false;
    const assumptions = [
      includeSpandrels
        ? "The wall-level FEM builder assembles one vertical 2D Timoshenko element with rigid end offsets for each extracted masonry pier and one linear elastic Timoshenko element for each assemblable masonry spandrel."
        : includeDiaphragm
          ? "The wall-level FEM builder assembles one vertical 2D Timoshenko element with rigid end offsets for each extracted masonry pier, without spandrels and with an optional top diaphragm master node that ties only the ux DOF of the pier heads."
          : "The wall-level FEM builder assembles one vertical 2D Timoshenko element with rigid end offsets for each extracted masonry pier, without spandrels or diaphragm coupling between top nodes.",
      "Each pier keeps a fully fixed base; the requested topRotation option is represented only through the rotational restraint at the corresponding top node.",
      "The resulting frame is intended as the validation scaffold for wall alignments before introducing non-linear masonry spandrel mechanisms.",
    ];
    const mechanicalState =
      resolvedAlignmentState ??
      resolveAlignmentMechanicalState({
        alignment,
        stage,
        options: options.materialResolution ?? options,
      });
    const resolvedAlignment = mechanicalState.alignment;

    const resolvedSanitizedOpenings =
      sanitizedOpenings ??
      sanitizeAlignmentOpenings({ alignment: resolvedAlignment }).openings;
    const extracted =
      extractedMembers ??
      extractEquivalentFrameMembers({
        alignment: resolvedAlignment,
        sanitizedOpenings: resolvedSanitizedOpenings,
      });

    if (!includeSpandrels && extracted.spandrels.length > 0) {
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
    const spandrelFrames = includeSpandrels
      ? extracted.spandrels
          .map((spandrel) =>
            buildSpandrelFrameMember({
              alignment: resolvedAlignment,
              spandrel,
              pierFrames,
              warnings,
            }),
          )
          .filter(Boolean)
      : [];
    const ringFrameFrames = includeRingFrames
      ? buildRingFrameMembers({
          alignment: resolvedAlignment,
          openings: resolvedSanitizedOpenings,
          warnings,
        })
      : [];

    if (
      !includeRingFrames &&
      resolvedSanitizedOpenings.some((opening) => opening.ringFrame)
    ) {
      warnings.push(
        "The equivalent-frame builder found ringFrame definitions, but includeRingFrames is disabled and they were skipped in the FEM assembly.",
      );
    }

    const nodes = pierFrames.flatMap((frame) => frame.nodes);
    nodes.push(...ringFrameFrames.flatMap((frame) => frame.nodes));
    const elements = [
      ...pierFrames.map((frame) => frame.element),
      ...spandrelFrames.map((frame) => frame.element),
      ...ringFrameFrames.flatMap((frame) => frame.elements),
    ];
    const supports = [
      ...pierFrames.flatMap((frame) => frame.supports),
      ...ringFrameFrames.flatMap((frame) => frame.supports),
    ];
    const constraints = [];
    const loads = [];
    let diaphragmControlNode = null;
    const pierTopNodes = pierFrames
      .map((frame) => frame.nodes.find((node) => node.id === frame.snapshot.topNodeId))
      .filter(Boolean);
    const ringFrameTopNodes = ringFrameFrames.flatMap((frame) => frame.topNodes);
    const diaphragmNodes = [...pierTopNodes, ...ringFrameTopNodes];

    if (includeDiaphragm && diaphragmNodes.length > 0) {
      diaphragmControlNode = createDiaphragmControlNode({
        alignment: resolvedAlignment,
        topNodes: diaphragmNodes,
      });
      nodes.push(diaphragmControlNode);
      supports.push(
        new Support({
          id: `${resolvedAlignment.id}-diaphragm-guide`,
          node: diaphragmControlNode,
          restraints: { uy: true, rz: true },
          metadata: {
            role: "diaphragm-guide",
            sourceAlignmentId: resolvedAlignment.id,
          },
        }),
      );
      constraints.push(
        ...diaphragmNodes.map((node, index) => ({
          id: `${resolvedAlignment.id}-diaphragm-ux-link-${index + 1}`,
          type: "equal-dof",
          masterNodeId: diaphragmControlNode.id,
          slaveNodeId: node.id,
          dof: "ux",
          scale: 1,
          offset: 0,
          metadata: {
            role: "top-diaphragm-ux",
            sourceAlignmentId: resolvedAlignment.id,
          },
        })),
      );
      assumptions.push(
        "When includeDiaphragm is enabled, the builder creates a master diaphragm control node and ties the horizontal ux DOF of each pier top node and steel ring-frame top node to that master through equal-DOF constraints; vertical translations and rotations remain local.",
      );
    }

    if (spandrelFrames.length > 0) {
      assumptions.push(
        "Each explicit spandrel connects the top nodes of the two adjacent piers; the deformable portion is the opening width, while the distances from pier axes to opening edges are represented as rigid end offsets.",
      );
    }

    if (ringFrameFrames.length > 0) {
      assumptions.push(
        "Each steel ring frame declared on an opening is assembled into the global FEM model with its own jamb and architrave elements; multiple identical parallel frames are condensed into one equivalent steel frame by scaling stiffness and plastic moments.",
      );
    }

    const frameType =
      ringFrameFrames.length > 0
        ? spandrelFrames.length > 0
          ? "pier-spandrel-ring-frame"
          : "pier-ring-frame"
        : spandrelFrames.length > 0
          ? "pier-spandrel"
          : "pier-only";
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
      spandrelFrames: spandrelFrames.map((frame) => frame.snapshot),
      ringFrameFrames: ringFrameFrames.map((frame) => frame.snapshot),
      dofRegistry,
      snapshot: {
        id: `${resolvedAlignment.id}-equivalent-frame`,
        units: FEM_UNITS,
        ...serializeFrame(nodes, elements, supports, constraints, loads),
        metadata: {
          sourceAlignmentId: resolvedAlignment.id,
          stage,
          topRotation,
          includeSpandrels,
          includeRingFrames,
          includeDiaphragm,
          frameType,
          pierCount: pierFrames.length,
          spandrelCount: spandrelFrames.length,
          ringFrameCount: ringFrameFrames.length,
          ringFramePhysicalCount: ringFrameFrames.reduce(
            (sum, frame) => sum + (frame.snapshot.frameCount ?? 1),
            0,
          ),
          ringFrameOpeningCount: new Set(
            ringFrameFrames.map((frame) => frame.snapshot.openingId),
          ).size,
          ignoredSpandrelCount: extracted.spandrels.length - spandrelFrames.length,
          topNodeIds: pierFrames.map((frame) => frame.snapshot.topNodeId),
          pierTopNodeIds: pierTopNodes.map((node) => node.id),
          ringFrameTopNodeIds: ringFrameTopNodes.map((node) => node.id),
          diaphragmNodeIds: diaphragmNodes.map((node) => node.id),
          diaphragmControlNodeId: diaphragmControlNode?.id ?? null,
        },
      },
      warnings: [
        ...warnings,
        ...ringFrameFrames.flatMap((frame) => frame.warnings ?? []),
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
