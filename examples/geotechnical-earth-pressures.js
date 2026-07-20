import { GeotechnicalEarthPressureApplication } from
  "strutture-js/applications/geotechnical-earth-pressures";
import { createSoilMaterialFromType } from
  "strutture-js/catalogs/soil-types";
import { createSoilStructureInterfaceFromWallSurface } from
  "strutture-js/catalogs/wall-interface-types";
import { GroundProfile } from "strutture-js/domain/geotechnics";

const units = { force: "kN", length: "m" };
const sand = createSoilMaterialFromType({
  soilTypeId: "sandy-soil",
  id: "site-sand",
  name: "Site sand",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "characteristic-drained",
    basis: "characteristic",
    drainage: "drained",
    strength: { frictionAngle: 32, cohesion: 0 },
    provenance: { source: "site-investigation" },
  }],
  angleUnits: "deg",
  units,
});

const profile = GroundProfile.fromThicknesses({
  id: "retaining-section-a",
  groundSurfaceElevation: 10,
  materials: [sand],
  layers: [{ id: "sand-layer", thickness: 10, materialId: sand.id }],
  groundwater: {
    model: "hydrostatic",
    waterTableElevation: 4,
    waterUnitWeight: 9.81,
  },
  units,
});

const result = new GeotechnicalEarthPressureApplication().run({
  profile,
  state: "active",
  method: "rankine",
  surcharge: 10,
  units,
});

const dryProfile = GroundProfile.fromThicknesses({
  id: "retaining-section-b",
  groundSurfaceElevation: 10,
  materials: [sand],
  layers: [{ id: "sand-layer", thickness: 10, materialId: sand.id }],
  units,
});
const formedConcreteInterface =
  createSoilStructureInterfaceFromWallSurface({
    id: "formed-concrete-medium-sand",
    wallSurfaceTypeId: "formed-concrete",
    soilInterfaceClassId: "medium-sand",
  });
const inclinedSeismicResult =
  new GeotechnicalEarthPressureApplication().run({
    profile: dryProfile,
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    geometry: {
      wallInclinationFromVertical: 6,
      backfillInclination: 4,
      angleUnits: "deg",
    },
    interface: formedConcreteInterface,
    allowIndicativeValues: true,
    seismic: { kh: 0.1, kv: 0 },
    units,
  });

console.log(JSON.stringify({
  status: result.status,
  totalResultant:
    result.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
  applicationElevation:
    result.outputs.diagram.resultants.totalNormal.applicationElevation,
  units: result.outputs.diagram.units,
  warnings: result.warnings,
  inclinedSeismic: {
    status: inclinedSeismicResult.status,
    thrust:
      inclinedSeismicResult.outputs.resultants.seismicTotal.magnitude,
    interface: inclinedSeismicResult.outputs.interface,
    warnings: inclinedSeismicResult.warnings,
  },
}, null, 2));
