import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  SingleBeamAnalysis,
  TimberDowelConnector,
  TimberMaterial,
  TimberXlamCompositeBeamApplication,
  TimberXlamCompositeBeamModel,
  TimberXlamCompositeBeamSectionProvider,
  TimberXlamCompositeBeamVerification,
  XlamPanelSection,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-4) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createReferenceModel() {
  const xlamMaterial = new TimberMaterial({
    name: "XLAM top panel",
    strengthClass: "custom-xlam",
    elasticModulus: 11600,
    fmK: 24,
    fvK: 2.7,
    units,
  });
  const beamMaterial = new TimberMaterial({
    name: "Glulam beam",
    strengthClass: "custom-glulam",
    elasticModulus: 12600,
    fmK: 28,
    fvK: 3.2,
    units,
  });
  const connector = new TimberDowelConnector({
    diameter: 16,
    timberDensityMean: 410,
    timberDensityCharacteristicSection1: 380,
    timberDensityCharacteristicSection2: 410,
    ultimateTensileStrength: 360,
    penetrationLength: 90,
    spacing: 50,
    gammaConnection: 1.5,
    kmod: 0.9,
    units,
  });

  return new TimberXlamCompositeBeamModel({
    id: "xlam-reference",
    span: 9200,
    xlamSection: new XlamPanelSection({
      effectiveWidth: 600,
      layerThicknesses: [0, 0, 30, 30, 30],
      activeLayerIndexes: [1, 3],
      units,
    }),
    timberSection: new RectangularSection({
      width: 240,
      height: 440,
      units,
    }),
    xlamMaterial,
    timberMaterial: beamMaterial,
    connector,
    kmod: 0.9,
    gammaXlam: 1.45,
    gammaTimber: 1.45,
    gammaConnection: 1.5,
    serviceClass: 2,
    psi2: 0,
    loads: {
      ulsLineLoad: 17.134,
      slePermanentLineLoad: 5.044,
      sleVariableLineLoad: 6.24,
    },
    units,
  });
}

test("timber-xlam composite beam verification reproduces the workbook reference case", () => {
  const model = createReferenceModel();
  const result = new TimberXlamCompositeBeamApplication().run({ model });

  assert.equal(result.status, "ok");
  approx(result.outputs.kser, 6641.493808, 1e-3);
  approx(result.outputs.gamma1Uls, 0.784346, 1e-4);
  approx(result.outputs.gamma2Uls, 0.363361, 1e-4);
  approx(result.outputs.ejEffUls / 1e12, 33.474755, 1e-3);
  approx(result.outputs.sigmaN1, -12.942024, 1e-4);
  approx(result.outputs.sigmaM1, 1.884544, 1e-4);
  approx(result.outputs.tau2, 0.944451, 1e-4);
  approx(result.outputs.connectorForce, 5.06427, 1e-4);
  approx(result.outputs.deflectionShort, 30.622415, 1e-4);
  approx(result.checks[0].utilizationRatio, 0.995302, 1e-4);
});

test("timber-xlam section provider exposes gamma EJ for beam FEM contexts", () => {
  const model = createReferenceModel();
  const provider = new TimberXlamCompositeBeamSectionProvider({ model });

  const uls = provider.getElasticBeamProperties({ limitState: "ULS" });
  const sle = provider.getElasticBeamProperties({ limitState: "SLE" });
  const sleFinal = provider.getElasticBeamProperties({
    limitState: "SLE",
    deformationState: "final",
  });

  approx(uls.metadata.gamma1, 0.784346, 1e-4);
  approx(uls.metadata.gamma2, 0.363361, 1e-4);
  approx(uls.flexuralRigidity / 1e12, 33.474755, 1e-3);
  approx(sle.metadata.gamma1, 0.845095, 1e-4);
  approx(sle.metadata.gamma2, 0.461243, 1e-4);
  assert.equal(sle.metadata.finalStiffness, false);
  assert.equal(sleFinal.metadata.finalStiffness, true);
  assert.ok(sleFinal.flexuralRigidity < sle.flexuralRigidity);
});

