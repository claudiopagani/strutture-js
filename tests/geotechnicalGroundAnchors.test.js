import test from "node:test";
import assert from "node:assert/strict";

import {
  GROUND_ANCHOR_DESIGN_RESULT_SCHEMA_VERSION,
  GeotechnicalDesignSituation,
  GeotechnicalGroundAnchorApplication,
  GroundAnchorAnalysis,
  GroundAnchorDesignScenario,
  GroundAnchorModel,
  GroundAnchorStabilityAction2D,
  GroundModel,
  GroundSection2D,
  SoilMaterial,
  getGroundAnchorBondCatalogEntry,
  groundAnchorDemandFromEmbeddedWallResult,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const source = "independent ground-anchor test input";

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function fixture() {
  const sand = new SoilMaterial({
    id: "anchor-sand",
    name: "Anchor sand",
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
      provenance: { source },
    }],
    angleUnits: "deg",
    units,
  });
  const rock = new SoilMaterial({
    id: "anchor-rock",
    name: "Anchor rock",
    unitWeight: { bulk: 22, saturated: 22 },
    parameterSets: [{
      id: "rock-characteristic",
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 38,
        cohesion: 50,
      },
      provenance: { source },
    }],
    angleUnits: "deg",
    units,
  });
  const section = new GroundSection2D({
    id: "anchor-section",
    surface: { points: [{ x: 0, z: 3 }, { x: 30, z: 3 }] },
    zones: [{
      id: "sand-zone",
      materialId: sand.id,
      polygon: [
        { x: 0, z: -2.2 },
        { x: 30, z: -2.2 },
        { x: 30, z: 3 },
        { x: 0, z: 3 },
      ],
    }, {
      id: "rock-zone",
      materialId: rock.id,
      polygon: [
        { x: 0, z: -10 },
        { x: 30, z: -10 },
        { x: 30, z: -2.2 },
        { x: 0, z: -2.2 },
      ],
    }],
    units,
  });
  const groundModel = new GroundModel({
    id: "anchor-ground",
    materials: [sand, rock],
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
  return { groundModel, designSituation, section };
}

function anchor(overrides = {}) {
  return new GroundAnchorModel({
    id: "anchor-1",
    head: { x: 0, z: 0 },
    inclination: 15,
    freeLength: 6,
    bondLength: 6,
    horizontalSpacing: 2,
    groutBodyDiameter: 0.15,
    tendon: {
      type: "strand",
      steelArea: 0.0014,
      elasticModulus: 195e6,
      specifiedMinimumTensileStrength: 1e6,
      provenance: { source },
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
      provenance: { source },
    },
    anchorage: {
      tensileCapacity: { value: 1200, provenance: { source } },
      tendonGroutBondCapacity: { value: 1200, provenance: { source } },
    },
    units,
    ...overrides,
  });
}

function scenario(overrides = {}) {
  return new GroundAnchorDesignScenario({
    id: "anchor-design",
    demand: {
      source: "assigned-tendon-load",
      designLoad: 300,
      provenance: { source },
    },
    lockOffLoadFactor: 0.9,
    testLoadFactor: 1.33,
    criticalFailureSurface: {
      model: "rankine-active-wedge",
      frictionAngle: 30,
      excavationBaseElevation: -5,
      wallHeight: 5,
      provenance: { source },
    },
    bondResistanceByZone: {
      "sand-zone": {
        model: "fhwa-presumptive",
        catalogId: "sand-medium-dense",
      },
      "rock-zone": {
        model: "fhwa-presumptive",
        catalogId: "sandstone",
      },
    },
    corrosionEnvironment: {
      serviceLife: "permanent",
      aggressivity: "aggressive",
      consequencesOfFailure: "serious",
      higherProtectionCost: "significant",
      provenance: { source },
    },
    testing: {
      jackLength: 0.5,
      records: [{
        id: "performance-1",
        type: "performance",
        alignmentLoad: 20,
        testLoad: 399,
        initialLiftOffLoad: 270,
        elasticMovementAtTestLoad: 0.008,
        holds: [{
          load: 399,
          observations: [
            { timeMinutes: 1, movement: 0.0100 },
            { timeMinutes: 6, movement: 0.0105 },
            { timeMinutes: 10, movement: 0.0108 },
          ],
        }],
        provenance: { source },
      }],
    },
    units,
    ...overrides,
  });
}

test("ground-anchor design resolves a stratified bond and field acceptance data", () => {
  const { groundModel, designSituation } = fixture();
  const result = new GroundAnchorAnalysis().analyze({
    groundModel,
    designSituation,
    anchor: anchor(),
    scenario: scenario(),
    units,
  });

  assert.equal(result.status, "ok");
  assert.equal(
    result.outputs.schemaVersion,
    GROUND_ANCHOR_DESIGN_RESULT_SCHEMA_VERSION,
  );
  assert.equal(result.outputs.capacity.groundBond.contributions.length, 2);
  const sandLength = (2.2 / Math.sin(15 * Math.PI / 180)) - 6;
  const rockLength = 6 - sandLength;
  const expectedCapacity = sandLength * 145 / 2 +
    rockLength * 440 / 3;
  approx(
    result.outputs.capacity.groundBond.allowableCapacity,
    expectedCapacity,
    1e-9,
  );
  approx(
    result.outputs.testing.records[0].apparentFreeLength.apparentFreeLength,
    0.0014 * 195e6 * 0.008 / (399 - 20),
    1e-12,
  );
  assert.equal(result.outputs.testing.status, "ok");
  assert.equal(
    result.outputs.couplings.fem.type,
    "prestressed-axial-link-with-external-ground-bond-capacity",
  );
  approx(
    result.outputs.couplings.globalStability.actions
      .designTendonForcePerUnitWidth,
    result.outputs.demand.designLoad / result.outputs.anchor.horizontalSpacing,
  );
  const stabilityAction =
    GroundAnchorStabilityAction2D.fromGroundAnchorResult(result);
  assert.equal(stabilityAction.sourceVerificationStatus, "ok");
  approx(
    stabilityAction.designTendonForcePerUnitWidth,
    result.outputs.demand.designLoad / result.outputs.anchor.horizontalSpacing,
  );
  assert.doesNotThrow(() => JSON.stringify(result.outputs));
});

test("embedded-wall support demand converts strip reaction to tendon force", () => {
  const wall = {
    schemaVersion: "embedded-retaining-wall-model/v1",
    id: "wall",
    topElevation: 0,
    toeElevation: -5,
    analysisWidth: 1,
    flexuralRigiditySegments: [{
      topElevation: 0,
      bottomElevation: -5,
      flexuralRigidity: 10000,
      provenance: { source },
    }],
    headCondition: { translation: "free", rotation: "free" },
    toeCondition: { translation: "free", rotation: "free" },
    units,
  };
  const demand = groundAnchorDemandFromEmbeddedWallResult({
    embeddedRetainingWallResult: {
      schemaVersion: "embedded-retaining-wall-result/v1",
      wall,
      stages: [{
        id: "excavation",
        response: {
          supports: [{
            supportId: "anchor-row",
            status: "active",
            scalarForce: 100,
          }],
        },
      }],
    },
    supportId: "anchor-row",
    horizontalSpacing: 2,
    inclination: 30,
    angleUnits: "deg",
  });

  approx(demand.horizontalLineLoad, 100);
  approx(demand.horizontalForcePerAnchor, 200);
  approx(demand.designLoad, 200 / Math.cos(Math.PI / 6));
  approx(demand.verticalForcePerAnchor, demand.designLoad / 2);
});

test("failed corrosion and tendon checks produce a not-verified application result", () => {
  const { groundModel, designSituation } = fixture();
  const weakAnchor = anchor({
    tendon: {
      type: "strand",
      steelArea: 0.0004,
      elasticModulus: 195e6,
      specifiedMinimumTensileStrength: 1e6,
      provenance: { source },
    },
    corrosionProtection: {
      class: "II",
      provenance: { source },
    },
  });
  const result = new GeotechnicalGroundAnchorApplication().run({
    groundModel,
    designSituation,
    anchor: weakAnchor.toJSON(),
    scenario: scenario({ testing: { jackLength: 0, records: [] } }).toJSON(),
    units,
  });

  assert.equal(result.status, "not-verified");
  assert.equal(
    result.outputs.checks.find(({ id }) => id === "tendon-design-load").status,
    "failed",
  );
  assert.equal(
    result.outputs.checks.find(
      ({ id }) => id === "corrosion-protection-class",
    ).status,
    "failed",
  );
});

test("FHWA bond catalog remains explicit and immutable to consumers", () => {
  const first = getGroundAnchorBondCatalogEntry("sand-medium-dense");
  first.ultimateTransferLoad = 1;
  const second = getGroundAnchorBondCatalogEntry("sand-medium-dense");

  assert.equal(second.ultimateTransferLoad, 145);
  assert.equal(second.capacityDivisor, 2);
  assert.equal(second.status, "presumptive-preliminary-design");
});

test("manual bond stress and assigned failure polyline use explicit geometry", () => {
  const { groundModel, designSituation } = fixture();
  const model = anchor();
  const intersectionDistance = 3;
  const intersectionX = intersectionDistance * Math.cos(model.inclination);
  const result = new GroundAnchorAnalysis().analyze({
    groundModel,
    designSituation,
    anchor: model,
    scenario: new GroundAnchorDesignScenario({
      id: "manual-bond-design",
      demand: {
        source: "assigned-tendon-load",
        designLoad: 100,
        provenance: { source },
      },
      testLoadFactor: 1.33,
      criticalFailureSurface: {
        model: "assigned-polyline",
        wallHeight: 5,
        points: [
          { x: intersectionX, z: -10 },
          { x: intersectionX, z: 5 },
        ],
        provenance: { source },
      },
      defaultBondResistance: {
        model: "ultimate-bond-stress",
        ultimateBondStress: 100,
        capacityDivisor: 2,
        groundClass: "soil",
        provenance: { source },
      },
      corrosionEnvironment: {
        serviceLife: "permanent",
        aggressivity: "aggressive",
        consequencesOfFailure: "serious",
        higherProtectionCost: "significant",
        provenance: { source },
      },
      units,
    }),
    units,
  });

  assert.equal(result.status, "ok");
  approx(
    result.outputs.geometry.criticalFailureSurface.distanceAlongAnchor,
    intersectionDistance,
    1e-12,
  );
  approx(
    result.outputs.capacity.groundBond.allowableCapacity,
    Math.PI * model.groutBodyDiameter * 100 * model.bondLength / 2,
    1e-10,
  );
});

test("presumptive soil transfer capacity is limited to twelve metres", () => {
  const { groundModel, designSituation } = fixture();
  const longAnchor = anchor({ bondLength: 14 });
  const result = new GroundAnchorAnalysis().analyze({
    groundModel,
    designSituation,
    anchor: longAnchor,
    scenario: scenario({
      demand: {
        source: "assigned-tendon-load",
        designLoad: 100,
        provenance: { source },
      },
      bondResistanceByZone: {
        "sand-zone": {
          model: "fhwa-presumptive",
          catalogId: "sand-medium-dense",
          groundClass: "soil",
        },
        "rock-zone": {
          model: "fhwa-presumptive",
          catalogId: "sand-medium-dense",
          groundClass: "soil",
        },
      },
      testing: { jackLength: 0, records: [] },
    }),
    units,
  });

  assert.equal(result.status, "ok");
  approx(result.outputs.capacity.groundBond.allowableCapacity, 12 * 145 / 2);
  assert.ok(result.warnings.some((warning) => warning.includes("12 m")));
});
