import {
  GeotechnicalShallowFoundationApplication,
} from "strutture-js/applications/geotechnical-shallow-foundations";
import {
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  SoilMaterial,
  calculateShallowFoundationDifferentialMovement,
} from "strutture-js/domain/geotechnics";

const units = { force: "kN", length: "m" };
const soil = new SoilMaterial({
  id: "sand",
  name: "Sand with site-specific secant stiffness",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "drained-strength",
    basis: "representative",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 32,
      cohesion: 0,
    },
  }],
  deformationParameterSets: [{
    id: "drained-secant-elastic",
    basis: "representative",
    drainage: "drained",
    model: "isotropic-elastic",
    youngModulus: 30000,
    poissonRatio: 0.3,
    modulusDefinition: "secant",
    settlementComponent: "immediate",
    stressRange: [0, 300],
    strainRange: [0, 0.01],
    provenance: {
      source: "Site-specific interpreted static stiffness",
    },
  }],
  angleUnits: "deg",
  units,
});

const profile = GroundProfile.fromThicknesses({
  id: "site-profile",
  groundSurfaceElevation: 0,
  materials: [soil],
  layers: [{
    id: "sand-layer",
    thickness: 20,
    materialId: soil.id,
  }],
  groundwater: { model: "none" },
  units,
});
const groundModel = new GroundModel({
  id: "site-ground",
  materials: [soil],
  profiles: [profile],
  units,
});
const designSituation = new GeotechnicalDesignSituation({
  id: "persistent-sls",
  groundModel,
  limitState: "SLS",
  timeCondition: "short-term",
  drainageCondition: "drained",
  profileId: profile.id,
  parameterSelection: {
    deformationByLayer: {
      "sand-layer": "drained-secant-elastic",
    },
  },
  units,
});

function runFoundation({ id, x, verticalForce, momentX = 0, momentY = 0 }) {
  const foundation = new ShallowFoundationModel({
    id,
    shape: "rectangular",
    geometry: { width: 2, length: 4 },
    placement: { x, y: 0, baseElevation: -1 },
    units,
  });
  const actionState = new ShallowFoundationActionState({
    id: `${id}-sls-actions`,
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: { verticalForce, momentX, momentY },
    units,
  });
  return new GeotechnicalShallowFoundationApplication().run({
    groundModel,
    designSituation,
    foundation,
    actionState,
    method: "nist-pais-kausel-elastic-2012",
    criteria: {
      maximumSettlement: 0.025,
      maximumRotation: 1 / 500,
    },
    analysisSettings: {
      embedmentContact: "surface-equivalent",
      elasticAveragingDepth: 2,
    },
    units,
  });
}

const first = runFoundation({
  id: "F1",
  x: 0,
  verticalForce: 1000,
  momentX: 80,
  momentY: 40,
});
const second = runFoundation({
  id: "F2",
  x: 6,
  verticalForce: 1200,
  momentX: 60,
  momentY: 20,
});
const differential = calculateShallowFoundationDifferentialMovement({
  firstMovement: first.outputs.movementState,
  secondMovement: second.outputs.movementState,
  criteria: {
    maximumDifferentialSettlement: 0.015,
    maximumAngularDistortion: 1 / 500,
  },
  units,
});

console.log(JSON.stringify({
  first: {
    status: first.status,
    settlement: first.outputs.settlement,
    rotation: first.outputs.rotation,
    staticSecantStiffness: first.outputs.structuralCoupling.staticSecantStiffness,
  },
  second: {
    status: second.status,
    settlement: second.outputs.settlement,
    rotation: second.outputs.rotation,
  },
  differential,
}, null, 2));
