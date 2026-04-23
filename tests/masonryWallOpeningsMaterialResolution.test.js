import test from "node:test";
import assert from "node:assert/strict";

import {
  AlignmentSeismicAggregatedAnalysis,
  MasonryWallOpeningsModel,
  createNTC2018ExistingMasonryMaterial,
  resolveAlignmentMechanicalState,
} from "../src/index.js";

const units = { force: "N", length: "m" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createManualStageMaterial() {
  return {
    category: "masonry",
    confidenceFactor: 1.2,
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
      fm: 6e6,
      tau0: 1.2e5,
      fv0: 2e5,
      E: 2.1e9,
      G: 7.2e8,
      density: 18000,
    },
  };
}

function createAlignmentWithMaterial(material, id = "alignment-material-resolution") {
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

test("resolveAlignmentMechanicalState distinguishes state-of-fact and design materials and can divide by confidence factor", () => {
  const alignment = createAlignmentWithMaterial(createManualStageMaterial());
  const stateOfFact = resolveAlignmentMechanicalState({
    alignment,
    stage: "state-of-fact",
  });
  const design = resolveAlignmentMechanicalState({
    alignment,
    stage: "design",
  });
  const designWithConfidenceFactor = resolveAlignmentMechanicalState({
    alignment,
    stage: "design",
    options: {
      divideByConfidenceFactor: true,
    },
  });

  approx(stateOfFact.walls[0].material.fm, 4e6);
  approx(design.walls[0].material.fm, 6e6);
  approx(design.walls[0].material.E, 2.1e9);
  approx(designWithConfidenceFactor.walls[0].material.fm, 5e6);
  approx(designWithConfidenceFactor.walls[0].material.E, 1.75e9);
  assert.equal(
    stateOfFact.walls[0].metadata.propertySource,
    "stateOfFactProperties",
  );
  assert.equal(
    design.walls[0].metadata.propertySource,
    "improvedMechanicalProperties",
  );
});

test("resolveAlignmentMechanicalState reuses NTC existing masonry materials and can disable corrective modifiers", () => {
  const material = createNTC2018ExistingMasonryMaterial({
    masonryTypologyId: 1,
    knowledgeLevel: "LC2",
    parameterLevel: 2,
    units: { force: "N", length: "mm" },
    modifierSelections: {
      maltaBuona: { selected: true },
      connessioneTrasversale: { selected: true },
      iniezioniMisceleLeganti: { selected: true },
    },
  });
  const alignment = createAlignmentWithMaterial(
    material,
    "alignment-material-resolution-ntc",
  );
  const stateOfFact = resolveAlignmentMechanicalState({
    alignment,
    stage: "state-of-fact",
  });
  const design = resolveAlignmentMechanicalState({
    alignment,
    stage: "design",
  });
  const unmodified = resolveAlignmentMechanicalState({
    alignment,
    stage: "design",
    options: {
      useCorrectiveModifiers: false,
    },
  });

  approx(stateOfFact.walls[0].material.fm, 3.375e6);
  approx(design.walls[0].material.fm, 6.75e6);
  approx(unmodified.walls[0].material.fm, 1.5e6);
});

test("aggregated seismic analysis uses the resolved material stage so design and state-of-fact capacities diverge when properties differ", () => {
  const alignment = createAlignmentWithMaterial(
    createManualStageMaterial(),
    "alignment-stage-sensitive-seismic",
  );
  const stateOfFact = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment,
    stage: "state-of-fact",
  });
  const design = new AlignmentSeismicAggregatedAnalysis().analyze({
    alignment,
    stage: "design",
  });

  assert.equal(stateOfFact.status, "ok");
  assert.equal(design.status, "ok");
  assert.notEqual(
    design.outputs.capacityCurve.maxBaseShear,
    stateOfFact.outputs.capacityCurve.maxBaseShear,
  );
  assert.ok(design.outputs.bilinearization.ks > stateOfFact.outputs.bilinearization.ks);
});
