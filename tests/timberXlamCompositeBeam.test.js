import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  TimberDowelConnector,
  TimberMaterial,
  TimberXlamCompositeBeamApplication,
  TimberXlamCompositeBeamModel,
  XlamPanelSection,
} from "../src/index.js";

const approx = (actual, expected, tolerance = 1e-4) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("timber-xlam composite beam verification reproduces the workbook reference case", () => {
  const xlamMaterial = new TimberMaterial({
    name: "XLAM top panel",
    strengthClass: "custom-xlam",
    elasticModulus: 11600,
    fmK: 24,
    fvK: 2.7,
  });
  const beamMaterial = new TimberMaterial({
    name: "Glulam beam",
    strengthClass: "custom-glulam",
    elasticModulus: 12600,
    fmK: 28,
    fvK: 3.2,
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
  });

  const model = new TimberXlamCompositeBeamModel({
    id: "xlam-reference",
    span: 9200,
    xlamSection: new XlamPanelSection({
      effectiveWidth: 600,
      layerThicknesses: [0, 0, 30, 30, 30],
      activeLayerIndexes: [1, 3],
    }),
    timberSection: new RectangularSection({
      width: 240,
      height: 440,
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
  });

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
