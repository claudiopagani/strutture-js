import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcementBar,
  SingleBeamAnalysis,
  TimberConcreteCompositeBeamApplication,
  TimberConcreteCompositeBeamModel,
  TimberConcreteCompositeBeamSectionProvider,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018TimberMaterial,
  createTecnariaConnector,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-4) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createReferenceModel() {
  const timber = createNTC2018TimberMaterial({
    strengthClass: "C24",
    kmod: 0.8,
    units,
  });
  const concrete = createNTC2018ConcreteMaterial({
    strengthClass: "LC25/28",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const reinforcement = new ReinforcementBar({
    diameter: 6,
    grade: "B450C",
    material: reinforcementMaterial,
    units,
  });
  const connector = createTecnariaConnector({
    type: "MAXI",
    boardThickness: 0,
    units,
  });

  return new TimberConcreteCompositeBeamModel({
    id: "gelfi-reference",
    span: 4250,
    slabSection: new RectangularSection({ width: 1800, height: 60, units }),
    timberSection: new RectangularSection({ width: 220, height: 250, units }),
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
    units,
  });
}

test("timber-concrete composite beam verification reproduces the workbook reference case", () => {
  const model = createReferenceModel();
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

test("timber-concrete section provider exposes gamma EI for beam FEM contexts", () => {
  const model = createReferenceModel();
  const provider = new TimberConcreteCompositeBeamSectionProvider({ model });

  const uls = provider.getElasticBeamProperties({ limitState: "ULS" });
  const sle = provider.getElasticBeamProperties({ limitState: "SLE" });

  approx(uls.metadata.gamma, 0.198113, 1e-4);
  approx(sle.metadata.gamma, 0.306449, 1e-4);
  assert.equal(uls.metadata.finalStiffness, false);
  assert.equal(sle.metadata.finalStiffness, true);
  assert.ok(
    uls.metadata.inertiaEffective > uls.metadata.disconnectedInertia &&
      uls.metadata.inertiaEffective < uls.metadata.idealInertia,
  );
  assert.ok(
    sle.metadata.inertiaEffective > sle.metadata.disconnectedInertia &&
      sle.metadata.inertiaEffective < sle.metadata.idealInertia,
  );
  approx(
    uls.flexuralRigidity,
    model.timberMaterial.elasticModulus * uls.metadata.inertiaEffective,
    1e-2,
  );
  approx(
    sle.flexuralRigidity,
    (model.timberMaterial.elasticModulus / (1 + model.kdef)) *
      sle.metadata.inertiaEffective,
    1e-2,
  );
});

test("timber-concrete section provider can drive single beam combinations", () => {
  const model = createReferenceModel();
  const provider = new TimberConcreteCompositeBeamSectionProvider({ model });
  const result = new SingleBeamAnalysis().analyze({
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: model.span, y: 0 },
    },
    sectionProvider: provider,
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "g1",
        type: "uniform",
        actionType: "G1",
        value: -5,
        direction: "global-y",
        projection: "horizontal",
      },
      {
        id: "qk",
        type: "uniform",
        actionType: "Qk",
        value: -4,
        direction: "global-y",
        projection: "horizontal",
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3, Qk: 1.5 },
      },
      {
        id: "sle",
        limitState: "SLE",
        factors: { G1: 1, Qk: 1 },
      },
    ],
    discretization: { elementCount: 2 },
    units,
  });

  const ulsResult = result.combinations.uls;
  const sleResult = result.combinations.sle;

  assert.equal(Object.keys(result.combinations).length, 2);
  assert.equal(ulsResult.sectionProperties.metadata.limitState, "ULS");
  assert.equal(sleResult.sectionProperties.metadata.limitState, "SLE");
  assert.ok(Math.abs(sleResult.displacements.maxAbsVerticalDisplacement.uy) > 0);
});
