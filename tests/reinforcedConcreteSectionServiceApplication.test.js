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

function createServiceModel() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
  });
  const section = new ReinforcedConcreteSection({
    name: "RC service application fixture",
    concreteSection: new RectangularSection({ width: 300, height: 500 }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 60,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 240,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 450,
        z: 60,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 450,
        z: 240,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
  });

  return new ReinforcedConcreteSectionModel({
    id: "rc-service-01",
    section,
    analysisType: "service-stress",
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-2,
      maxIterations: 50,
    },
    actions: {
      nEd: -400000,
      mxEd: 6e7,
      myEd: 2e7,
    },
  });
}

test("reinforced concrete section application returns a service stress workflow result", () => {
  const model = createServiceModel();
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.applicationId, "reinforced-concrete-sections");
  assert.equal(result.outputs.analysisType, "service-stress");
  assert.ok(result.outputs.iterations >= 0);
  assert.equal(result.outputs.concrete.maxTension, null);
});
