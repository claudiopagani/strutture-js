import {
  GeotechnicalDesignSituation,
  GeotechnicalGroundAnchorApplication,
  GroundAnchorDesignScenario,
  GroundAnchorModel,
  GroundAnchorStabilityAction2D,
  GroundModel,
  GroundSection2D,
  SoilMaterial,
} from "strutture-js";

const units = { force: "kN", length: "m" };
const provenance = { source: "Ground-anchor example input" };

const sand = new SoilMaterial({
  id: "medium-dense-sand",
  name: "Medium dense sand",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [{
    id: "sand-characteristic",
    basis: "characteristic",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
    provenance,
  }],
  angleUnits: "deg",
  units,
});

const section = new GroundSection2D({
  id: "anchor-section",
  surface: { points: [{ x: 0, z: 5 }, { x: 25, z: 5 }] },
  zones: [{
    id: "sand-zone",
    materialId: sand.id,
    polygon: [
      { x: 0, z: -20 },
      { x: 25, z: -20 },
      { x: 25, z: 5 },
      { x: 0, z: 5 },
    ],
  }],
  units,
});

const groundModel = new GroundModel({
  id: "anchor-ground",
  materials: [sand],
  sections: [section],
  defaultSectionId: section.id,
  units,
});

const designSituation = new GeotechnicalDesignSituation({
  id: "anchor-sls",
  groundModel,
  limitState: "SLS",
  drainageCondition: "drained",
  sectionId: section.id,
  units,
});

const anchor = new GroundAnchorModel({
  id: "anchor-row-1",
  head: { x: 0, z: 0 },
  inclination: 15,
  freeLength: 6,
  bondLength: 6,
  horizontalSpacing: 2,
  groutBodyDiameter: 0.15,
  tendon: {
    type: "strand",
    steelArea: 0.001,
    elasticModulus: 195e6,
    specifiedMinimumTensileStrength: 1.86e6,
    provenance,
  },
  corrosionProtection: {
    class: "I",
    details: {
      anchorage: { trumpet: true, exposed: false },
      unbondedLength: {
        system: "encapsulated-grout-filled-strand-sheaths",
      },
      bondLength: { system: "grout-filled-encapsulation" },
    },
    provenance,
  },
  anchorage: {
    tensileCapacity: { value: 1000, provenance },
    tendonGroutBondCapacity: { value: 1000, provenance },
  },
  units,
});

const scenario = new GroundAnchorDesignScenario({
  id: "anchor-design",
  demand: {
    source: "assigned-horizontal-line-load",
    horizontalLineLoad: 150,
    provenance,
  },
  lockOffLoadFactor: 0.9,
  testLoadFactor: 1.33,
  criticalFailureSurface: {
    model: "rankine-active-wedge",
    frictionAngle: 30,
    excavationBaseElevation: -5,
    wallHeight: 5,
    provenance,
  },
  bondResistanceByZone: {
    "sand-zone": {
      model: "fhwa-presumptive",
      catalogId: "sand-medium-dense",
    },
  },
  corrosionEnvironment: {
    serviceLife: "permanent",
    aggressivity: "aggressive",
    consequencesOfFailure: "serious",
    higherProtectionCost: "significant",
    provenance,
  },
  units,
});

const result = new GeotechnicalGroundAnchorApplication().run({
  groundModel,
  designSituation,
  anchor,
  scenario,
  units,
});
const stabilityAction =
  GroundAnchorStabilityAction2D.fromGroundAnchorResult(result);

console.log(JSON.stringify({
  status: result.status,
  designLoad: result.outputs.demand?.designLoad,
  bondCapacity: result.outputs.capacity?.groundBond?.allowableCapacity,
  utilizationRatio: result.outputs.utilizationRatio,
  checks: result.outputs.checks,
  globalStabilityAction: stabilityAction.toJSON(),
  warnings: result.warnings,
}, null, 2));
