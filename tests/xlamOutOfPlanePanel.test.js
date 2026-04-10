import test from "node:test";
import assert from "node:assert/strict";

import {
  XlamMaterial,
  XlamOutOfPlanePanelApplication,
  XlamOutOfPlanePanelModel,
  createXlamPanelSection,
  getXlamPanelProduct,
  listXlamPanelProducts,
  registerXlamPanelProduct,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

test("xlam panel catalog can register and retrieve producer products", () => {
  registerXlamPanelProduct({
    id: "demo-producer-120",
    producer: "DemoProducer",
    name: "Demo 120",
    layerThicknesses: [20, 20, 20, 20, 20, 20],
    activeLayerIndexes: [0, 2, 4],
  });

  const product = getXlamPanelProduct("demo-producer-120");

  assert.equal(product.producer, "DemoProducer");
  assert.ok(listXlamPanelProducts().length >= 2);
});

test("standalone xlam out-of-plane verification returns bending and shear checks", () => {
  const section = createXlamPanelSection({
    layerThicknesses: [40, 30, 40, 30, 40],
    activeLayerIndexes: [0, 2, 4],
    effectiveWidth: 1000,
    units,
  });
  const material = new XlamMaterial({
    name: "Generic CLT C24",
    strengthClass: "custom-clt",
    elasticModulus: 11000,
    fmK: 24,
    fvK: 4,
    e0Mean: 11000,
    e90Mean: 11000 / 30,
    g0Mean: 690,
    g90Mean: 69,
    rollingShearStrength: 1.2,
    units,
  });

  const result = new XlamOutOfPlanePanelApplication().run({
    model: new XlamOutOfPlanePanelModel({
      id: "panel-1",
      span: 4500,
      section,
      material,
      serviceClass: 1,
      kmod: 0.8,
      gammaM: 1.45,
      systemBoardCount: 4,
      loads: {
        ulsLineLoad: 8,
        sleLineLoad: 5,
        slePermanentLineLoad: 2.5,
        sleVariableLineLoad: 2.5,
      },
      units,
    }),
  });

  assert.ok(["ok", "not-verified"].includes(result.status));
  assert.ok(result.outputs.bendingStiffness > 0);
  assert.ok(result.outputs.shearStiffness > 0);
  assert.ok(result.checks.some((check) => check.id === "rolling-shear"));
});
