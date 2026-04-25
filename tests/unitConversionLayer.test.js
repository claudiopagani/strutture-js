import test from "node:test";
import assert from "node:assert/strict";

import {
  LayerLoad,
  MasonryPierModel,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  SteelMaterial,
  TimberConcreteCompositeBeamApplication,
  TimberConcreteCompositeBeamModel,
  TimberXlamCompositeBeamModel,
  XlamOutOfPlanePanelModel,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018TimberMaterial,
  createTecnariaConnector,
} from "../src/index.js";

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

const legacyUnits = { force: "N", length: "mm" };

function createLegacyRcModel() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units: legacyUnits,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units: legacyUnits,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC legacy",
    concreteSection: new RectangularSection({ width: 300, height: 500, units: legacyUnits }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "b1",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
        units: legacyUnits,
      }),
      new ReinforcementBar({
        id: "b2",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
        units: legacyUnits,
      }),
      new ReinforcementBar({
        id: "t1",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
        units: legacyUnits,
      }),
      new ReinforcementBar({
        id: "t2",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
        units: legacyUnits,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units: legacyUnits,
  });

  return new ReinforcedConcreteSectionModel({
    id: "rc-legacy",
    section,
    materials: { concreteMaterial, reinforcementMaterial },
    mesh: { targetFiberCount: 120 },
    solver: { tolerance: 1e-6, maxIterations: 100 },
    actions: { nEd: -800000, mEd: 1.5e8 },
    analysisSettings: { compressedEdge: "top" },
    units: legacyUnits,
  });
}

