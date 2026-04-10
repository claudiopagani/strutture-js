import {
  LoadCase,
  createNTC2018ConcreteMaterial,
  createNTC2018ExistingMasonryMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createNTC2018TimberMaterial,
  createNTC2018SLECombination,
  createNTC2018ULSFundamentalCombination,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const g1 = new LoadCase({
  id: "G1",
  name: "Permanenti strutturali",
  category: "dead",
});

const g2 = new LoadCase({
  id: "G2",
  name: "Permanenti non strutturali",
  category: "dead",
});

const qOffice = new LoadCase({
  id: "Q_B",
  name: "Sovraccarico uffici",
  category: "live",
});

const wind = new LoadCase({
  id: "Q_W",
  name: "Vento",
  category: "wind",
});

const concrete = createNTC2018ConcreteMaterial({
  strengthClass: "C30/37",
  units,
});

const steel = createNTC2018ReinforcementSteelMaterial({
  grade: "B450C",
  units,
});

const solidTimber = createNTC2018TimberMaterial({
  strengthClass: "C24",
  units,
});

const glulamTimber = createNTC2018TimberMaterial({
  strengthClass: "GL24c",
  units,
});

const masonry = createNTC2018ExistingMasonryMaterial({
  id: "MUR-NTC-LC2",
  name: "Muratura esistente NTC 2018",
  masonryTypologyId: 7,
  knowledgeLevel: "LC2",
  modifierSelections: {
    connessioneTrasversale: { selected: true },
    intonacoArmato: { selected: true },
  },
  units,
});

const uls = createNTC2018ULSFundamentalCombination({
  id: "ULS-NTC-01",
  permanentActions: [
    { loadCase: g1, actionType: "G1" },
    { loadCase: g2, actionType: "G2" },
  ],
  variableActions: [
    { loadCase: qOffice, category: "B" },
    { loadCase: wind, category: "WIND" },
  ],
  leadingVariableAction: { loadCase: qOffice, category: "B" },
});

const sleRare = createNTC2018SLECombination({
  id: "SLE-RARA-01",
  type: "RARE",
  permanentActions: [
    { loadCase: g1 },
    { loadCase: g2 },
  ],
  variableActions: [
    { loadCase: qOffice, category: "B" },
    { loadCase: wind, category: "WIND" },
  ],
  leadingVariableAction: { loadCase: qOffice, category: "B" },
});

console.log("Concrete preset:", concrete.toJSON());
console.log("Reinforcement preset:", steel.toJSON());
console.log("Solid timber preset:", solidTimber.toJSON());
console.log("Glulam timber preset:", glulamTimber.toJSON());
console.log("Existing masonry preset:", masonry.toJSON());
console.log("ULS combination:", uls.toJSON());
console.log("SLE rare combination:", sleRare.toJSON());
