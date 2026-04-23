import test from "node:test";
import assert from "node:assert/strict";

import {
  AlignmentStaticAnalysis,
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
  createSteelProfileSection,
  createNTC2018StructuralSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "m" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createPlainMasonryMaterial() {
  return {
    fm: 6e6,
    E: 1.8e9,
    G: 6e8,
    density: 18000,
    units,
  };
}

test("static analysis distributes tributary top loads and opening-band loads to masonry piers with global equilibrium", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-static-basic",
    units,
    walls: [
      {
        id: "wall-a",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: createPlainMasonryMaterial(),
        verticalLineLoad: {
          G1: 20000,
          G2: 5000,
          Qk: 3000,
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
  const result = new AlignmentStaticAnalysis().analyze({
    alignment,
    stage: "design",
  });
  const piers = result.outputs.piers;
  const leftPier = piers[0];
  const rightPier = piers[1];

  assert.equal(result.status, "ok");
  assert.equal(piers.length, 2);
  approx(result.outputs.wallLineLoads["wall-a"].value, 38000);
  approx(leftPier.topDistributedLoad, 95000);
  approx(rightPier.topDistributedLoad, 95000);
  approx(leftPier.transferredOpeningLoad, 2700);
  approx(rightPier.transferredOpeningLoad, 2700);
  approx(result.outputs.equilibrium.appliedTopLineLoad, 190000);
  approx(result.outputs.equilibrium.openingBandLoad, 5400);
  approx(result.outputs.equilibrium.baseReaction, 260200);
  approx(result.outputs.equilibrium.difference, 0);
  assert.equal(result.outputs.equilibrium.ok, true);
});

test("static analysis sends ring-frame opening loads to the frame jamb reactions instead of pier tributary half-widths", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-static-ring-frame",
    units,
    walls: [
      {
        id: "wall-a",
        length: 4,
        height: 3,
        thickness: 0.3,
        material: createPlainMasonryMaterial(),
        verticalLineLoad: {
          G1: 10000,
        },
      },
    ],
    openings: [
      {
        id: "opening-a",
        x: 1.5,
        y: 1,
        width: 1,
        height: 1,
        ringFrame: {
          profileWidthInPlane: 0.08,
        },
      },
    ],
  });
  const result = new AlignmentStaticAnalysis().analyze({
    alignment,
    stage: "design",
  });
  const leftPier = result.outputs.piers[0];
  const rightPier = result.outputs.piers[1];
  const ringFrame = result.outputs.ringFrames[0];

  assert.equal(result.outputs.ringFrames.length, 1);
  approx(leftPier.topDistributedLoad, 19500);
  approx(rightPier.topDistributedLoad, 19500);
  approx(ringFrame.topLoad, 13000);
  approx(ringFrame.openingBandLoad, 5400);
  approx(ringFrame.leftReaction, 9200);
  approx(ringFrame.rightReaction, 9200);
  approx(result.outputs.equilibrium.difference, 0);
});

test("static analysis can run an explicit lintel beam analysis when the lintel section is provided", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-static-lintel",
    units,
    walls: [
      {
        id: "wall-a",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: createPlainMasonryMaterial(),
        verticalLineLoad: {
          G1: 15000,
        },
      },
    ],
    openings: [
      {
        id: "opening-a",
        x: 2,
        y: 1,
        width: 1,
        height: 1,
        lintel: {
          bearingLength: 0.3,
          section: createSteelProfileSection({
            profileName: "IPE200",
            units,
          }),
          material: createNTC2018StructuralSteelMaterial({
            grade: "S275",
            units,
          }),
        },
      },
    ],
  });
  const result = new AlignmentStaticAnalysis().analyze({
    alignment,
    stage: "design",
  });
  const lintel = result.outputs.lintels[0];

  assert.equal(result.outputs.lintels.length, 1);
  assert.equal(lintel.status, "ok");
  assert.ok(lintel.analysis.maxAbsBendingMoment > 0);
  assert.ok(lintel.analysis.maxAbsShearForce > 0);
  assert.ok(lintel.verification);
});

test("masonry wall openings application exposes static-design as a successful workflow", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    id: "alignment-static-app",
    units,
    walls: [
      {
        id: "wall-a",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: createPlainMasonryMaterial(),
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
    mode: "static-design",
  });

  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.piers.length, 2);
  assert.equal(result.metadata.stage, "design");
});
