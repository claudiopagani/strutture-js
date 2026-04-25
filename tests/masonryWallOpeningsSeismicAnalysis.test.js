import test from "node:test";
import assert from "node:assert/strict";

import {
  AlignmentSeismicAggregatedAnalysis,
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
  bilinearizeCapacityCurve,
} from "../src/index.js";

const units = { force: "N", length: "m" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createPlainMasonryMaterial() {
  return {
    fm: 6e6,
    tau0: 1e5,
    fv0: 2e5,
    E: 1.8e9,
    G: 6e8,
    density: 18000,
    units,
  };
}

function createSeismicAlignment(overrides = {}) {
  return new MasonryWallOpeningsModel({
    id: "alignment-seismic-base",
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
    ...overrides,
  });
}

test("capacity-curve bilinearization follows the 70% secant and 20% drop rules", () => {
  const bilinearization = bilinearizeCapacityCurve({
    points: [
      { displacement: 0, baseShear: 0 },
      { displacement: 1, baseShear: 10 },
      { displacement: 3, baseShear: 10 },
      { displacement: 4, baseShear: 8 },
      { displacement: 4.1, baseShear: 0 },
    ],
  });

  assert.equal(bilinearization.status, "ok");
  approx(bilinearization.ks, 10);
  approx(bilinearization.du, 4);
  approx(bilinearization.Vy, 9.668498, 1e-6);
  approx(bilinearization.yieldDisplacement, 0.96685, 1e-6);
});

test("aggregated seismic analysis builds a masonry-only capacity curve with bilinearization outputs", () => {
  const alignment = createSeismicAlignment();
  const result = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment,
    stage: "design",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.verticalCombinationType, "SEISMIC");
  assert.equal(result.outputs.piers.length, 2);
  assert.ok(result.outputs.capacityCurve.points.length >= 4);
  assert.ok(result.outputs.capacityCurve.maxBaseShear > 0);
  assert.ok(result.outputs.bilinearization.ks > 0);
  assert.ok(result.outputs.bilinearization.Vy > 0);
  assert.ok(result.outputs.bilinearization.du > 0);
  approx(
    result.outputs.capacityCurve.maxBaseShear,
    result.outputs.piers.reduce((sum, pier) => sum + pier.peakBaseShear, 0),
    1e-5,
  );
});

test("aggregated seismic analysis reacts to the requested topRotation boundary condition", () => {
  const alignment = createSeismicAlignment();
  const freeTopResult = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment,
    options: {
      topRotation: "free",
    },
  });
  const fixedTopResult = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment,
    options: {
      topRotation: "fixed",
    },
  });

  assert.equal(freeTopResult.outputs.topRotation, "free");
  assert.equal(fixedTopResult.outputs.topRotation, "fixed");
  assert.ok(
    fixedTopResult.outputs.capacityCurve.maxBaseShear >
      freeTopResult.outputs.capacityCurve.maxBaseShear,
  );
});

test("aggregated seismic analysis adds the steel ring-frame pushover contribution when it is fully defined", () => {
  const masonryOnlyAlignment = createSeismicAlignment();
  const ringFrameAlignment = createSeismicAlignment({
    id: "alignment-seismic-ring-frame",
    openings: [
      {
        id: "window-a",
        x: 2,
        y: 1,
        width: 1,
        height: 1,
        ringFrame: {
          profileWidthInPlane: 0.08,
          memberSections: {
            columns: "IPE200",
            topBeam: "IPE200",
            bottomBeam: "UPN200",
          },
          includeBottomBeam: true,
          topBeamOrientation: "weak-axis-in-plane",
          materialGrade: "S275",
          solver: {
            maxDisplacement: 0.02,
            controlIncrement: 0.002,
            maxSteps: 20,
            maxIterations: 40,
          },
        },
      },
    ],
  });
  const masonryOnlyResult = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment: masonryOnlyAlignment,
  });
  const ringFrameResult = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment: ringFrameAlignment,
  });

  assert.equal(ringFrameResult.outputs.ringFrames.length, 1);
  assert.equal(ringFrameResult.outputs.ringFrames[0].status, "ok");
  assert.equal(
    ringFrameResult.outputs.ringFrames[0].metadata.memberOrientations.topBeam.axis,
    "z",
  );
  assert.equal(
    ringFrameResult.outputs.ringFrames[0].metadata.memberOrientations.bottomBeam.label,
    "upn-open-side-up",
  );
  assert.ok(
    ringFrameResult.outputs.capacityCurve.maxBaseShear >
      masonryOnlyResult.outputs.capacityCurve.maxBaseShear,
  );
});

test("aggregated seismic analysis includes the ring frame in global stiffness and strength metrics", () => {
  const masonryOnlyResult = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment: createSeismicAlignment({
      id: "alignment-seismic-ring-frame-metric-baseline",
    }),
  });
  const ringFrameResult = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment: createSeismicAlignment({
      id: "alignment-seismic-ring-frame-metrics",
      openings: [
        {
          id: "window-a",
          x: 2,
          y: 1,
          width: 1,
          height: 1,
          ringFrame: {
            memberSections: {
              columns: "HEA200",
              topBeam: "HEA200",
            },
            material: "S275",
            baseCondition: "fixed-base",
          },
        },
      ],
    }),
  });

  assert.equal(ringFrameResult.metadata.ringFrameCount, 1);
  assert.equal(
    ringFrameResult.metadata.contributorCount,
    masonryOnlyResult.metadata.contributorCount + 1,
  );
  assert.equal(ringFrameResult.outputs.ringFrames.length, 1);
  assert.equal(ringFrameResult.outputs.ringFrames[0].status, "ok");
  assert.ok(ringFrameResult.outputs.ringFrames[0].maxBaseShear > 0);
  assert.ok(ringFrameResult.outputs.ringFrames[0].curvePoints.length > 1);
  assert.ok(
    ringFrameResult.outputs.bilinearization.ks >
      masonryOnlyResult.outputs.bilinearization.ks,
  );
  assert.ok(
    ringFrameResult.outputs.bilinearization.Vy >
      masonryOnlyResult.outputs.bilinearization.Vy,
  );
  assert.ok(
    ringFrameResult.outputs.capacityCurve.maxBaseShear >
      masonryOnlyResult.outputs.capacityCurve.maxBaseShear,
  );
});

test("masonry wall openings application exposes seismic-aggregated-design as a successful workflow", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    id: "alignment-seismic-app",
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
    mode: "seismic-aggregated-design",
  });

  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.piers.length, 2);
  assert.equal(result.outputs.topRotation, "free");
});
