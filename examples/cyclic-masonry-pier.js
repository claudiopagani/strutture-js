import {
  CyclicMasonryCompressionMaterial,
  CyclicMasonryPier2D,
  CyclicMasonryPierAnalysis2D,
  CyclicMasonryShearMaterial,
  Node,
  SlidingStrengthModel,
  TurnsekSheppardModel,
  cyclicMasonryPierHistoryToCsv,
} from "strutture-js";

// Illustrative calibration only: these values are not universal or normative.
const units = { force: "kN", length: "m" };
const height = 2.5;
const width = 1;
const thickness = 0.25;
const elasticModulus = 2e6;
const shearModulus = 8e5;
const hingeLength = 0.1;
const nodeI = new Node({ id: "pier-base", x: 0, y: 0, units });
const nodeJ = new Node({ id: "pier-top", x: 0, y: height, units });
const compressionMaterial = new CyclicMasonryCompressionMaterial({
  units,
  elasticModulus,
  compressiveStrength: 4000,
  peakStrain: 0.002,
  prePeakCurve: "linear",
  damageOnsetStrain: 0.0025,
  ultimateStrain: 0.01,
  residualStrengthRatio: 0.2,
  unloadingStiffnessDegradation: 0.3,
  strengthDegradation: 0.2,
  hingeLength,
});
const shearMaterial = new CyclicMasonryShearMaterial({
  units,
  shearModulus,
  diagonalTensionModel: new TurnsekSheppardModel({
    units,
    tensileStrength: 90,
    shearStressDistributionFactor: 1.2,
    damageCoefficient: 0.8,
    crushingReductionCoefficient: 0.5,
  }),
  slidingModel: new SlidingStrengthModel({
    units,
    cohesion: 100,
    frictionCoefficient: 0.35,
    residualCohesionRatio: 0.15,
  }),
  peakShearStrain: 0.003,
  ultimateShearStrain: 0.012,
  hardeningRatio: 0.03,
  residualStrengthRatio: 0.25,
  pinching: { enabled: true, factor: 0.35, recoveryRatio: 0.75 },
  stiffnessDegradation: {
    enabled: true,
    ductilityCoefficient: 0.25,
    energyCoefficient: 0.04,
  },
  strengthDegradation: {
    enabled: true,
    ductilityCoefficient: 0.18,
    energyCoefficient: 0.03,
  },
});
const element = new CyclicMasonryPier2D({
  id: "cyclic-pier-example",
  nodeI,
  nodeJ,
  units,
  height,
  width,
  thickness,
  elasticModulus,
  shearModulus,
  fiberCount: 24,
  hingeLength,
  compressionMaterial,
  shearMaterial,
  coupling: {
    useCurrentAxialForce: true,
    useCompressedLength: true,
    compressedLengthStrategy: "minimum",
    crushingShearReduction: true,
  },
});
const lateralDisplacements = [
  0,
  0.001,
  0.002,
  0.003,
  0.004,
  0.003,
  0.002,
  0.001,
  0,
  -0.001,
  -0.002,
  -0.003,
  -0.004,
  -0.003,
  -0.002,
  -0.001,
  0,
];
const result = new CyclicMasonryPierAnalysis2D().solve({
  element,
  axialCompression: 150,
  lateralDisplacements,
  tolerance: 2e-5,
});

if (process.argv.includes("--csv")) {
  console.log(cyclicMasonryPierHistoryToCsv(result.points));
} else {
  console.log(JSON.stringify(result, null, 2));
}

if (result.status !== "ok") {
  process.exitCode = 1;
}
