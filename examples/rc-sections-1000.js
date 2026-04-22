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
const targetFiberCount = 1000;

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

const round = (value, decimals = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;

const kN = (value) => round(value / 1e3, 3);
const kNm = (value) => round(value / 1e6, 3);
const mpA = (value) => round(value, 3);
const mm = (value) => round(value, 2);

function printTitle(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

function printUniaxialResistance(result) {
  const { outputs } = result;

  printTitle("ULS uniaxial resistance");
  console.table([
    {
      status: result.status,
      "Ned [kN]": kN(outputs.nEd),
      "Med [kNm]": kNm(outputs.mEd),
      "MxRd [kNm]": kNm(outputs.MxRd),
      "utilization [-]": round(result.utilizationRatio, 3),
      "x [mm]": mm(outputs.neutralAxisDepth),
      "residual N [kN]": kN(outputs.axialResidual),
      "compressed edge": outputs.compressedEdge,
    },
  ]);
  console.table([
    {
      "eps0 [-]": round(outputs.strainField.eps0, 8),
      "kappaY [1/mm]": round(outputs.strainField.kappaY, 10),
      "kappaZ [1/mm]": round(outputs.strainField.kappaZ, 10),
      "min eps [-]": round(outputs.extremes.minStrain, 8),
      "max eps [-]": round(outputs.extremes.maxStrain, 8),
    },
  ]);
}

function printBiaxialDomain(result) {
  const { outputs } = result;

  printTitle("ULS Mx-My domain");
  console.log(
    `Ned = ${kN(outputs.nEd)} kN, angles = ${outputs.angleCount}, fibers = ${outputs.fiberCount}`,
  );
  console.table(
    outputs.points.map((point) => ({
      "theta [deg]": round((point.theta * 180) / Math.PI, 1),
      "MxRd [kNm]": kNm(point.MxRd),
      "MyRd [kNm]": kNm(point.MyRd),
      "x [mm]": mm(point.neutralAxisDepth),
      "residual N [kN]": kN(point.axialResidual),
      converged: point.converged,
    })),
  );
}

function formatExtreme(extreme) {
  if (extreme == null) {
    return {
      "stress [MPa]": null,
      "y [mm]": null,
      "z [mm]": null,
    };
  }

  return {
    "stress [MPa]": mpA(extreme.value),
    "y [mm]": mm(extreme.y),
    "z [mm]": mm(extreme.z),
  };
}

function printServiceStress(result) {
  const { outputs } = result;

  printTitle("Service stress");
  console.table([
    {
      status: result.status,
      iterations: outputs.iterations,
      "Ned [kN]": kN(outputs.nEd),
      "MxEd [kNm]": kNm(outputs.mxEd),
      "MyEd [kNm]": kNm(outputs.myEd),
      "residual N [kN]": kN(outputs.residual.n),
      "residual Mx [kNm]": kNm(outputs.residual.mx),
      "residual My [kNm]": kNm(outputs.residual.my),
    },
  ]);
  console.table([
    {
      material: "concrete",
      resultant: kN(outputs.concrete.axialForce),
      extreme: "max compression",
      ...formatExtreme(outputs.concrete.maxCompression),
    },
    {
      material: "steel",
      resultant: kN(outputs.steel.axialForce),
      extreme: "max compression",
      ...formatExtreme(outputs.steel.maxCompression),
    },
    {
      material: "steel",
      resultant: kN(outputs.steel.axialForce),
      extreme: "max tension",
      ...formatExtreme(outputs.steel.maxTension),
    },
  ]);
}

function printUniaxialDomain(result) {
  const { outputs } = result;

  printTitle("ULS M-N domain");
  console.table([
    {
      "Nc,Rd cap [kN]": kN(outputs.axialCapacity.maximumCompression),
      "Nt,Rd [kN]": kN(outputs.axialCapacity.maximumTension),
      "Ac [mm2]": round(outputs.axialCapacity.concreteArea, 1),
      "As [mm2]": round(outputs.axialCapacity.reinforcementArea, 1),
      "fcd [MPa]": mpA(outputs.axialCapacity.fcd),
      "fyd [MPa]": mpA(outputs.axialCapacity.fyd),
      "N levels": outputs.nValues.length,
      points: outputs.points.length,
    },
  ]);
  console.log("N values [kN]:", outputs.nValues.map((value) => kN(value)));
  console.table(
    outputs.points.map((point) => ({
      "Ned [kN]": kN(point.nEd),
      "compressed edge": point.compressedEdge,
      "MxRd [kNm]": kNm(point.MxRd),
      "x [mm]": mm(point.neutralAxisDepth),
      "residual N [kN]": kN(point.axialResidual),
      converged: point.converged,
    })),
  );
}

const resistanceModel = new ReinforcedConcreteSectionModel({
  id: "rc-uls-01",
  section,
  analysisType: "uls-uniaxial-resistance",
  materials: { concreteMaterial, reinforcementMaterial },
  mesh: { targetFiberCount },
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
  mesh: { targetFiberCount },
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
  mesh: { targetFiberCount },
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
  mesh: { targetFiberCount },
  units,
  analysisSettings: {
    pointCount: 15,
  },
});

console.log(`Target concrete fibers: ${targetFiberCount}`);

const resistanceResult = application.run({ model: resistanceModel });
printUniaxialResistance(resistanceResult);

const biaxialResult = application.run({ model: biaxialModel });
printBiaxialDomain(biaxialResult);

const serviceResult = application.run({ model: serviceModel });
printServiceStress(serviceResult);

const mnDomainResult = application.run({ model: mnDomainModel });
printUniaxialDomain(mnDomainResult);
