import test from "node:test";
import assert from "node:assert/strict";

import {
  AlignmentStateComparisonAnalysis,
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
} from "../src/index.js";

const units = { force: "N", length: "m" };

function createComparisonAlignment({
  material,
  id = "alignment-state-comparison",
  lineLoad = 20000,
} = {}) {
  return new MasonryWallOpeningsModel({
    id,
    units,
    walls: [
      {
        id: "wall-a",
        length: 5,
        height: 3,
        thickness: 0.3,
        material,
        verticalLineLoad: {
          G1: lineLoad,
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

function createAlignedStageMaterial() {
  return {
    category: "masonry",
    units,
    originalMechanicalProperties: {
      fm: 4.5e6,
      tau0: 8e4,
      fv0: 1.5e5,
      E: 1.6e9,
      G: 5.4e8,
      density: 18000,
    },
    stateOfFactProperties: {
      fm: 4e6,
      tau0: 7e4,
      fv0: 1.2e5,
      E: 1.4e9,
      G: 4.8e8,
      density: 18000,
    },
    improvedMechanicalProperties: {
      fm: 4e6,
      tau0: 7e4,
      fv0: 1.2e5,
      E: 1.4e9,
      G: 4.8e8,
      density: 18000,
    },
  };
}

function createStiffenedDesignMaterial() {
  return {
    category: "masonry",
    units,
    originalMechanicalProperties: {
      fm: 4.5e6,
      tau0: 8e4,
      fv0: 1.5e5,
      E: 1.6e9,
      G: 5.4e8,
      density: 18000,
    },
    stateOfFactProperties: {
      fm: 4e6,
      tau0: 7e4,
      fv0: 1.2e5,
      E: 1.4e9,
      G: 4.8e8,
      density: 18000,
    },
    improvedMechanicalProperties: {
      fm: 4e6,
      tau0: 7e4,
      fv0: 1.2e5,
      E: 2.8e9,
      G: 9.6e8,
      density: 18000,
    },
  };
}

function createStrengthReducingDesignMaterial() {
  return {
    category: "masonry",
    units,
    originalMechanicalProperties: {
      fm: 4.5e6,
      tau0: 8e4,
      fv0: 1.5e5,
      E: 1.6e9,
      G: 5.4e8,
      density: 18000,
    },
    stateOfFactProperties: {
      fm: 6e6,
      tau0: 3e5,
      fv0: 3e5,
      E: 1.8e9,
      G: 6e8,
      density: 18000,
    },
    improvedMechanicalProperties: {
      fm: 6e6,
      tau0: 2e4,
      fv0: 2e4,
      E: 1.8e9,
      G: 6e8,
      density: 18000,
    },
  };
}

test("state comparison returns both seismic stages and passes when ks, Vy and du stay acceptable", () => {
  const alignment = createComparisonAlignment({
    material: createAlignedStageMaterial(),
  });
  const result = new AlignmentStateComparisonAnalysis().analyze({
    alignment,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.stateOfFact.status, "ok");
  assert.equal(result.outputs.design.status, "ok");
  assert.equal(result.outputs.comparison.checks.length, 3);
  assert.ok(result.outputs.comparison.checks.every((check) => check.ok));
  assert.equal(result.outputs.comparison.ks.variationRatio, 0);
  assert.equal(result.outputs.comparison.Vy.delta, 0);
  assert.equal(result.outputs.comparison.du.delta, 0);
});

test("state comparison flags excessive stiffness variation beyond the default ante/post band", () => {
  const alignment = createComparisonAlignment({
    material: createStiffenedDesignMaterial(),
    id: "alignment-state-comparison-stiffness",
  });
  const result = new AlignmentStateComparisonAnalysis().analyze({
    alignment,
  });

  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.comparison.ks.ok, false);
  assert.ok(Math.abs(result.outputs.comparison.ks.variationRatio) > 0.15);
  assert.equal(result.outputs.comparison.Vy.ok, true);
  assert.equal(result.outputs.comparison.du.ok, true);
});

test("state comparison flags project solutions that reduce strength and switch to the lower shear drift", () => {
  const alignment = createComparisonAlignment({
    material: createStrengthReducingDesignMaterial(),
    id: "alignment-state-comparison-strength",
    lineLoad: 40000,
  });
  const result = new AlignmentStateComparisonAnalysis().analyze({
    alignment,
  });

  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.comparison.Vy.ok, false);
  assert.equal(result.outputs.comparison.ks.ok, true);
  assert.equal(result.outputs.comparison.du.ok, false);
  assert.ok(result.outputs.comparison.Vy.designValue < result.outputs.comparison.Vy.stateOfFactValue);
});

test("masonry wall openings application exposes compare-state-of-fact-vs-design as a workflow", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    mode: "compare-state-of-fact-vs-design",
    model: createComparisonAlignment({
      material: createAlignedStageMaterial(),
      id: "alignment-state-comparison-app",
    }),
  });

  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.comparison.overall.ok, true);
  assert.equal(result.outputs.criteria.stiffnessToleranceRatio, 0.15);
});
