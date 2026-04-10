import {
  BeamElement,
  ConcreteMaterial,
  CrossSection,
  createSteelProfileSection,
  DistributedLoad,
  ExistingMasonryMaterial,
  LoadCase,
  LoadCombination,
  Node,
  NodalLoad,
  StructuralModel,
  Support,
} from "../src/index.js";

const n1 = new Node({ id: "N1", x: 0, y: 0, z: 0 });
const n2 = new Node({ id: "N2", x: 5, y: 0, z: 0 });

const concrete = new ConcreteMaterial({
  id: "C25_30",
  name: "Calcestruzzo C25/30",
  strengthClass: "C25/30",
  density: 2500,
  elasticModulus: 31400,
  fck: 25,
  fcd: 14.17,
});

const existingMasonry = new ExistingMasonryMaterial({
  id: "MUR-ES-01",
  name: "Muratura portante esistente",
  masonryType: "Pietrame disordinato",
  baseProperties: {
    fm: 2.2,
    tau0: 0.04,
    E: 1200,
  },
  surveyFactors: {
    geometry: 0.95,
    connections: 0.9,
    workmanship: 0.85,
    degradation: 0.9,
  },
  improvementFactors: {
    groutInjection: 1.15,
    reinforcedPlaster: 1.1,
    jacketing: 1,
    ties: 1.05,
  },
  confidenceFactor: 1.2,
  knowledgeLevel: "LC2",
});

const section = new CrossSection({
  id: "RECT-30x50",
  name: "Rettangolare 30x50 cm",
  area: 0.15,
  inertiaY: 0.003125,
  inertiaZ: 0.001125,
});

const beam = new BeamElement({
  id: "B1",
  startNode: n1,
  endNode: n2,
  material: concrete,
  crossSection: section,
});

const deadLoad = new LoadCase({
  id: "G1",
  name: "Permanenti strutturali",
  category: "dead",
});

const liveLoad = new LoadCase({
  id: "Q1",
  name: "Sovraccarico variabile",
  category: "live",
});

deadLoad.addLoad(
  new DistributedLoad({
    id: "qG1",
    direction: "globalY",
    startValue: -18,
    element: beam,
  }),
);

liveLoad.addLoad(
  new NodalLoad({
    id: "P1",
    direction: "globalY",
    magnitude: -12,
    node: n2,
    components: { fy: -12 },
  }),
);

const combination = new LoadCombination({
  id: "ULS-01",
  name: "SLU fondamentale",
  combinationType: "ULS",
}).addFactor(deadLoad, 1.3).addFactor(liveLoad, 1.5);

const model = new StructuralModel({
  id: "FRAME-01",
  name: "Telaio di esempio",
})
  .addMaterial(concrete)
  .addMaterial(existingMasonry)
  .addNode(n1)
  .addNode(n2)
  .addElement(beam)
  .addSupport(
    new Support({
      id: "S1",
      node: n1,
      restraints: { ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
    }),
  )
  .addLoadCase(deadLoad)
  .addLoadCase(liveLoad)
  .addLoadCombination(combination);

console.log("Model summary:", model.summary());
console.log("Adjusted existing masonry properties:", existingMasonry.adjustedProperties());

const steelProfileSection = createSteelProfileSection({
  profileName: "IPE300",
});

console.log("Steel profile section:", steelProfileSection.toJSON());
