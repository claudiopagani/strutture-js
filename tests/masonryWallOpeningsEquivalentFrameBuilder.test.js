import test from "node:test";
import assert from "node:assert/strict";

import {
  MasonryEquivalentFrameBuilder,
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
} from "../src/index.js";

const units = { force: "N", length: "m" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createEquivalentFrameAlignment(
  id = "alignment-equivalent-frame",
  openingOverrides = {},
) {
  return new MasonryWallOpeningsModel({
    id,
    units,
    walls: [
      {
        id: "wall-a",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: {
          fm: 6e6,
          tau0: 1e5,
          fv0: 2e5,
          E: 1.8e9,
          G: 6e8,
          density: 18000,
          units,
        },
        verticalLineLoad: {
          G1: 20000,
        },
      },
    ],
    openings: [
      {
        id: "window-a",
        x: 2,
        y: 1,
        width: 1,
        height: 1,
        ...openingOverrides,
      },
    ],
  });
}

test("equivalent frame builder assembles a pier-only free-top frame with one element per pier", () => {
  const alignment = createEquivalentFrameAlignment("alignment-equivalent-frame-free");
  const frame = new MasonryEquivalentFrameBuilder().build({
    alignment,
    options: {
      topRotation: "free",
    },
  });

  assert.equal(frame.topRotation, "free");
  assert.equal(frame.snapshot.metadata.frameType, "pier-only");
  assert.equal(frame.snapshot.metadata.pierCount, 2);
  assert.equal(frame.snapshot.nodes.length, 4);
  assert.equal(frame.snapshot.elements.length, 2);
  assert.equal(frame.snapshot.supports.length, 2);
  assert.equal(frame.snapshot.constraints.length, 0);
  assert.equal(frame.snapshot.elements[0].type, "frame-2d-timoshenko-rigid-offsets");
  approx(frame.snapshot.nodes[0].x, 1);
  approx(frame.snapshot.nodes[2].x, 4);
  assert.ok(
    frame.warnings.some((warning) =>
      warning.includes("spandrel candidate"),
    ),
  );
});

test("equivalent frame builder restrains top rotations when requested", () => {
  const alignment = createEquivalentFrameAlignment("alignment-equivalent-frame-fixed");
  const frame = new MasonryEquivalentFrameBuilder().build({
    alignment,
    options: {
      topRotation: "fixed",
    },
  });
  const topSupports = frame.snapshot.supports.filter((support) =>
    support.id.endsWith("-top-rot-fix"),
  );

  assert.equal(frame.topRotation, "fixed");
  assert.equal(frame.snapshot.supports.length, 4);
  assert.equal(topSupports.length, 2);
  assert.ok(topSupports.every((support) => support.restraints.rz));
  assert.ok(topSupports.every((support) => !support.restraints.ux));
  assert.ok(topSupports.every((support) => !support.restraints.uy));
});

test("equivalent frame builder assembles explicit linear spandrels between adjacent pier heads", () => {
  const alignment = createEquivalentFrameAlignment("alignment-equivalent-frame-spandrels");
  const frame = new MasonryEquivalentFrameBuilder().build({
    alignment,
    options: {
      topRotation: "free",
      includeSpandrels: true,
    },
  });
  const spandrelElements = frame.snapshot.elements.filter(
    (element) => element.metadata.role === "spandrel",
  );

  assert.equal(frame.snapshot.metadata.frameType, "pier-spandrel");
  assert.equal(frame.snapshot.metadata.includeSpandrels, true);
  assert.equal(frame.snapshot.metadata.pierCount, 2);
  assert.equal(frame.snapshot.metadata.spandrelCount, 1);
  assert.equal(frame.snapshot.metadata.ignoredSpandrelCount, 0);
  assert.equal(frame.snapshot.nodes.length, 4);
  assert.equal(frame.snapshot.elements.length, 3);
  assert.equal(frame.spandrelFrames.length, 1);
  assert.equal(spandrelElements.length, 1);
  assert.equal(spandrelElements[0].metadata.referenceOpeningId, "window-a");
  approx(spandrelElements[0].length, 3);
  approx(spandrelElements[0].deformableLength, 1);
  approx(spandrelElements[0].rigidStartOffset, 1);
  approx(spandrelElements[0].rigidEndOffset, 1);
  approx(spandrelElements[0].referenceStartNode.x, 2);
  approx(spandrelElements[0].referenceStartNode.y, 2.5);
  approx(spandrelElements[0].referenceEndNode.x, 3);
  approx(spandrelElements[0].referenceEndNode.y, 2.5);
  approx(spandrelElements[0].metadata.deformableAxisY, 2.5);
  assert.ok(
    !frame.warnings.some((warning) =>
      warning.includes("intentionally ignored"),
    ),
  );
});

test("masonry wall openings application exposes equivalent-frame-linear as a successful workflow", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    mode: "equivalent-frame-linear",
    model: createEquivalentFrameAlignment("alignment-equivalent-frame-app"),
  });

  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.topRotation, "free");
  assert.equal(result.outputs.equivalentFrame.metadata.frameType, "pier-only");
  assert.equal(result.outputs.equivalentFrame.elements.length, 2);
  assert.equal(result.outputs.piers.length, 2);
});

