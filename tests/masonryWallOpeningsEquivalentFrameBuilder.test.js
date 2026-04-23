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

function createEquivalentFrameAlignment(id = "alignment-equivalent-frame") {
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
