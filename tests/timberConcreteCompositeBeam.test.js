import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcementBar,
  TimberConcreteCompositeBeamApplication,
  TimberConcreteCompositeBeamModel,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018TimberMaterial,
  createTecnariaConnector,
} from "../src/index.js";

const approx = (actual, expected, tolerance = 1e-4) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("timber-concrete composite beam verification reproduces the workbook reference case", () => {
  const timber = createNTC2018TimberMaterial({
    strengthClass: "C24",
    kmod: 0.8,
  });
  const concrete = createNTC2018ConcreteMaterial({
    strengthClass: "LC25/28",
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
  });
  const reinforcement = new ReinforcementBar({
    diameter: 6,
    grade: "B450C",
    material: reinforcementMaterial,
  });
  const connector = createTecnariaConnector({
    type: "MAXI",
    boardThickness: 0,
  });

  const model = new TimberConcreteCompositeBeamModel({
    id: "gelfi-reference",
    span: 4250,
    slabSection: new RectangularSection({ width: 1800, height: 60 }),
    timberSection: new RectangularSection({ width: 220, height: 250 }),
    timberConcreteGap: 100,
    reinforcement,
    reinforcementSpacing: 100,
    timberMaterial: timber,
    concreteMaterial: concrete,
    reinforcementMaterial,
    connector,
    connectorSpacing: 150,
    kdef: 0.6,
    kmod: 0.8,
    confidenceFactor: 1.35,
    gammaConcrete: 1.5,
    gammaSteel: 1.15,
    gammaTimber: 1.5,
    gammaConnector: 1.5,
    alphaCc: 0.85,
    loads: {
      ulsLineLoad: 15.966,
      sleRareLineLoad: 10.998,
    },
    deflectionLimitDenominator: 250,
  });

  const result = new TimberConcreteCompositeBeamApplication().run({ model });

  assert.equal(result.status, "ok");
  approx(result.outputs.gammaUls, 0.198113, 1e-4);
  approx(result.outputs.gammaSle, 0.306449, 1e-4);
  approx(result.outputs.timberStressBottom, -3.018467, 1e-4);
  approx(result.outputs.timberStressTop, 6.171429, 1e-4);
  approx(result.outputs.neutralAxisDepth, 14.012554, 1e-3);
  approx(result.outputs.deflectionSle, 5.189313, 1e-4);
  approx(result.checks[3].utilizationRatio, 0.978084, 1e-4);
  approx(result.utilizationRatio, 0.978084, 1e-4);
});
