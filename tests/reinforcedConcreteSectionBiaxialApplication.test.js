import test from "node:test";
import assert from "node:assert/strict";

import {
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

function createBiaxialModel() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
  });
  const section = new ReinforcedConcreteSection({
    name: "RC biaxial application fixture",
    concreteSection: new RectangularSection({ width: 300, height: 500 }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
  });

  return new ReinforcedConcreteSectionModel({
    id: "rc-biaxial-01",
    section,
    analysisType: "uls-biaxial-domain",
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
    actions: {
      nEd: -800000,
    },
    analysisSettings: {
      angleCount: 12,
    },
  });
}

test("reinforced concrete section application returns a biaxial domain workflow result", () => {
  const model = createBiaxialModel();
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.applicationId, "reinforced-concrete-sections");
  assert.equal(result.outputs.analysisType, "uls-biaxial-domain");
  assert.equal(result.outputs.points.length, 12);
  assert.ok(result.outputs.points.every((point) => point.converged));
});
