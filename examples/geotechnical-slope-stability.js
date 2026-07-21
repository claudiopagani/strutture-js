import { GeotechnicalSlopeStabilityApplication } from
  "strutture-js/applications/geotechnical-slope-stability";
import {
  CircularSlipSurface2D,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundAnchorStabilityAction2D,
  GroundSection2D,
  PorePressureField2D,
  SoilMaterial,
} from "strutture-js/domain/geotechnics";

const units = { force: "kN", length: "m" };
const soil = new SoilMaterial({
  id: "slope-soil",
  name: "Site soil",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "characteristic-drained",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 25,
      cohesion: 10,
    },
    provenance: { source: "site-investigation" },
  }, {
    id: "seismic-drained",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
    provenance: { source: "site-investigation-seismic-selection" },
  }],
  defaultParameterSetId: "characteristic-drained",
  angleUnits: "deg",
  units,
});

const section = new GroundSection2D({
  id: "slope-section",
  surface: {
    points: [{ x: 0, z: 10 }, { x: 10, z: 0 }, { x: 20, z: 0 }],
  },
  zones: [{
    id: "slope-zone",
    materialId: soil.id,
    polygon: [
      { x: 0, z: -20 },
      { x: 20, z: -20 },
      { x: 20, z: 0 },
      { x: 10, z: 0 },
      { x: 0, z: 10 },
    ],
  }],
  units,
});
const porePressureField = new PorePressureField2D({
  id: "slope-phreatic-field",
  model: "phreatic-line",
  phreaticLine: {
    points: [{ x: 0, z: 7 }, { x: 10, z: -3 }, { x: 20, z: -3 }],
  },
  waterUnitWeight: 9.81,
  units,
});
const dryField = new PorePressureField2D({
  id: "slope-dry-field",
  model: "none",
  units,
});
const groundModel = new GroundModel({
  id: "slope-ground-model",
  materials: [soil],
  sections: [section],
  porePressureFields: [porePressureField, dryField],
  defaultSectionId: section.id,
  defaultPorePressureFieldId: porePressureField.id,
  units,
});
const designSituation = new GeotechnicalDesignSituation({
  id: "persistent-drained-slope",
  groundModel,
  situationType: "persistent",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  sectionId: section.id,
  porePressureFieldId: porePressureField.id,
  units,
});
const seismicSituation = new GeotechnicalDesignSituation({
  id: "seismic-drained-slope",
  groundModel,
  situationType: "seismic",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  sectionId: section.id,
  porePressureFieldId: dryField.id,
  parameterSelection: {
    byMaterial: { [soil.id]: "seismic-drained" },
  },
  seismic: {
    model: "pseudostatic",
    kh: 0.1,
    kv: 0,
  },
  units,
});

const result = new GeotechnicalSlopeStabilityApplication().run({
  groundModel,
  designSituation,
  mode: "critical-surface-search",
  search: {
    entryX: { minimum: 0, maximum: 2, count: 4 },
    exitX: { minimum: 8, maximum: 10, count: 4 },
    sagitta: { minimum: 1, maximum: 2.5, count: 4 },
    refinementIterations: 4,
    retainCandidates: 5,
  },
  sliceCount: 40,
  surfaceSurcharges: [{
    id: "crest-surcharge",
    intensity: 10,
    minimumX: 0,
    maximumX: 3,
  }],
  units,
});
const assignedSurface = CircularSlipSurface2D.fromChordAndSagitta({
  id: "assigned-seismic-circle",
  entry: { x: 0, z: 10 },
  exit: { x: 10, z: 0 },
  sagitta: 2,
  units,
});
const pseudostaticResult = new GeotechnicalSlopeStabilityApplication().run({
  groundModel,
  designSituation: seismicSituation,
  slipSurface: assignedSurface,
  sliceCount: 40,
  units,
});
const inclination = 10 * Math.PI / 180;
const anchorPoint = (distance) => ({
  x: 8 - distance * Math.cos(inclination),
  z: 2 - distance * Math.sin(inclination),
});
const groundAnchor = new GroundAnchorStabilityAction2D({
  id: "slope-anchor-row-1",
  head: anchorPoint(0),
  bondStart: anchorPoint(1),
  bondEnd: anchorPoint(5),
  designTendonForce: 10,
  horizontalSpacing: 1,
  sourceVerificationStatus: "ok",
  units,
  provenance: { source: "verified-ground-anchor-example" },
});
const anchoredResult = new GeotechnicalSlopeStabilityApplication().run({
  groundModel,
  designSituation,
  slipSurface: assignedSurface,
  groundAnchors: [groundAnchor],
  sliceCount: 40,
  units,
});

console.log(JSON.stringify({
  staticSearch: {
    status: result.status,
    factorOfSafety: result.outputs.factorOfSafety,
    criticalSurface: result.outputs.criticalSurface,
    search: result.outputs.search,
    comparison: result.outputs.comparison,
    warnings: result.warnings,
  },
  pseudostaticAssignedSurface: {
    status: pseudostaticResult.status,
    method: pseudostaticResult.outputs.method,
    factorOfSafety: pseudostaticResult.outputs.factorOfSafety,
    seismicLoading:
      pseudostaticResult.outputs.discretization.metadata.seismicLoading,
    warnings: pseudostaticResult.warnings,
  },
  anchoredAssignedSurface: {
    status: anchoredResult.status,
    method: anchoredResult.outputs.method,
    factorOfSafety: anchoredResult.outputs.factorOfSafety,
    interactions: anchoredResult.outputs.groundAnchors?.interactions,
    warnings: anchoredResult.warnings,
  },
}, null, 2));
