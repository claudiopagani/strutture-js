import {
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const concreteMaterial = createNTC2018ConcreteMaterial({
  strengthClass: "C25/30",
});
const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
  grade: "B450C",
});

const section = new ReinforcedConcreteSection({
  name: "RC demo section",
  concreteSection: new RectangularSection({ width: 300, height: 500 }),
  reinforcementBars: [
    new ReinforcementBar({
      id: "bottom-left",
      diameter: 20,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 40,
      z: 60,
    }),
    new ReinforcementBar({
      id: "bottom-right",
      diameter: 20,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 40,
      z: 240,
    }),
    new ReinforcementBar({
      id: "top-left",
      diameter: 20,
      grade: "B450C",
      material: reinforcementMaterial,
      y: 460,
      z: 60,
    }),
    new ReinforcementBar({
      id: "top-right",
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

const application = new ReinforcedConcreteSectionApplication();

const resistanceModel = new ReinforcedConcreteSectionModel({
  id: "rc-uls-01",
  section,
  analysisType: "uls-uniaxial-resistance",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount: 120 },
  actions: {
    nEd: -800000,
    mEd: 1.5e8,
  },
});

const biaxialModel = new ReinforcedConcreteSectionModel({
  id: "rc-biaxial-01",
  section,
  analysisType: "uls-biaxial-domain",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount: 120 },
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
  solver: {
    tolerance: 1e-2,
    maxIterations: 50,
  },
  actions: {
    nEd: -400000,
    mxEd: 6e7,
    myEd: 2e7,
  },
});

const mnDomainModel = new ReinforcedConcreteSectionModel({
  id: "rc-mn-01",
  section,
  analysisType: "uls-uniaxial-domain",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount: 120 },
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
