import test from "node:test";
import assert from "node:assert/strict";

import {
  AlignmentEquivalentFramePushoverAnalysis,
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
} from "../src/index.js";

const units = { force: "N", length: "m" };

function createEquivalentFramePushoverAlignment(
  id = "alignment-equivalent-frame-pushover",
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
          tau0: 4e5,
          fv0: 0,
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

function createShearGovernedAlignment(
  id = "alignment-equivalent-frame-pushover-shear",
) {
  const fm = 6e6;
  const p = 0.35;
  const wallLength = 1.2;
  const thickness = 0.3;
  const axialForce = p * fm * thickness * wallLength;

  return new MasonryWallOpeningsModel({
    id,
    units,
    walls: [
      {
        id: "wall-a",
        length: wallLength,
        height: 3,
        thickness,
        material: {
          fm,
          tau0: 2e4,
          fv0: 0,
          E: 1.8e9,
          G: 6e8,
          density: 0,
          units,
        },
        verticalLineLoad: {
          G1: axialForce / wallLength,
        },
      },
    ],
  });
}

test("equivalent-frame pushover assembles a global FEM curve from the validated pier responses", () => {
  const alignment = createEquivalentFramePushoverAlignment();
  const result = new AlignmentEquivalentFramePushoverAnalysis().analyze({
    alignment,
    options: {
      topRotation: "free",
      controlPointCount: 80,
    },
  });
  const ksMetric = result.outputs.comparison.metrics.find(
    (metric) => metric.id === "ks",
  );
  const vyMetric = result.outputs.comparison.metrics.find(
    (metric) => metric.id === "Vy",
  );
  const duMetric = result.outputs.comparison.metrics.find(
    (metric) => metric.id === "du",
  );

  assert.equal(result.status, "ok");
  assert.equal(result.metadata.analysisType, "equivalent-frame-pushover");
  assert.equal(result.outputs.controlModel.strategy, "direct-global-frame-pushover");
  assert.equal(result.outputs.controlModel.explicitDiaphragmConstraint, true);
  assert.equal(
    result.outputs.controlModel.controlNodeId,
    "alignment-equivalent-frame-pushover-diaphragm-control",
  );
  assert.equal(result.outputs.equivalentFrame.metadata.frameType, "pier-only");
  assert.equal(
    result.outputs.equivalentFrame.metadata.diaphragmControlNodeId,
    "alignment-equivalent-frame-pushover-diaphragm-control",
  );
  assert.ok(result.outputs.fem.masonryFrame != null);
  assert.equal(result.outputs.fem.piers.length, 2);
  assert.ok(
    result.outputs.fem.piers.every(
      (pier) => pier.sourceModel === "direct-global-frame-pushover",
    ),
  );
  assert.ok(result.outputs.fem.capacityCurve.points.length > 20);
  assert.ok(result.outputs.fem.hingeEvents.length >= 1);
  assert.ok(result.outputs.aggregated.performanceSummary.ks > 0);
  assert.ok(result.outputs.fem.performanceSummary.ks > 0);
  assert.ok(result.outputs.comparison.sampledCurvePoints.length >= 5);
  assert.ok(
    result.outputs.reading.outcome === "consistent" ||
      result.outputs.reading.outcome === "attention",
  );
  assert.ok(Math.abs(ksMetric.variationPercent) < 10);
  assert.ok(Math.abs(vyMetric.variationPercent) < 10);
  assert.ok(Math.abs(duMetric.variationPercent) < 10);
});

test("masonry wall openings application exposes equivalent-frame-pushover as a successful workflow", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    mode: "equivalent-frame-pushover",
    model: createEquivalentFramePushoverAlignment("alignment-equivalent-frame-pushover-app"),
  });

  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.status, "ok");
  assert.equal(result.metadata.mode, "equivalent-frame-pushover");
  assert.equal(result.outputs.equivalentFrame.metadata.frameType, "pier-only");
  assert.equal(result.outputs.fem.piers.length, 2);
  assert.ok(result.outputs.fem.capacityCurve.points.length > 20);
});

test("equivalent-frame pushover keeps shear-governed masonry piers on the direct global frame path", () => {
  const alignment = createShearGovernedAlignment();
  const result = new AlignmentEquivalentFramePushoverAnalysis().analyze({
    alignment,
    options: {
      topRotation: "free",
      controlPointCount: 80,
      shearDriftCapacity: 0.006,
    },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.controlModel.strategy, "direct-global-frame-pushover");
  assert.equal(result.outputs.fem.piers.length, 1);
  assert.equal(result.outputs.fem.piers[0].governingFamily, "shear");
  assert.equal(result.outputs.fem.piers[0].sourceModel, "direct-global-frame-pushover");
  assert.equal(
    result.outputs.fem.piers[0].performanceSummary.mechanismModel,
    "equivalent-frame-hinges-and-shear-plateau",
  );
  assert.equal(result.metadata.fallbackPierCount, 0);
  assert.ok(result.outputs.fem.hingeEvents.length >= 1);
});
