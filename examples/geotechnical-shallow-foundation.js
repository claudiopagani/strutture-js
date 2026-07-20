import { GeotechnicalShallowFoundationApplication } from
  "strutture-js/applications/geotechnical-shallow-foundations";
import { createSoilStructureInterfaceFromWallSurface } from
  "strutture-js/catalogs/wall-interface-types";
import {
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  SoilMaterial,
} from "strutture-js/domain/geotechnics";

const units = { force: "kN", length: "m" };
const sand = new SoilMaterial({
  id: "foundation-sand",
  name: "Foundation sand",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "representative-drained",
    basis: "representative",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 32,
      cohesion: 0,
    },
    provenance: { source: "site-investigation" },
  }],
  angleUnits: "deg",
  units,
});
const profile = GroundProfile.fromThicknesses({
  id: "foundation-profile",
  groundSurfaceElevation: 0,
  materials: [sand],
  layers: [{
    id: "sand-layer",
    thickness: 12,
    materialId: sand.id,
  }],
  groundwater: {
    model: "hydrostatic",
    waterTableElevation: -2,
    waterUnitWeight: 9.81,
  },
  units,
});
const groundModel = new GroundModel({
  id: "foundation-ground-model",
  materials: [sand],
  profiles: [profile],
  units,
});
const baseInterface = createSoilStructureInterfaceFromWallSurface({
  id: "footing-base-interface",
  wallSurfaceTypeId: "rough-concrete-cast-against-ground",
  soilInterfaceClassId: "medium-sand",
});
const designSituation = new GeotechnicalDesignSituation({
  id: "persistent-uls",
  groundModel,
  situationType: "persistent",
  limitState: "ULS",
  drainageCondition: "drained",
  profileId: profile.id,
  parameterSelection: {
    byLayer: { "sand-layer": "representative-drained" },
    byInterface: {
      "footing-base-interface": baseInterface.defaultParameterSetId,
    },
  },
  units,
});
const foundation = new ShallowFoundationModel({
  id: "isolated-footing-f1",
  shape: "rectangular",
  geometry: { width: 2, length: 3 },
  placement: { x: 0, y: 0, baseElevation: -1 },
  units,
});
const actionState = new ShallowFoundationActionState({
  id: "uls-resultant-at-base",
  basis: "total",
  resultantScope: "total-at-foundation-base",
  actions: {
    verticalForce: 1100,
    horizontalX: 150,
    horizontalY: 0,
    momentX: 50,
    momentY: 80,
  },
  units,
});

const result = new GeotechnicalShallowFoundationApplication().run({
  groundModel,
  designSituation,
  foundation,
  actionState,
  bearingSelection: "minimum",
  sliding: {
    interface: baseInterface,
    drainedAdhesionRatio: 0,
  },
  units,
});

console.log(JSON.stringify({
  status: result.status,
  effectiveGeometry: result.outputs.effectiveGeometry,
  bearing: {
    demand: result.outputs.bearing.demand,
    selectedCapacity:
      result.outputs.bearing.selectedUltimateGrossBearingPressure,
    factorOfSafety: result.outputs.bearing.factorOfSafety,
    methodCapacities: result.outputs.bearing.methodCapacities,
  },
  sliding: result.outputs.sliding,
  structuralCoupling: result.outputs.structuralCoupling,
  warnings: result.warnings,
}, null, 2));
