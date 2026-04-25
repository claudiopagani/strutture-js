import test from "node:test";
import assert from "node:assert/strict";

import {
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
  sanitizeAlignmentOpenings,
} from "../src/index.js";

const units = { force: "N", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("sanitizeAlignmentOpenings discards outside openings and clips border openings", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-border",
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
        id: "outside",
        x: 6,
        y: 1,
        width: 1,
        height: 1,
      },
      {
        id: "border",
        x: -0.2,
        y: -0.1,
        width: 1,
        height: 1.5,
      },
    ],
  });
  const result = sanitizeAlignmentOpenings({ alignment });

  assert.deepEqual(result.discardedOpeningIds, ["outside"]);
  assert.equal(result.openings.length, 1);
  assert.equal(result.openings[0].id, "border");
  approx(result.openings[0].x, 0);
  approx(result.openings[0].y, 0);
  approx(result.openings[0].width, 0.8);
  approx(result.openings[0].height, 1.4);
});

test("sanitizeAlignmentOpenings merges intersecting and vertically stacked openings", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-merge",
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
        id: "left",
        x: 1,
        y: 0.5,
        width: 1,
        height: 0.6,
      },
      {
        id: "right",
        x: 1.8,
        y: 0.7,
        width: 1,
        height: 1,
      },
      {
        id: "stacked-top",
        x: 1.1,
        y: 1.7,
        width: 0.8,
        height: 0.5,
      },
    ],
  });
  const result = sanitizeAlignmentOpenings({ alignment });

  assert.equal(result.openings.length, 1);
  approx(result.openings[0].x, 1);
  approx(result.openings[0].y, 0.5);
  approx(result.openings[0].width, 1.8);
  approx(result.openings[0].height, 1.7);
  assert.deepEqual(result.openings[0].sourceOpeningIds, [
    "left",
    "right",
    "stacked-top",
  ]);
  assert.ok(
    result.warnings.some((warning) => warning.includes("vertically stacked")),
  );
});

test("sanitizeAlignmentOpenings recombines clipped fragments across a wall joint when the union stays rectangular", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-joint",
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
        id: "cross-joint",
        x: 2,
        y: 1,
        width: 1,
        height: 1,
      },
    ],
  });
  const result = sanitizeAlignmentOpenings({ alignment });

  assert.equal(result.openings.length, 1);
  approx(result.openings[0].x, 2);
  approx(result.openings[0].width, 1);
  assert.deepEqual(result.openings[0].wallIds, ["wall-a", "wall-b"]);
});

test("sanitizeAlignmentOpenings emits warnings for residual lateral piers below threshold", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-residual",
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
        id: "near-edge",
        x: 0.3,
        y: 0.8,
        width: 1.2,
        height: 1.1,
      },
    ],
  });
  const result = sanitizeAlignmentOpenings({ alignment });

  assert.ok(
    result.warnings.some(
      (warning) =>
        warning.includes("residual lateral pier") && warning.includes("0.300"),
    ),
  );
});

test("masonry wall openings model converts residual pier warning threshold", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-residual-units",
    units: { force: "N", length: "mm" },
    walls: [
      {
        id: "wall-a",
        length: 5000,
        height: 3000,
        thickness: 300,
      },
    ],
    settings: {
      residualPierWarningThreshold: 500,
    },
  });

  approx(alignment.settings.residualPierWarningThreshold, 0.5);
});

test("masonry wall openings application exposes sanitize-only as a successful workflow", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    id: "alignment-app",
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
        width: 1.2,
        height: 1,
      },
    ],
    mode: "sanitize-only",
  });

  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.sanitizedOpenings.length, 1);
  assert.equal(result.metadata.mode, "sanitize-only");
});
