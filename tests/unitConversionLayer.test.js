import test from "node:test";
import assert from "node:assert/strict";

import {
  LayerLoad,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
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

function createLegacyRcModel() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
  });
  const section = new ReinforcedConcreteSection({
    name: "RC legacy",
    concreteSection: new RectangularSection({ width: 300, height: 500 }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "b1",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
      }),
      new ReinforcementBar({
        id: "b2",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
      }),
      new ReinforcementBar({
        id: "t1",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
      }),
      new ReinforcementBar({
        id: "t2",
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
    id: "rc-legacy",
    section,
    materials: { concreteMaterial, reinforcementMaterial },
    mesh: { targetFiberCount: 120 },
    solver: { tolerance: 1e-6, maxIterations: 100 },
    actions: { nEd: -800000, mEd: 1.5e8 },
    analysisSettings: { compressedEdge: "top" },
  });
}

function createExplicitUnitsRcModel() {
  const units = { force: "N", length: "m" };
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
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
  });
  const concrete = createNTC2018ConcreteMaterial({
    strengthClass: "LC25/28",
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
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
