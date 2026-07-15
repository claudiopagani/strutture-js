import {
  RC_PLATE_ANALYSIS_TYPES,
  ReinforcedConcretePlateApplication,
  ReinforcedConcretePlateModel,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const model = new ReinforcedConcretePlateModel({
  id: "rc-plate-example",
  units,
  materials: {
    concreteMaterial: createNTC2018ConcreteMaterial({
      strengthClass: "C25/30",
      units: { force: "N", length: "mm" },
    }),
    reinforcementMaterial: createNTC2018ReinforcementSteelMaterial({
      grade: "B450C",
      units: { force: "N", length: "mm" },
    }),
  },
  geometry: {
    thickness: 0.22,
    unitWidth: 1,
  },
  reinforcement: {
    angle: 15,
    shear: {
      diameter: 0.008,
      spacingX: 0.15,
      spacingY: 0.20,
    },
    top: {
      x: { barsPerMeter: 5, diameter: 0.012, clearCover: 0.025 },
      y: { barsPerMeter: 5, diameter: 0.012, clearCover: 0.040 },
    },
    bottom: {
      x: { barsPerMeter: 6, diameter: 0.014, clearCover: 0.025 },
      y: { barsPerMeter: 6, diameter: 0.014, clearCover: 0.042 },
    },
  },
  analysis: {
    type: RC_PLATE_ANALYSIS_TYPES.ULS_BENDING_SHEAR,
    combinationType: "ULS_FUNDAMENTAL",
    actions: {
      mxx: 25,
      myy: 18,
      mxy: 6,
      qx: 60,
      qy: 35,
    },
  },
});

const result = new ReinforcedConcretePlateApplication().run({ model });

console.log(JSON.stringify(result, null, 2));
