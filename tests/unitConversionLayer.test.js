import test from "node:test";
import assert from "node:assert/strict";

import {
  LayerLoad,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  SteelMaterial,
  TimberConcreteCompositeBeamApplication,
  TimberConcreteCompositeBeamModel,
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
