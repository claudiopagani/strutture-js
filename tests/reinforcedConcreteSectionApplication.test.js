import test from "node:test";
import assert from "node:assert/strict";

import {
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcedConcreteSectionVerification,
  ReinforcementBar,
  RectangularSection,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

test("reinforced concrete section reports missing input as not analyzed", () => {
  const result = new ReinforcedConcreteSectionVerification().verify({
    id: "missing-section",
  });

  assert.equal(result.status, "not-analyzed");
});

function createApplicationModel() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC application fixture",
    concreteSection: new RectangularSection({ width: 300, height: 500, units }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return new ReinforcedConcreteSectionModel({
    id: "rc-section-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    units,
    actions: {
      nEd: -800000,
      mEd: 1.5e8,
    },
    analysisSettings: {
      compressedEdge: "top",
    },
  });
}

test("reinforced concrete section application runs the first ULS uniaxial workflow", () => {
  const model = createApplicationModel();
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.applicationId, "reinforced-concrete-sections");
  assert.ok(["ok", "not-verified"].includes(result.status));
  assert.equal(result.outputs.analysisType, "uls-uniaxial-resistance");
  assert.ok(result.outputs.MxRd > 0);
  assert.equal(Math.sign(result.outputs.MxRd), Math.sign(result.outputs.mEd));
  assert.ok(result.outputs.fiberCount > 0);
  assert.equal(result.checks.length, 1);
  assert.ok(result.capacity > 0);
});

test("reinforced concrete section application normalizes a serializable model DTO", () => {
  const source = createApplicationModel();
  const result = new ReinforcedConcreteSectionApplication().run({
    model: {
      id: "rc-section-json",
      section: source.section,
      materials: source.materials,
      mesh: source.mesh,
      solver: source.solver,
      actions: { nEd: -800, mEd: 150 },
      analysisSettings: source.analysisSettings,
      units: { force: "kN", length: "m" },
    },
    metadata: { source: "serialized-contract" },
  });

  assert.equal(result.outputs.nEd, -800e3);
  assert.equal(result.outputs.mEd, 150e6);
  assert.equal(result.metadata.source, "serialized-contract");
});

test("reinforced concrete section verification keeps negative mxEd and MxRd on the same convention", () => {
  const model = createApplicationModel();
  model.actions.mEd = -1.5e8;
  model.actions.mxEd = -1.5e8;
  model.analysisSettings.compressedEdge = "bottom";
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.outputs.mEd, -1.5e8);
  assert.ok(result.outputs.MxRd < 0);
  assert.equal(Math.sign(result.outputs.MxRd), Math.sign(result.outputs.mEd));
});
