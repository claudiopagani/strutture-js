import { DofRegistry } from "../../../domain/fem/DofRegistry.js";
import { Node } from "../../../domain/geometry/Node.js";
import { Support } from "../../../domain/supports/Support.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { SteelRingFramePushoverModel } from "../models/SteelRingFramePushoverModel.js";
import { SteelPlasticHingeFrameElement2D } from "./SteelPlasticHingeFrameElement2D.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function resolveModel(input) {
  return input instanceof SteelRingFramePushoverModel
    ? input
    : new SteelRingFramePushoverModel(input);
}

function serializeFrame(nodes, elements, supports) {
  return {
    nodes: nodes.map((node) => node.toJSON()),
    elements: elements.map((element) => element.toJSON()),
    supports: supports.map((support) => support.toJSON()),
  };
}

export class SteelRingFrame2DBuilder {
  build({ model } = {}) {
    const resolvedModel = resolveModel(model ?? {});
    const assumptions = [
      "The ring frame is modeled in 2D with Euler-Bernoulli frame members and three nodal DOFs per node: ux, uy, rz.",
      "Plasticity is concentrated at member ends; members remain elastic between hinges and no geometric non-linearity is included in the first MVP.",
      "The horizontal pushover load pattern is split equally between the two top nodes.",
    ];
    const warnings = [];
    const toFem = createUnitResolver(resolvedModel.units, FEM_UNITS);
    const {
      clearWidth,
      clearHeight,
      originX,
      originY,
    } = resolvedModel.geometry;
    const nodeUnits = FEM_UNITS;
    const bottomLeftNode = new Node({
      id: `${resolvedModel.id}-bl`,
      x: toFem.length(originX),
      y: toFem.length(originY),
      units: nodeUnits,
      metadata: { role: "bottom-left" },
    });
    const topLeftNode = new Node({
      id: `${resolvedModel.id}-tl`,
      x: toFem.length(originX),
      y: toFem.length(originY + clearHeight),
      units: nodeUnits,
      metadata: { role: "top-left" },
    });
    const bottomRightNode = new Node({
      id: `${resolvedModel.id}-br`,
      x: toFem.length(originX + clearWidth),
      y: toFem.length(originY),
      units: nodeUnits,
      metadata: { role: "bottom-right" },
    });
    const topRightNode = new Node({
      id: `${resolvedModel.id}-tr`,
      x: toFem.length(originX + clearWidth),
      y: toFem.length(originY + clearHeight),
      units: nodeUnits,
      metadata: { role: "top-right" },
    });
    const nodes = [bottomLeftNode, topLeftNode, bottomRightNode, topRightNode];
    const elements = [
      new SteelPlasticHingeFrameElement2D({
        id: `${resolvedModel.id}-left-column`,
        startNode: bottomLeftNode,
        endNode: topLeftNode,
        section: resolvedModel.memberSections.leftColumn,
        material: resolvedModel.material,
        sectionOrientation: resolvedModel.memberOrientations.leftColumn,
        metadata: {
          role: "left-column",
          sourceModelId: resolvedModel.id,
          sectionOrientation: { ...resolvedModel.memberOrientations.leftColumn },
        },
      }),
      new SteelPlasticHingeFrameElement2D({
        id: `${resolvedModel.id}-right-column`,
        startNode: bottomRightNode,
        endNode: topRightNode,
        section: resolvedModel.memberSections.rightColumn,
        material: resolvedModel.material,
        sectionOrientation: resolvedModel.memberOrientations.rightColumn,
        metadata: {
          role: "right-column",
          sourceModelId: resolvedModel.id,
          sectionOrientation: { ...resolvedModel.memberOrientations.rightColumn },
        },
      }),
      new SteelPlasticHingeFrameElement2D({
        id: `${resolvedModel.id}-top-beam`,
        startNode: topLeftNode,
        endNode: topRightNode,
        section: resolvedModel.memberSections.topBeam,
        material: resolvedModel.material,
        sectionOrientation: resolvedModel.memberOrientations.topBeam,
        metadata: {
          role: "top-beam",
          sourceModelId: resolvedModel.id,
          sectionOrientation: { ...resolvedModel.memberOrientations.topBeam },
        },
      }),
    ];

    if (resolvedModel.includeBottomBeam) {
      elements.push(
        new SteelPlasticHingeFrameElement2D({
          id: `${resolvedModel.id}-bottom-beam`,
          startNode: bottomLeftNode,
          endNode: bottomRightNode,
          section: resolvedModel.memberSections.bottomBeam,
          material: resolvedModel.material,
          sectionOrientation: resolvedModel.memberOrientations.bottomBeam,
          metadata: {
            role: "bottom-beam",
            sourceModelId: resolvedModel.id,
            sectionOrientation: { ...resolvedModel.memberOrientations.bottomBeam },
          },
        }),
      );
    }

    const fixedRotations = resolvedModel.baseCondition === "fixed-base";
    const supports = [
      new Support({
        id: `${resolvedModel.id}-support-bl`,
        node: bottomLeftNode,
        restraints: { ux: true, uy: true, rz: fixedRotations },
        metadata: { role: "base-left", baseCondition: resolvedModel.baseCondition },
      }),
      new Support({
        id: `${resolvedModel.id}-support-br`,
        node: bottomRightNode,
        restraints: { ux: true, uy: true, rz: fixedRotations },
        metadata: { role: "base-right", baseCondition: resolvedModel.baseCondition },
      }),
    ];

    if (resolvedModel.baseCondition === "fixed-base" && resolvedModel.includeBottomBeam) {
      warnings.push(
        "The bottom beam is included in a fixed-base scenario; in the first-order lateral response its contribution is expected to be marginal because both base joints are fully restrained.",
      );
    }

    const dofRegistry = new DofRegistry();
    dofRegistry.registerNodes(nodes);
    dofRegistry.registerElements(elements);
    dofRegistry.registerNodes(supports.map((support) => support.node));

    const referenceLoadVector = new Array(dofRegistry.size()).fill(0);
    const referenceHorizontalForce = toFem.force(
      resolvedModel.loading.referenceHorizontalForce,
    );
    referenceLoadVector[dofRegistry.getIndex(topLeftNode, "ux")] =
      referenceHorizontalForce / 2;
    referenceLoadVector[dofRegistry.getIndex(topRightNode, "ux")] =
      referenceHorizontalForce / 2;

    const controlNode =
      resolvedModel.loading.controlNode === "top-right"
        ? topRightNode
        : topLeftNode;
    const controlVector = new Array(dofRegistry.size()).fill(0);
    controlVector[dofRegistry.getIndex(controlNode, resolvedModel.loading.controlDof)] = 1;

    return {
      id: `${resolvedModel.id}-frame`,
      model: resolvedModel,
      nodes,
      elements,
      supports,
      dofRegistry,
      referenceLoadVector,
      controlVector,
      controlNode,
      snapshot: {
        id: `${resolvedModel.id}-frame`,
        units: FEM_UNITS,
        ...serializeFrame(nodes, elements, supports),
        metadata: {
          sourceModelId: resolvedModel.id,
          baseCondition: resolvedModel.baseCondition,
          includeBottomBeam: resolvedModel.includeBottomBeam,
          memberOrientations: Object.fromEntries(
            Object.entries(resolvedModel.memberOrientations).map(([key, value]) => [
              key,
              { ...value },
            ]),
          ),
          controlNodeId: controlNode.id,
          controlDof: resolvedModel.loading.controlDof,
          referenceHorizontalForce,
        },
      },
      warnings,
      assumptions,
    };
  }
}
