import {
  ConcreteMaterial,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  SteelMaterial,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "m" };

const concretePreset = createNTC2018ConcreteMaterial({
  strengthClass: "C25/30",
  units,
});
const reinforcementPreset = createNTC2018ReinforcementSteelMaterial({
  grade: "B450C",
  units,
});

const concreteMaterial = new ConcreteMaterial({
  name: concretePreset.name,
  strengthClass: concretePreset.strengthClass,
  density: 25000,
  elasticModulus: concretePreset.elasticModulus * 1e6,
  fck: concretePreset.fck * 1e6,
  fcd: concretePreset.fcd * 1e6,
  fctm: concretePreset.fctm * 1e6,
  units,
  metadata: {
    ...concretePreset.metadata,
    sourceUnits: units,
  },
});
const reinforcementMaterial = new SteelMaterial({
  name: reinforcementPreset.name,
  grade: reinforcementPreset.grade,
  density: 78500,
  elasticModulus: reinforcementPreset.elasticModulus * 1e6,
  fyk: reinforcementPreset.fyk * 1e6,
  fyd: reinforcementPreset.fyd * 1e6,
  ftk: reinforcementPreset.ftk * 1e6,
  ductilityClass: reinforcementPreset.ductilityClass,
  units,
  metadata: {
    ...reinforcementPreset.metadata,
    sourceUnits: units,
  },
});

const section = new ReinforcedConcreteSection({
  name: "RC demo section",
  concreteSection: new RectangularSection({ width: 0.3, height: 0.5, units }),
  reinforcementBars: [
    new ReinforcementBar({
      id: "bottom-left",
      diameter: 0.02,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 0.04,
      z: 0.06,
      units,
    }),
    new ReinforcementBar({
      id: "bottom-right",
      diameter: 0.02,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 0.04,
      z: 0.24,
      units,
    }),
    new ReinforcementBar({
      id: "top-left",
      diameter: 0.02,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 0.46,
      z: 0.06,
      units,
    }),
    new ReinforcementBar({
      id: "top-right",
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

const application = new ReinforcedConcreteSectionApplication();

const resistanceModel = new ReinforcedConcreteSectionModel({
  id: "rc-uls-01",
  section,
  analysisType: "uls-uniaxial-resistance",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount: 120 },
  units,
  actions: {
    nEd: -800000,
    mEd: 1.5e5,
  },
});

const biaxialModel = new ReinforcedConcreteSectionModel({
  id: "rc-biaxial-01",
  section,
  analysisType: "uls-biaxial-domain",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount: 120 },
  units,
  actions: {
    nEd: -800000,
  },
  analysisSettings: {
    angleCount: 12,
  },
});

const serviceModel = new ReinforcedConcreteSectionModel({
  id: "rc-service-01",
  section,
  analysisType: "service-stress",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount: 120 },
  units,
  solver: {
    tolerance: 1e-2,
    maxIterations: 50,
  },
  actions: {
    nEd: -400000,
    mxEd: 6e4,
    myEd: 2e4,
  },
});

const mnDomainModel = new ReinforcedConcreteSectionModel({
  id: "rc-mn-01",
  section,
  analysisType: "uls-uniaxial-domain",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount: 120 },
  units,
  actions: {
    nValues: [-1200000, -800000, -400000, -100000],
  },
});

console.log("ULS resistance:");
console.log(application.run({ model: resistanceModel }).toJSON());
console.log("Biaxial domain:");
console.log(application.run({ model: biaxialModel }).toJSON());
console.log("Service stress:");
console.log(application.run({ model: serviceModel }).toJSON());
console.log("M-N domain:");
console.log(application.run({ model: mnDomainModel }).toJSON());
