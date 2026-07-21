import {
  AxialPileLoadScenario,
  DeepFoundationModel,
  GeotechnicalDeepFoundationApplication,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  SoilMaterial,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

const sand = new SoilMaterial({
  id: "sand",
  name: "Dense sand",
  unitWeight: { bulk: 19, saturated: 21 },
  parameterSets: [{
    id: "sand-characteristic",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 35,
      cohesion: 0,
    },
    provenance: { source: "project-ground-investigation" },
  }],
  angleUnits: "deg",
  units,
});

const profile = new GroundProfile({
  id: "pile-profile",
  groundSurfaceElevation: 0,
  materials: [sand],
  layers: [{
    id: "sand-layer",
    topElevation: 0,
    bottomElevation: -25,
    materialId: sand.id,
  }],
  groundwater: {
    model: "hydrostatic",
    waterTableElevation: -3,
    waterUnitWeight: 9.81,
  },
  units,
});

const groundModel = new GroundModel({
  id: "pile-ground",
  materials: [sand],
  profiles: [profile],
  units,
});

const designSituation = new GeotechnicalDesignSituation({
  id: "pile-uls",
  groundModel,
  limitState: "ULS",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  profileId: profile.id,
  units,
});

const pile = new DeepFoundationModel({
  id: "P1",
  geometry: { model: "circular", diameter: 0.8 },
  placement: {
    x: 0,
    y: 0,
    headElevation: 0.5,
    soilContactTopElevation: 0,
    toeElevation: -15,
  },
  construction: {
    installationMethod: "driven-precast",
    structuralMaterial: "reinforced-concrete",
    displacementClass: "displacement",
    baseCondition: "closed-ended",
  },
  units,
});

const scenario = new AxialPileLoadScenario({
  id: "P1-compression",
  direction: "compression",
  action: {
    axialForce: 900,
    basis: "design",
    referencePoint: "pile-head",
    includesPileSelfWeight: true,
  },
  shaftResistanceByLayer: {
    "sand-layer": {
      method: "effective-stress",
      coefficientModel: "k-tan-delta",
      lateralEarthPressureCoefficient: 1,
      interfaceFrictionAngle: 24,
      angleUnits: "deg",
      maximumUnitResistance: 120,
      provenance: {
        source: "project pile method; coefficients assigned for this example",
      },
    },
  },
  baseResistance: {
    method: "effective-stress-nq",
    bearingLayerId: "sand-layer",
    bearingCapacityFactor: 25,
    maximumUnitResistance: 5000,
    provenance: {
      source: "project pile method; coefficients assigned for this example",
    },
  },
  resistanceConversion: {
    model: "component-divisors",
    shaftDivisor: 1.5,
    baseDivisor: 1.8,
    overallDivisor: 1,
    provenance: {
      source: "illustrative project conversion; not a normative preset",
    },
  },
  units,
});

const result = new GeotechnicalDeepFoundationApplication().run({
  groundModel,
  designSituation,
  pile,
  scenario,
  units,
});

console.log(JSON.stringify({
  status: result.status,
  shaftResistance: result.outputs.shaft.resistance,
  baseResistance: result.outputs.base.resistance,
  calculatedUltimateResistance:
    result.outputs.capacity.calculatedUltimateResistance,
  convertedResistance: result.outputs.capacity.convertedResistance,
  verification: result.outputs.verification,
  warnings: result.warnings,
}, null, 2));