test("timber-xlam section provider can drive single beam combinations", () => {
  const model = createReferenceModel();
  const provider = new TimberXlamCompositeBeamSectionProvider({ model });
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
        id: "sle-final",
        limitState: "SLE",
        serviceCombination: "final",
        factors: { G1: 1, Qk: 1 },
      },
    ],
    discretization: { elementCount: 2 },
    units,
  });

  const ulsResult = result.combinations.uls;
  const sleResult = result.combinations["sle-final"];

  assert.equal(Object.keys(result.combinations).length, 2);
  assert.equal(ulsResult.sectionProperties.metadata.limitState, "ULS");
  assert.equal(sleResult.sectionProperties.metadata.limitState, "SLE");
  assert.equal(sleResult.sectionProperties.metadata.finalStiffness, true);
  assert.ok(Math.abs(sleResult.displacements.maxAbsVerticalDisplacement.uy) > 0);
});

test("timber-xlam verification can use FEM diagrams instead of closed-form actions", () => {
  const model = createReferenceModel();
  const qSle = model.loads.slePermanentLineLoad + model.loads.sleVariableLineLoad;
  model.analysisResult = new SingleBeamAnalysis().analyze({
    id: "xlam-fem-check",
    units,
    geometry: { start: { x: 0, y: 0 }, end: { x: model.span, y: 0 } },
    sectionProvider: new TimberXlamCompositeBeamSectionProvider({ model }),
    supports: { start: "hinge", end: "roller" },
    loads: [
      { id: "uls-load", actionType: "ULSLOAD", type: "uniform", value: -model.loads.ulsLineLoad },
      { id: "sle-load", actionType: "SLELOAD", type: "uniform", value: -qSle },
    ],
    combinations: [
      { id: "uls", limitState: "ULS", factors: { "uls-load": 1 } },
      { id: "sle", limitState: "SLE", factors: { "sle-load": 1 } },
      {
        id: "sle-final",
        limitState: "SLE",
        serviceCombination: "final",
        factors: { "sle-load": 1 },
      },
    ],
    discretization: { elementCount: 8 },
  });

  const result = new TimberXlamCompositeBeamApplication().run({ model });

  assert.equal(result.metadata.actionSource, "fem-section-actions");
  assert.ok(result.outputs.bendingEd > 0);
  assert.ok(result.outputs.shearEd > 0);
  assert.ok(result.outputs.deflectionShort > 0);
  assert.ok(result.outputs.sectionActionVerification.stationResultCount > 0);
  assert.ok(
    result.checks.some(
      (check) => check.metadata?.method === "timber-xlam-gamma-method-section-actions",
    ),
  );
});

test("timber-xlam verification neglects slab in-plane rotated components with warning", () => {
  const model = createReferenceModel();
  const mY = (model.loads.ulsLineLoad * model.span ** 2) / 32;
  const vY = (model.loads.ulsLineLoad * model.span) / 8;
  const result = new TimberXlamCompositeBeamVerification().verifySectionActions({
    principalActions: {
      mY,
      mZ: mY * 0.05,
      vY,
      vZ: vY * 0.05,
    },
    context: {
      model,
      units,
    },
  });
  const timberCheck = result.checks.find(
    (check) => check.id === "timber-max-stress",
  );

  assert.equal(result.status, "ok");
  assert.equal(timberCheck.metadata.weakAxisComponentsNeglected, true);
  assert.ok(Math.abs(timberCheck.metadata.mZEdSectionUnits) > 0);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("slab action provides high in-plane stiffness/resistance"),
    ),
  );
});

test("timber-xlam verification exposes standalone section-action adapter", () => {
  const model = createReferenceModel();
  const result = new TimberXlamCompositeBeamVerification().verifySectionActions({
    vEd: (model.loads.ulsLineLoad * model.span) / 2,
    mEd: (model.loads.ulsLineLoad * model.span ** 2) / 8,
    context: {
      model,
      units,
    },
  });

  assert.equal(result.status, "ok");
  assert.ok(result.checks.some((check) => check.id === "connector"));
  assert.equal(result.metadata.method, "timber-xlam-gamma-method-section-actions");
});
