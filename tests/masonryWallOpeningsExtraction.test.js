import test from "node:test";
import assert from "node:assert/strict";

import {
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
  extractEquivalentFrameMembers,
  sanitizeAlignmentOpenings,
} from "../src/index.js";

const units = { force: "N", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("extractEquivalentFrameMembers returns two piers and one spandrel for a single window", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-basic",
    units,
    walls: [
      {
        id: "wall-a",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: { name: "muratura-a" },
      },
    ],
    openings: [
      {
        id: "window-a",
        x: 1.2,
        y: 1,
        width: 1.4,
        height: 1,
      },
    ],
  });
  const extraction = extractEquivalentFrameMembers({
    alignment,
    sanitizedOpenings: sanitizeAlignmentOpenings({ alignment }).openings,
  });

  assert.equal(extraction.piers.length, 2);
  assert.equal(extraction.spandrels.length, 1);
  approx(extraction.piers[0].x, 0);
  approx(extraction.piers[0].length, 1.2);
  approx(extraction.piers[0].height, 3);
  approx(extraction.piers[1].x, 2.6);
  approx(extraction.piers[1].length, 2.4);
  approx(extraction.spandrels[0].xStart, 1.2);
  approx(extraction.spandrels[0].xEnd, 2.6);
  approx(extraction.spandrels[0].height, 1);
  approx(extraction.spandrels[0].deformableLength, 1.4);
});

test("extractEquivalentFrameMembers keeps wall joints as separate piers when no opening crosses them", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-joints",
    units,
    walls: [
      {
        id: "wall-a",
        length: 2,
        height: 3,
        thickness: 0.3,
      },
      {
        id: "wall-b",
        length: 2,
        height: 3,
        thickness: 0.3,
      },
    ],
    openings: [],
  });
  const extraction = extractEquivalentFrameMembers({ alignment, sanitizedOpenings: [] });

  assert.equal(extraction.piers.length, 2);
  assert.deepEqual(
    extraction.piers.map((pier) => pier.wallId),
    ["wall-a", "wall-b"],
  );
  assert.equal(extraction.spandrels.length, 0);
});

test("extractEquivalentFrameMembers does not create an intermediate pier when an opening crosses the wall joint", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-cross-joint",
    units,
    walls: [
      {
        id: "wall-a",
        length: 2.5,
        height: 3,
        thickness: 0.3,
      },
      {
        id: "wall-b",
        length: 2.5,
        height: 3,
        thickness: 0.3,
      },
    ],
    openings: [
      {
        id: "door-a",
        x: 2,
        y: 0,
        width: 1,
        height: 2.1,
      },
    ],
  });
  const extraction = extractEquivalentFrameMembers({
    alignment,
    sanitizedOpenings: sanitizeAlignmentOpenings({ alignment }).openings,
  });

  assert.equal(extraction.piers.length, 2);
  approx(extraction.piers[0].x, 0);
  approx(extraction.piers[0].length, 2);
  approx(extraction.piers[1].x, 3);
  approx(extraction.piers[1].length, 2);
  assert.equal(extraction.spandrels.length, 1);
  assert.deepEqual(extraction.spandrels[0].sourceWallIds, ["wall-a", "wall-b"]);
});

test("extractEquivalentFrameMembers reduces effective pier length by adjacent ring-frame profile widths", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-ring-frame",
    units,
    walls: [
      {
        id: "wall-a",
        length: 4,
        height: 3,
        thickness: 0.3,
      },
    ],
    openings: [
      {
        id: "opening-a",
        x: 1.5,
        y: 0.9,
        width: 1,
        height: 1.1,
        ringFrame: {
          profileWidthInPlane: 0.08,
        },
      },
    ],
  });
  const extraction = extractEquivalentFrameMembers({
    alignment,
    sanitizedOpenings: sanitizeAlignmentOpenings({ alignment }).openings,
  });

  assert.equal(extraction.piers.length, 2);
  approx(extraction.piers[0].length, 1.5);
  approx(extraction.piers[0].effectiveLength, 1.42);
  approx(extraction.piers[1].length, 1.5);
  approx(extraction.piers[1].effectiveLength, 1.42);
});

test("extractEquivalentFrameMembers limits spandrel height to the next overlapping opening above", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-spandrel-limit",
    units,
    walls: [
      {
        id: "wall-a",
        length: 4,
        height: 4,
        thickness: 0.3,
      },
    ],
    openings: [
      {
        id: "lower-opening",
        x: 1,
        y: 0.5,
        width: 1.2,
        height: 0.8,
      },
      {
        id: "upper-opening",
        x: 1.1,
        y: 1.8,
        width: 1,
        height: 0.6,
      },
    ],
  });
  const extraction = extractEquivalentFrameMembers({
    alignment,
    sanitizedOpenings: sanitizeAlignmentOpenings({ alignment }).openings,
  });

  assert.equal(extraction.spandrels.length, 2);
  const lowerSpandrel = extraction.spandrels.find(
    (spandrel) => spandrel.metadata.referenceOpeningId === "lower-opening",
  );

  assert.ok(lowerSpandrel);
  approx(lowerSpandrel.height, 0.5);
});

test("masonry wall openings application exposes extraction mode as a successful workflow", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    id: "alignment-app-extraction",
    units,
    walls: [
      {
        id: "wall-a",
        length: 5,
        height: 3,
        thickness: 0.3,
      },
    ],
    openings: [
      {
        id: "window-a",
        x: 1,
        y: 1,
        width: 1,
        height: 1,
      },
    ],
    mode: "extract-equivalent-frame-members",
  });

  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.piers.length, 2);
  assert.equal(result.outputs.spandrels.length, 1);
  assert.equal(result.metadata.mode, "extract-equivalent-frame-members");
});