test("equivalent frame builder can assemble a diaphragm master node with equal-DOF top constraints", () => {
  const alignment = createEquivalentFrameAlignment("alignment-equivalent-frame-diaphragm");
  const frame = new MasonryEquivalentFrameBuilder().build({
    alignment,
    options: {
      topRotation: "free",
      includeDiaphragm: true,
    },
  });

  assert.equal(
    frame.snapshot.metadata.diaphragmControlNodeId,
    "alignment-equivalent-frame-diaphragm-diaphragm-control",
  );
  assert.equal(frame.snapshot.constraints.length, 2);
  assert.ok(frame.snapshot.constraints.every((constraint) => constraint.type === "equal-dof"));
  assert.ok(
    frame.snapshot.supports.some((support) => support.id.endsWith("diaphragm-guide")),
  );
});

test("equivalent frame builder assembles steel ring frames and ties their top nodes to the diaphragm", () => {
  const alignment = createEquivalentFrameAlignment(
    "alignment-equivalent-frame-ring-frame",
    {
      ringFrame: {
        memberSections: {
          columns: "IPE200",
          topBeam: "IPE200",
        },
        material: "S275",
        baseCondition: "fixed-base",
      },
    },
  );
  const frame = new MasonryEquivalentFrameBuilder().build({
    alignment,
    options: {
      topRotation: "free",
      includeDiaphragm: true,
    },
  });
  const ringFrame = frame.ringFrameFrames[0];
  const ringFrameElements = frame.snapshot.elements.filter(
    (element) => element.metadata.sourceOpeningId === "window-a",
  );

  assert.equal(frame.snapshot.metadata.frameType, "pier-ring-frame");
  assert.equal(frame.snapshot.metadata.ringFrameCount, 1);
  assert.equal(frame.snapshot.metadata.ringFrameOpeningCount, 1);
  assert.equal(frame.snapshot.metadata.pierTopNodeIds.length, 2);
  assert.equal(frame.snapshot.metadata.ringFrameTopNodeIds.length, 2);
  assert.equal(frame.snapshot.constraints.length, 4);
  assert.equal(frame.snapshot.nodes.length, 9);
  assert.equal(frame.snapshot.elements.length, 5);
  assert.equal(frame.snapshot.supports.length, 5);
  assert.equal(ringFrame.openingId, "window-a");
  assert.deepEqual(ringFrame.topNodeIds, [
    "alignment-equivalent-frame-ring-frame-ring-frame-window-a-tl",
    "alignment-equivalent-frame-ring-frame-ring-frame-window-a-tr",
  ]);
  assert.ok(
    ringFrame.topNodeIds.every((nodeId) =>
      frame.snapshot.metadata.diaphragmNodeIds.includes(nodeId),
    ),
  );
  assert.ok(
    ringFrame.topNodeIds.every((nodeId) =>
      frame.snapshot.constraints.some((constraint) => constraint.slaveNodeId === nodeId),
    ),
  );
  assert.equal(ringFrameElements.length, 3);
  assert.ok(
    ringFrameElements.every(
      (element) => element.type === "steel-frame-2d-plastic-hinge",
    ),
  );
});

test("equivalent frame builder condenses parallel steel ring frames into one scaled frame", () => {
  const singleFrame = new MasonryEquivalentFrameBuilder().build({
    alignment: createEquivalentFrameAlignment(
      "alignment-equivalent-frame-ring-single",
      {
        ringFrame: {
          memberSections: {
            columns: "IPE200",
            topBeam: "IPE200",
          },
          material: "S275",
          baseCondition: "fixed-base",
        },
      },
    ),
  });
  const parallelFrame = new MasonryEquivalentFrameBuilder().build({
    alignment: createEquivalentFrameAlignment(
      "alignment-equivalent-frame-ring-parallel",
      {
        ringFrame: {
          frameCount: 2,
          memberSections: {
            columns: "IPE200",
            topBeam: "IPE200",
          },
          material: "S275",
          baseCondition: "fixed-base",
        },
      },
    ),
  });
  const singleColumn = singleFrame.snapshot.elements.find((element) =>
    element.id.endsWith("left-column"),
  );
  const parallelColumn = parallelFrame.snapshot.elements.find((element) =>
    element.id.endsWith("left-column"),
  );

  assert.equal(parallelFrame.ringFrameFrames.length, 1);
  assert.equal(parallelFrame.ringFrameFrames[0].equivalentParallelFrames, 2);
  assert.equal(parallelFrame.snapshot.elements.length, singleFrame.snapshot.elements.length);
  assert.equal(parallelColumn.metadata.equivalentParallelFrames, 2);
  approx(parallelColumn.axialRigidity, singleColumn.axialRigidity * 2);
  approx(parallelColumn.flexuralRigidity, singleColumn.flexuralRigidity * 2);
  approx(parallelColumn.plasticMomentStart, singleColumn.plasticMomentStart * 2);
});

test("equivalent frame builder propagates ring-frame member orientation overrides", () => {
  const frame = new MasonryEquivalentFrameBuilder().build({
    alignment: createEquivalentFrameAlignment(
      "alignment-equivalent-frame-ring-orientation",
      {
        ringFrame: {
          memberSections: {
            columns: "HEA200",
            topBeam: "HEA200",
          },
          topBeamOrientation: "weak-axis-in-plane",
          material: "S275",
          baseCondition: "fixed-base",
        },
      },
    ),
  });
  const topBeam = frame.snapshot.elements.find((element) =>
    element.id.endsWith("top-beam"),
  );

  assert.equal(topBeam.sectionOrientation.axis, "z");
  assert.equal(topBeam.metadata.sectionOrientation.axis, "z");
});
