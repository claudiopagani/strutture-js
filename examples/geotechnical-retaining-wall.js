import { GeotechnicalRetainingWallApplication } from
  "strutture-js/applications/geotechnical-retaining-walls";
import {
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  RetainingWallLoadScenario,
  RetainingWallModel,
  SoilMaterial,
  SoilStructureInterface,
} from "strutture-js/domain/geotechnics";

const units = { force: "kN", length: "m" };
const sand = new SoilMaterial({
  id: "site-sand",
  name: "Site sand",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "characteristic-drained",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
    provenance: { source: "site-investigation" },
  }],
  angleUnits: "deg",
  units,
});
const retainedProfile = new GroundProfile({
  id: "retained-profile",
  groundSurfaceElevation: 4.5,
  materials: [sand],
  layers: [{
    id: "retained-sand",
    topElevation: 4.5,
    bottomElevation: -20,
    materialId: sand.id,
  }],
  groundwater: { model: "none" },
  units,
});
const bearingProfile = new GroundProfile({
  id: "bearing-profile",
  groundSurfaceElevation: 0.5,
  materials: [sand],
  layers: [{
    id: "bearing-sand",
    topElevation: 0.5,
    bottomElevation: -20,
    materialId: sand.id,
  }],
  groundwater: { model: "none" },
  units,
});
const groundModel = new GroundModel({
  id: "wall-ground",
  materials: [sand],
  profiles: [retainedProfile, bearingProfile],
  units,
});
const designSituation = new GeotechnicalDesignSituation({
  id: "persistent-wall-uls",
  groundModel,
  limitState: "ULS",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  profileId: retainedProfile.id,
  units,
});
const wall = RetainingWallModel.cantilever({
  id: "cantilever-wall",
  geometry: {
    toeLength: 1,
    heelLength: 2,
    baseThickness: 0.5,
    stemHeight: 4,
    stemBaseThickness: 0.4,
    stemTopThickness: 0.2,
    retainedFaceInclinationFromVertical: 0,
  },
  concreteUnitWeight: 25,
  placement: { originX: 0, baseElevation: 0 },
  angleUnits: "deg",
  units,
});
const baseInterface = new SoilStructureInterface({
  id: "formed-concrete-base",
  wallSurface: {
    typeId: "formed-concrete",
    materialType: "concrete",
    finish: "formed",
  },
  parameterSets: [{
    id: "characteristic-base-interface",
    basis: "characteristic",
    model: "assigned-angle",
    frictionAngle: 20,
    angleUnits: "deg",
    provenance: { source: "project-interface-selection" },
  }],
});
const scenario = new RetainingWallLoadScenario({
  id: "static-drained",
  retainedSide: {
    profileId: retainedProfile.id,
    state: "active",
    method: "rankine",
    surcharge: 0,
  },
  baseUplift: { model: "linear-hydrostatic" },
  foundation: {
    profileId: bearingProfile.id,
    baseInterface,
    bearing: {
      enabled: true,
      selection: "minimum",
    },
  },
  criteria: {
    minimumSlidingFactorOfSafety: 1.5,
    minimumOverturningFactorOfSafety: 1.5,
  },
  units,
});
const result = new GeotechnicalRetainingWallApplication().run({
  groundModel,
  designSituation,
  wall,
  scenario,
  units,
});

console.log(JSON.stringify({
  status: result.status,
  equilibrium: result.outputs.equilibrium,
  sliding: result.outputs.sliding,
  overturning: result.outputs.overturning,
  contact: result.outputs.contact,
  bearing: result.outputs.foundation.bearing.outputs?.bearing ?? null,
  structuralCoupling: result.outputs.structuralCoupling,
  warnings: result.warnings,
}, null, 2));
