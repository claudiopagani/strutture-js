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

const units = { force: "N", length: "mm" };

function createSection() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC moment-curvature fixture",
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
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 16,
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

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
  };
}

test("reinforced concrete section application returns a moment-curvature curve", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd: 0,
    },
    analysisSettings: {
      compressedEdge: "top",
      pointCount: 12,
      curvatureMax: 0.00003,
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.applicationId, "reinforced-concrete-sections");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.analysisType, "moment-curvature");
  assert.ok(result.outputs.points.length >= 3);
  assert.equal(result.outputs.points[0].curvature, 0);
  assert.equal(result.outputs.points[0].Mx, 0);
  assert.ok(result.outputs.points.at(-1).curvature > 0);
  assert.ok(result.outputs.points.at(-1).Mx > 0);
  assert.equal(result.outputs.failureReached, true);
  assert.equal(result.outputs.firstYieldReached, true);
  assert.equal(
    result.outputs.ntc2018Ductility.reference,
    "NTC2018 4.1.2.3.4.2",
  );
  assert.ok(result.outputs.ntc2018Ductility.phiPrimeYd > 0);
  assert.ok(result.outputs.ntc2018Ductility.mPrimeYd > 0);
  assert.ok(result.outputs.ntc2018Ductility.mRd >= result.outputs.ntc2018Ductility.mPrimeYd);
  assert.ok(result.outputs.ntc2018Ductility.phiYd >= result.outputs.ntc2018Ductility.phiPrimeYd);
  assert.ok(result.outputs.ntc2018Ductility.phiU >= result.outputs.ntc2018Ductility.phiPrimeYd);
  assert.ok(result.outputs.ntc2018Ductility.curvatureDuctilityRatio > 0);
  assert.ok(result.outputs.failurePoint.limitState.governing.utilizationRatio >= 0.99);
});

test("moment-curvature workflow can use triangular concrete and hardening steel laws", () => {
  const { section, concreteMaterial, reinforcementMaterial } = createSection();
  const model = new ReinforcedConcreteSectionModel({
    id: "rc-moment-curvature-hardening-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisType: "moment-curvature",
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    actions: {
      nEd: 0,
    },
    analysisSettings: {
      concreteLawType: "triangular-rectangle",
      steelLawType: "elastic-plastic-hardening",
      compressedEdge: "top",
      pointCount: 12,
      curvatureMax: 0.00003,
    },
    units,
  });
  const result = new ReinforcedConcreteSectionApplication().run({ model });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.firstYieldReached, true);
  assert.ok(result.outputs.ntc2018Ductility.mPrimeYd > 0);
  assert.ok(result.outputs.points.at(-1).Mx > 0);
});
