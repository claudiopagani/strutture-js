import {
  DeepFoundationModel,
  GeotechnicalDesignSituation,
  GeotechnicalLateralPileApplication,
  GroundModel,
  GroundProfile,
  LateralPileResponseScenario,
  PileTransferLaw,
  SoilMaterial,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

function material({ id, name, frictionAngle }) {
  return new SoilMaterial({
    id,
    name,
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [{
      id: `${id}-characteristic`,
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle,
        cohesion: 0,
      },
      provenance: { source: "illustrative ground characterization" },
    }],
    angleUnits: "deg",
    units,
  });
}

function pyLaw(id, points) {
  return new PileTransferLaw({
    id,
    points,
    extrapolation: "constant",
    provenance: {
      source:
        "illustrative assigned p-y points; replace with project-specific sourced curves",
    },
    units,
  });
}

const upperSand = material({
  id: "upper-sand",
  name: "Medium sand",
  frictionAngle: 31,
});
const lowerSand = material({
  id: "lower-sand",
  name: "Dense sand",
  frictionAngle: 36,
});

const profile = new GroundProfile({
  id: "py-profile",
  groundSurfaceElevation: 0,
  materials: [upperSand, lowerSand],
  layers: [{
    id: "upper-layer",
    topElevation: 0,
    bottomElevation: -4,
    materialId: upperSand.id,
  }, {
    id: "lower-layer",
    topElevation: -4,
    bottomElevation: -20,
    materialId: lowerSand.id,
  }],
  groundwater: { model: "none" },
  units,
});

const groundModel = new GroundModel({
  id: "py-ground",
  materials: [upperSand, lowerSand],
  profiles: [profile],
  units,
});

const designSituation = new GeotechnicalDesignSituation({
  id: "py-sls",
  groundModel,
  limitState: "SLS",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  profileId: profile.id,
  units,
});

const pile = new DeepFoundationModel({
  id: "PY1",
  geometry: { model: "circular", diameter: 1 },
  placement: {
    headElevation: 0.5,
    soilContactTopElevation: 0,
    toeElevation: -12,
  },
  construction: {
    installationMethod: "assigned-example-method",
    structuralMaterial: "reinforced-concrete",
    displacementClass: "not-classified",
  },
  units,
});

const scenario = new LateralPileResponseScenario({
  id: "PY1-static-response",
  action: {
    lateralShear: 100,
    overturningMoment: 50,
    referencePoint: "pile-head",
    basis: "service-action-example",
  },
  flexuralRigidity: {
    model: "constant",
    value: 250000,
    provenance: { source: "illustrative uncracked pile EI" },
  },
  headCondition: { translation: "free", rotation: "free" },
  tipCondition: { translation: "free", rotation: "free" },
  soilResponse: {
    model: "assigned-py-curves",
    curvesByLayer: {
      "upper-layer": {
        stations: [{
          depth: 1,
          law: pyLaw("upper-1m", [
            { displacement: 0, resistancePerLength: 0 },
            { displacement: 0.005, resistancePerLength: 20 },
            { displacement: 0.02, resistancePerLength: 55 },
            { displacement: 0.06, resistancePerLength: 70 },
          ]),
        }, {
          depth: 3,
          law: pyLaw("upper-3m", [
            { displacement: 0, resistancePerLength: 0 },
            { displacement: 0.005, resistancePerLength: 45 },
            { displacement: 0.02, resistancePerLength: 110 },
            { displacement: 0.06, resistancePerLength: 140 },
          ]),
        }],
      },
      "lower-layer": {
        stations: [{
          depth: 5,
          law: pyLaw("lower-5m", [
            { displacement: 0, resistancePerLength: 0 },
            { displacement: 0.005, resistancePerLength: 80 },
            { displacement: 0.02, resistancePerLength: 190 },
            { displacement: 0.06, resistancePerLength: 240 },
          ]),
        }, {
          depth: 10,
          law: pyLaw("lower-10m", [
            { displacement: 0, resistancePerLength: 0 },
            { displacement: 0.005, resistancePerLength: 140 },
            { displacement: 0.02, resistancePerLength: 300 },
            { displacement: 0.06, resistancePerLength: 360 },
          ]),
        }],
      },
    },
  },
  discretization: { maxElementLength: 0.5 },
  solver: {
    loadSteps: 10,
    maxIterations: 50,
    relativeResidualTolerance: 1e-8,
    displacementTolerance: 1e-10,
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
  head: result.outputs.response?.pileHead,
  maximumMoment:
    result.outputs.response?.extrema.maximumAbsoluteBendingMoment,
  maximumShear: result.outputs.response?.extrema.maximumAbsoluteShearForce,
  equilibrium: result.outputs.equilibrium,
  convergence: result.outputs.convergence,
  warnings: result.warnings,
}, null, 2));
