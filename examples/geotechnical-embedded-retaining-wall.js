import {
  EmbeddedRetainingWallModel,
  EmbeddedRetainingWallScenario,
  GeotechnicalDesignSituation,
  GeotechnicalEmbeddedRetainingWallApplication,
  GroundModel,
  GroundProfile,
  PorePressureField2D,
  SoilMaterial,
  WallSoilReactionLaw,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const source = "illustrative project-assigned input; not a soil correlation";

const sand = new SoilMaterial({
  id: "sand",
  name: "Sand",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "sand-characteristic",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 32,
      cohesion: 0,
    },
    provenance: { source },
  }],
  angleUnits: "deg",
  units,
});

const denseSand = new SoilMaterial({
  id: "dense-sand",
  name: "Dense sand",
  unitWeight: { bulk: 19, saturated: 21 },
  parameterSets: [{
    id: "dense-sand-characteristic",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 38,
      cohesion: 0,
    },
    provenance: { source },
  }],
  angleUnits: "deg",
  units,
});

const profile = new GroundProfile({
  id: "excavation-profile",
  groundSurfaceElevation: 0,
  materials: [sand, denseSand],
  layers: [{
    id: "upper-sand",
    topElevation: 0,
    bottomElevation: -4,
    materialId: sand.id,
  }, {
    id: "lower-dense-sand",
    topElevation: -4,
    bottomElevation: -14,
    materialId: denseSand.id,
  }],
  groundwater: {
    model: "hydrostatic",
    waterTableElevation: -2,
    waterUnitWeight: 9.81,
  },
  units,
});

const porePressureField = PorePressureField2D.fromGroundProfile({
  profile,
  id: "hydrostatic-field",
});

const groundModel = new GroundModel({
  id: "excavation-ground",
  materials: [sand, denseSand],
  profiles: [profile],
  porePressureFields: [porePressureField],
  defaultProfileId: profile.id,
  defaultPorePressureFieldId: porePressureField.id,
  units,
});

const designSituation = new GeotechnicalDesignSituation({
  id: "excavation-sls",
  groundModel,
  limitState: "SLS",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  profileId: profile.id,
  porePressureFieldId: porePressureField.id,
  units,
});

const wall = new EmbeddedRetainingWallModel({
  id: "diaphragm-wall-strip",
  type: "continuous-wall-strip",
  topElevation: 0,
  toeElevation: -10,
  analysisWidth: 1,
  flexuralRigiditySegments: [{
    id: "upper-wall",
    topElevation: 0,
    bottomElevation: -5,
    flexuralRigidity: 220000,
    provenance: { source: "illustrative transformed wall section" },
  }, {
    id: "lower-wall",
    topElevation: -5,
    bottomElevation: -10,
    flexuralRigidity: 180000,
    provenance: { source: "illustrative transformed wall section" },
  }],
  units,
});

const upperLaw = new WallSoilReactionLaw({
  id: "upper-sand-wall-law",
  points: [
    { closureDisplacement: -0.03, effectivePressure: 5 },
    { closureDisplacement: 0, effectivePressure: 24 },
    { closureDisplacement: 0.02, effectivePressure: 70 },
    { closureDisplacement: 0.06, effectivePressure: 120 },
  ],
  extrapolation: "constant",
  provenance: { source },
  units,
});

const lowerLaw = new WallSoilReactionLaw({
  id: "lower-sand-wall-law",
  points: [
    { closureDisplacement: -0.03, effectivePressure: 15 },
    { closureDisplacement: 0, effectivePressure: 65 },
    { closureDisplacement: 0.02, effectivePressure: 160 },
    { closureDisplacement: 0.06, effectivePressure: 260 },
  ],
  extrapolation: "constant",
  provenance: { source },
  units,
});

const side = {
  profileId: profile.id,
  defaultPorePressureFieldId: porePressureField.id,
  curvesByLayer: {
    "upper-sand": {
      stations: [{ depth: 2, law: upperLaw }],
    },
    "lower-dense-sand": {
      stations: [{ depth: 7, law: lowerLaw }],
    },
  },
};

const scenario = new EmbeddedRetainingWallScenario({
  id: "supported-excavation",
  soilResponse: {
    model: "assigned-effective-pressure-displacement-curves",
    sides: { retained: side, excavation: side },
  },
  supports: [{
    id: "anchor-row-1",
    type: "ground-anchor",
    elevation: -2.5,
    stiffness: 15000,
    prestress: 80,
    behavior: "unilateral",
    actionDirection: "toward-retained-side",
    capacity: {
      maximumForce: 500,
      basis: "assigned-characteristic-example",
      provenance: { source },
    },
    provenance: { source },
  }],
  stages: [{
    id: "initial",
    retainedGroundElevation: 0,
    excavationGroundElevation: 0,
  }, {
    id: "first-excavation",
    retainedGroundElevation: 0,
    excavationGroundElevation: -3,
  }, {
    id: "anchor-installation",
    retainedGroundElevation: 0,
    excavationGroundElevation: -3,
    activeSupportIds: ["anchor-row-1"],
  }, {
    id: "final-excavation",
    retainedGroundElevation: 0,
    excavationGroundElevation: -6,
    activeSupportIds: ["anchor-row-1"],
  }],
  discretization: { maxElementLength: 0.5 },
  solver: {
    incrementsPerStage: 10,
    maxIterations: 60,
    relativeResidualTolerance: 1e-9,
  },
  units,
});

const result = new GeotechnicalEmbeddedRetainingWallApplication().run({
  groundModel,
  designSituation,
  wall,
  scenario,
  units,
});

const finalStage = result.outputs.finalStage;
console.log(JSON.stringify({
  status: result.status,
  finalStage: finalStage?.id,
  maximumDisplacement:
    result.outputs.demand?.maximumAbsoluteDisplacement?.displacement,
  maximumBendingMoment:
    result.outputs.demand?.maximumAbsoluteBendingMoment?.bendingMoment,
  maximumShear:
    result.outputs.demand?.maximumAbsoluteShearForce?.shearForce,
  finalSupportForces: finalStage?.response.supports.map((support) => ({
    id: support.supportId,
    status: support.status,
    force: support.scalarForce,
    utilizationRatio: support.utilizationRatio,
  })),
  forceResidual: finalStage?.equilibrium.forceResidual,
  momentResidual: finalStage?.equilibrium.momentResidual,
  convergence: finalStage?.convergence,
  warnings: result.warnings,
}, null, 2));
