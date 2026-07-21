import {
  DeepFoundationModel,
  GeotechnicalDesignSituation,
  GeotechnicalLateralPileApplication,
  GroundModel,
  GroundProfile,
  LateralPileLoadScenario,
  SoilMaterial,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

const sand = new SoilMaterial({
  id: "lateral-sand",
  name: "Homogeneous sand",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "lateral-sand-characteristic",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
    provenance: { source: "illustrative project characterization" },
  }],
  angleUnits: "deg",
  units,
});

const profile = new GroundProfile({
  id: "lateral-pile-profile",
  groundSurfaceElevation: 0,
  materials: [sand],
  layers: [{
    id: "homogeneous-sand",
    topElevation: 0,
    bottomElevation: -20,
    materialId: sand.id,
  }],
  groundwater: { model: "none" },
  units,
});

const groundModel = new GroundModel({
  id: "lateral-pile-ground",
  materials: [sand],
  profiles: [profile],
  units,
});

const designSituation = new GeotechnicalDesignSituation({
  id: "lateral-pile-uls",
  groundModel,
  limitState: "ULS",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  profileId: profile.id,
  units,
});

const pile = new DeepFoundationModel({
  id: "LP1",
  geometry: { model: "circular", diameter: 1 },
  placement: {
    headElevation: 0,
    soilContactTopElevation: 0,
    toeElevation: -5,
  },
  construction: {
    installationMethod: "assigned-example-method",
    structuralMaterial: "reinforced-concrete",
    displacementClass: "not-classified",
  },
  units,
});

const scenario = new LateralPileLoadScenario({
  id: "LP1-static-lateral",
  soilBranch: "cohesionless-drained",
  action: {
    lateralShear: 100,
    overturningMoment: 50,
    basis: "design",
    referencePoint: "groundline-at-pile-axis",
  },
  behaviorAssertion: {
    classification: "short-rigid",
    basis: "project-rigidity-assessment",
    provenance: { source: "illustrative project assessment" },
  },
  resistanceConversion: {
    model: "soil-reaction-factor",
    factor: 0.8,
    provenance: {
      source: "illustrative project factor; not a normative preset",
    },
  },
  units,
});

const result = new GeotechnicalLateralPileApplication().run({
  groundModel,
  designSituation,
  pile,
  scenario,
  units,
});

console.log(JSON.stringify({
  status: result.status,
  nominalCapacity: result.outputs.capacity.nominalLateralResistance,
  convertedCapacity: result.outputs.capacity.convertedLateralResistance,
  requiredEmbedment:
    result.outputs.mechanism.selectedResponse.requiredEmbedment,
  maximumPileMoment:
    result.outputs.structuralCoupling.actionEffects.maximumPileMoment,
  verification: result.outputs.verification,
  responseMode: result.outputs.structuralCoupling.responseMode,
}, null, 2));