function createExplicitUnitsRcModel() {
  const units = { force: "N", length: "m" };
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC SI",
    concreteSection: new RectangularSection({
      width: 0.3,
      height: 0.5,
      units,
    }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "b1",
        diameter: 0.02,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 0.04,
        z: 0.06,
        units,
      }),
      new ReinforcementBar({
        id: "b2",
        diameter: 0.02,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 0.04,
        z: 0.24,
        units,
      }),
      new ReinforcementBar({
        id: "t1",
        diameter: 0.02,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 0.46,
        z: 0.06,
        units,
      }),
      new ReinforcementBar({
        id: "t2",
        diameter: 0.02,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 0.46,
        z: 0.24,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return new ReinforcedConcreteSectionModel({
    id: "rc-si",
    section,
    materials: { concreteMaterial, reinforcementMaterial },
    mesh: { targetFiberCount: 120 },
    solver: { tolerance: 1e-6, maxIterations: 100 },
    actions: { nEd: -800000, mEd: 1.5e5 },
    analysisSettings: { compressedEdge: "top" },
    units,
  });
}

test("layer load converts explicit SI units to slab internal units", () => {
  const load = new LayerLoad({
    description: "Sottofondo alleggerito",
    loadGroup: "G2",
    density: 16000,
    thickness: 0.08,
    units: { force: "N", length: "m" },
  });

  approx(load.value, 1.28, 1e-9);
});

test("serializable domain objects expose internal and source unit systems", () => {
  const sourceUnits = { force: "kN", length: "m" };
  const material = new SteelMaterial({
    name: "S355",
    grade: "S355",
    elasticModulus: 210000000,
    fyk: 355000,
    units: sourceUnits,
  });
  const section = new RectangularSection({
    width: 0.3,
    height: 0.5,
    units: sourceUnits,
  });
  const rebar = new ReinforcementBar({
    diameter: 0.016,
    y: 0.04,
    z: 0.05,
    units: sourceUnits,
  });
  const cloned = material.clone();

  assert.deepEqual(material.toJSON().units, legacyUnits);
  assert.deepEqual(material.metadata.unitSystem, legacyUnits);
  assert.deepEqual(material.metadata.sourceUnitSystem, sourceUnits);
  assert.deepEqual(cloned.toJSON().units, legacyUnits);
  assert.deepEqual(cloned.metadata.sourceUnitSystem, sourceUnits);
  assert.deepEqual(section.toJSON().units, legacyUnits);
  assert.deepEqual(section.metadata.sourceUnitSystem, sourceUnits);
  assert.deepEqual(rebar.toJSON().units, legacyUnits);
  assert.deepEqual(rebar.metadata.sourceUnitSystem, sourceUnits);
});

test("public models normalize cm and kN inputs to their internal unit systems", () => {
  const units = { force: "kN", length: "cm" };
  const rcModel = new ReinforcedConcreteSectionModel({
    id: "rc-cm-kn",
    units,
    actions: {
      nEd: -12,
      axialForce: 4,
      mEd: 3,
      mxEd: 2,
      myEd: -1,
      nValues: [-1, 0.5],
    },
    referencePoint: {
      type: "custom",
      coordinates: { y: 4, z: 5 },
    },
  });
  const pierModel = new MasonryPierModel({
    id: "pier-cm-kn",
    units,
    geometry: {
      height: 300,
      length: 120,
      thickness: 30,
      baseX: 5,
      transverseWallSpacing: 600,
    },
    material: {
      units,
      fm: 0.2,
      tau0: 0.01,
      E: 800,
      G: 300,
      w: 0.000018,
    },
    actions: {
      axialForce: -25,
      outOfPlaneMoment: 12,
    },
    design: {
      constructionEccentricity: 2,
    },
    idealization: {
      rigidEndZoneTop: 10,
    },
  });

  approx(rcModel.actions.nEd, -12000);
  approx(rcModel.actions.axialForce, 4000);
  approx(rcModel.actions.mEd, 30000);
  approx(rcModel.actions.mxEd, 20000);
  approx(rcModel.actions.myEd, -10000);
  assert.deepEqual(rcModel.actions.nValues, [-1000, 500]);
  approx(rcModel.referencePoint.coordinates.y, 40);
  approx(rcModel.referencePoint.coordinates.z, 50);
  assert.deepEqual(rcModel.units, legacyUnits);
  assert.deepEqual(rcModel.metadata.sourceUnitSystem, units);

  approx(pierModel.geometry.height, 3000);
  approx(pierModel.geometry.length, 1200);
  approx(pierModel.geometry.thickness, 300);
  approx(pierModel.geometry.baseX, 50);
  approx(pierModel.geometry.transverseWallSpacing, 6000);
  approx(pierModel.material.fm, 2);
  approx(pierModel.material.E, 8000);
  approx(pierModel.actions.axialForce, -25000);
  approx(pierModel.actions.outOfPlaneMoment, 120000);
  approx(pierModel.design.constructionEccentricity, 20);
  approx(pierModel.idealization.rigidEndZoneTop, 100);
  assert.deepEqual(pierModel.units, legacyUnits);
  assert.deepEqual(pierModel.metadata.sourceUnitSystem, units);
});

test("beam-like public models normalize line loads without losing custom load metadata", () => {
  const centimeterUnits = { force: "N", length: "cm" };
  const metricUnits = { force: "kN", length: "m" };
  const timberConcrete = new TimberConcreteCompositeBeamModel({
    id: "timber-concrete-cm",
    span: 425,
    reinforcementSpacing: 10,
    connectorSpacing: 15,
    loads: {
      ulsLineLoad: 50,
      sleRareLineLoad: 20,
      label: "kept",
    },
    units: centimeterUnits,
  });
  const timberXlam = new TimberXlamCompositeBeamModel({
    id: "timber-xlam-m",
    span: 4.2,
    loads: {
      ulsLineLoad: 3,
      slePermanentLineLoad: 1.2,
      source: "manual",
    },
    units: metricUnits,
  });
  const xlamPanel = new XlamOutOfPlanePanelModel({
    id: "xlam-panel-cm",
    span: 360,
    loads: {
      ulsLineLoad: 25,
      sleLineLoad: 12,
      source: "manual",
    },
    units: centimeterUnits,
  });

  approx(timberConcrete.span, 4250);
  approx(timberConcrete.reinforcementSpacing, 100);
  approx(timberConcrete.connectorSpacing, 150);
  approx(timberConcrete.loads.ulsLineLoad, 5);
  approx(timberConcrete.loads.sleRareLineLoad, 2);
  assert.equal(timberConcrete.loads.label, "kept");

  approx(timberXlam.span, 4200);
  approx(timberXlam.loads.ulsLineLoad, 3);
  approx(timberXlam.loads.slePermanentLineLoad, 1.2);
  assert.equal(timberXlam.loads.source, "manual");

  approx(xlamPanel.span, 3600);
  approx(xlamPanel.loads.ulsLineLoad, 2.5);
  approx(xlamPanel.loads.sleLineLoad, 1.2);
  assert.equal(xlamPanel.loads.source, "manual");
});

test("reinforced concrete workflow preserves results with explicit N/m inputs", () => {
  const application = new ReinforcedConcreteSectionApplication();
  const legacyResult = application.run({ model: createLegacyRcModel() });
  const siResult = application.run({ model: createExplicitUnitsRcModel() });

  approx(siResult.outputs.MxRd, legacyResult.outputs.MxRd, 1e-3);
  approx(siResult.outputs.neutralAxisDepth, legacyResult.outputs.neutralAxisDepth, 1e-6);
});

test("timber-concrete beam preserves workbook results with explicit kN/m inputs", () => {
  const timber = createNTC2018TimberMaterial({
    strengthClass: "C24",
    kmod: 0.8,
    units: { force: "kN", length: "m" },
  });
  const concrete = createNTC2018ConcreteMaterial({
    strengthClass: "LC25/28",
    units: { force: "kN", length: "m" },
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units: { force: "kN", length: "m" },
  });
  const reinforcement = new ReinforcementBar({
    diameter: 0.006,
    grade: "B450C",
    material: reinforcementMaterial,
    units: { force: "kN", length: "m" },
  });
  const connector = createTecnariaConnector({
    type: "MAXI",
    boardThickness: 0,
    units: { force: "kN", length: "m" },
  });

  const model = new TimberConcreteCompositeBeamModel({
    id: "gelfi-si",
    span: 4.25,
    slabSection: new RectangularSection({
      width: 1.8,
      height: 0.06,
      units: { force: "kN", length: "m" },
    }),
    timberSection: new RectangularSection({
      width: 0.22,
      height: 0.25,
      units: { force: "kN", length: "m" },
    }),
    timberConcreteGap: 0.1,
    reinforcement,
    reinforcementSpacing: 0.1,
    timberMaterial: timber,
    concreteMaterial: concrete,
    reinforcementMaterial,
    connector,
    connectorSpacing: 0.15,
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
    units: { force: "kN", length: "m" },
  });

  const result = new TimberConcreteCompositeBeamApplication().run({ model });

  approx(result.outputs.gammaUls, 0.198113, 1e-4);
  approx(result.outputs.gammaSle, 0.306449, 1e-4);
  approx(result.outputs.deflectionSle, 5.189313, 1e-4);
});
