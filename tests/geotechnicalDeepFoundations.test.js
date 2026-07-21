import assert from "node:assert/strict";
import test from "node:test";
import {
  AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  AXIAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION,
  DEEP_FOUNDATION_MODEL_SCHEMA_VERSION,
  AxialPileCapacityAnalysis,
  AxialPileLoadScenario,
  DeepFoundationModel,
  GeotechnicalDeepFoundationApplication,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundProfile,
  SoilMaterial,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`,
  );
}

function drainedMaterial({ id, bulk, saturated }) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk, saturated },
    parameterSets: [{
      id: `${id}-characteristic`,
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 32,
        cohesion: 0,
      },
      provenance: { source: "test-characterization" },
    }],
    angleUnits: "deg",
    units,
  });
}

function undrainedMaterial({ id = "clay", strength = 50 } = {}) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [{
      id: `${id}-characteristic`,
      basis: "characteristic",
      drainage: "undrained",
      strength: {
        model: "total-stress-undrained",
        undrainedShearStrength: strength,
      },
      provenance: { source: "test-characterization" },
    }],
    units,
  });
}

function pile(overrides = {}) {
  return new DeepFoundationModel({
    id: "pile-1",
    geometry: { model: "circular", diameter: 1 },
    placement: {
      x: 2,
      y: 3,
      headElevation: 0.5,
      soilContactTopElevation: 0,
      toeElevation: -10,
    },
    construction: {
      installationMethod: "driven-precast",
      structuralMaterial: "reinforced-concrete",
      displacementClass: "displacement",
      baseCondition: "closed-ended",
    },
    ...overrides,
    units,
  });
}

function layeredDrainedFixture() {
  const upper = drainedMaterial({ id: "upper-sand", bulk: 18, saturated: 20 });
  const lower = drainedMaterial({ id: "lower-sand", bulk: 19, saturated: 22 });
  const profile = new GroundProfile({
    id: "layered-profile",
    groundSurfaceElevation: 0,
    materials: [upper, lower],
    layers: [{
      id: "upper-layer",
      topElevation: 0,
      bottomElevation: -4,
      materialId: upper.id,
    }, {
      id: "lower-layer",
      topElevation: -4,
      bottomElevation: -15,
      materialId: lower.id,
    }],
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: -2,
      waterUnitWeight: 10,
    },
    units,
  });
  const groundModel = new GroundModel({
    id: "layered-ground",
    materials: [upper, lower],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "layered-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    units,
  });
  const scenario = new AxialPileLoadScenario({
    id: "compression",
    direction: "compression",
    action: {
      axialForce: 1000,
      basis: "design",
      referencePoint: "pile-head",
      includesPileSelfWeight: true,
    },
    surfaceSurcharge: 10,
    shaftResistanceByLayer: {
      "upper-layer": {
        method: "effective-stress",
        coefficientModel: "assigned-beta",
        beta: 0.25,
        provenance: { source: "project-method-upper" },
      },
      "lower-layer": {
        method: "effective-stress",
        coefficientModel: "k-tan-delta",
        lateralEarthPressureCoefficient: 1,
        interfaceFrictionAngle: Math.atan(0.3),
        angleUnits: "rad",
        provenance: { source: "project-method-lower" },
      },
    },
    baseResistance: {
      method: "effective-stress-nq",
      bearingLayerId: "lower-layer",
      bearingCapacityFactor: 20,
      provenance: { source: "project-tip-method" },
    },
    resistanceConversion: {
      model: "component-divisors",
      shaftDivisor: 1.5,
      baseDivisor: 2,
      overallDivisor: 1.1,
      provenance: { source: "test-resistance-format" },
    },
    units,
  });
  return { groundModel, designSituation, scenario };
}

test("deep-foundation DTOs convert geometry and preserve serializable method data", () => {
  const model = new DeepFoundationModel({
    id: "metric-pile",
    elementType: "micropile",
    geometry: { model: "circular", diameter: 600 },
    placement: {
      headElevation: 500,
      soilContactTopElevation: 0,
      toeElevation: -10000,
    },
    construction: {
      installationMethod: "drilled-and-grouted",
      structuralMaterial: "steel-grout-composite",
      displacementClass: "non-displacement",
    },
    units: { force: "N", length: "mm" },
  });
  const fixture = layeredDrainedFixture();
  const serializedScenario = fixture.scenario.toJSON();
  const reconstructed = new AxialPileLoadScenario(serializedScenario);

  assert.equal(model.schemaVersion, DEEP_FOUNDATION_MODEL_SCHEMA_VERSION);
  assert.equal(
    fixture.scenario.schemaVersion,
    AXIAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION,
  );
  approx(model.geometry.diameter, 0.6);
  approx(model.placement.pileLength, 10.5);
  approx(
    reconstructed.shaftResistanceByLayer["lower-layer"].beta,
    0.3,
  );
  assert.doesNotThrow(() => JSON.stringify(model.toJSON()));
  assert.doesNotThrow(() => JSON.stringify(serializedScenario));
});

test("layered drained pile integrates beta resistance and groundwater exactly", () => {
  const fixture = layeredDrainedFixture();
  const analysis = new AxialPileCapacityAnalysis().analyze({
    ...fixture,
    pile: pile(),
    units,
  });
  const perimeter = Math.PI;
  const area = Math.PI / 4;
  const expectedUpper = 0.25 * (28 * 2 + 56 * 2) * perimeter;
  const expectedLower = 0.3 * 102 * 6 * perimeter;
  const expectedShaft = expectedUpper + expectedLower;
  const expectedBase = 20 * 138 * area;
  const expectedConverted =
    (expectedShaft / 1.5 + expectedBase / 2) / 1.1;

  assert.equal(analysis.status, "ok");
  assert.equal(
    analysis.outputs.schemaVersion,
    AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  );
  approx(analysis.outputs.shaft.contributions[0].resistance, expectedUpper);
  approx(analysis.outputs.shaft.contributions[1].resistance, expectedLower);
  approx(analysis.outputs.shaft.resistance, expectedShaft);
  approx(analysis.outputs.base.stressAtToe.effectiveVerticalStress, 138);
  approx(analysis.outputs.base.resistance, expectedBase);
  approx(analysis.outputs.capacity.convertedResistance, expectedConverted);
  approx(
    analysis.outputs.verification.utilizationRatio,
    1000 / expectedConverted,
  );
  assert.equal(
    analysis.outputs.toeLayerBoundaryAssessment.status,
    "review-required",
  );
});

test("effective-stress ceiling is integrated exactly through a crossing", () => {
  const fixture = layeredDrainedFixture();
  const scenarioPayload = fixture.scenario.toJSON();
  scenarioPayload.shaftResistanceByLayer["upper-layer"]
    .maximumEffectiveVerticalStress = 50;
  const scenario = new AxialPileLoadScenario(scenarioPayload);
  const analysis = new AxialPileCapacityAnalysis().analyze({
    groundModel: fixture.groundModel,
    designSituation: fixture.designSituation,
    pile: pile(),
    scenario,
    units,
  });
  const expectedStressIntegral = 28 * 2 + 49.6 * 2;
  const expectedResistance = 0.25 * expectedStressIntegral * Math.PI;

  assert.equal(analysis.status, "ok");
  approx(analysis.outputs.shaft.contributions[0].resistance, expectedResistance);
  approx(
    analysis.outputs.shaft.contributions[0].subsegments[1]
      .effectiveVerticalStress.averageAfterLimit,
    49.6,
  );
});

test("undrained alpha-Nc compression and shaft-only tension remain distinct", () => {
  const clay = undrainedMaterial();
  const profile = new GroundProfile({
    id: "clay-profile",
    groundSurfaceElevation: 0,
    materials: [clay],
    layers: [{
      id: "clay-layer",
      topElevation: 0,
      bottomElevation: -20,
      materialId: clay.id,
    }],
    units,
  });
  const groundModel = new GroundModel({
    id: "clay-ground",
    materials: [clay],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "clay-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: "undrained",
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    units,
  });
  const model = pile({
    geometry: { model: "circular", diameter: 0.5 },
  });
  const compression = new AxialPileLoadScenario({
    id: "clay-compression",
    shaftResistanceByLayer: {
      "clay-layer": {
        method: "alpha-undrained",
        adhesionFactor: 0.6,
        provenance: { source: "assigned-alpha" },
      },
    },
    baseResistance: {
      method: "undrained-nc",
      bearingLayerId: "clay-layer",
      bearingCapacityFactor: 9,
      provenance: { source: "assigned-Nc" },
    },
    units,
  });
  const tension = new AxialPileLoadScenario({
    id: "clay-tension",
    direction: "tension",
    shaftResistanceByLayer: {
      "clay-layer": {
        method: "alpha-undrained",
        adhesionFactor: 0.45,
        provenance: { source: "assigned-tension-alpha" },
      },
    },
    units,
  });
  const compressionResult = new AxialPileCapacityAnalysis().analyze({
    groundModel,
    designSituation,
    pile: model,
    scenario: compression,
    units,
  });
  const tensionResult = new AxialPileCapacityAnalysis().analyze({
    groundModel,
    designSituation,
    pile: model,
    scenario: tension,
    units,
  });
  const shaftArea = Math.PI * 0.5 * 10;
  const baseArea = Math.PI * 0.5 ** 2 / 4;

  assert.equal(compressionResult.status, "ok");
  approx(compressionResult.outputs.shaft.resistance, 0.6 * 50 * shaftArea);
  approx(compressionResult.outputs.base.resistance, 9 * 50 * baseArea);
  assert.equal(tensionResult.status, "ok");
  approx(tensionResult.outputs.shaft.resistance, 0.45 * 50 * shaftArea);
  assert.equal(tensionResult.outputs.base.status, "not-included");
  assert.equal(
    tensionResult.outputs.toeLayerBoundaryAssessment.status,
    "not-applicable",
  );
  assert.equal(
    tensionResult.outputs.capacity.calculatedUltimateBaseResistance,
    0,
  );
});

test("analysis rejects missing layer methods and drainage-method mismatches", () => {
  const fixture = layeredDrainedFixture();
  const missing = new AxialPileLoadScenario({
    id: "missing-layer",
    shaftResistanceByLayer: {
      "upper-layer": {
        method: "effective-stress",
        beta: 0.25,
        provenance: { source: "test" },
      },
    },
    baseResistance: {
      method: "effective-stress-nq",
      bearingLayerId: "lower-layer",
      bearingCapacityFactor: 20,
      provenance: { source: "test" },
    },
    units,
  });
  const mismatch = new AxialPileLoadScenario({
    id: "drainage-mismatch",
    shaftResistanceByLayer: {
      "upper-layer": {
        method: "alpha-undrained",
        adhesionFactor: 0.5,
        provenance: { source: "test" },
      },
      "lower-layer": {
        method: "effective-stress",
        beta: 0.3,
        provenance: { source: "test" },
      },
    },
    baseResistance: {
      method: "effective-stress-nq",
      bearingLayerId: "lower-layer",
      bearingCapacityFactor: 20,
      provenance: { source: "test" },
    },
    units,
  });
  const input = {
    groundModel: fixture.groundModel,
    designSituation: fixture.designSituation,
    pile: pile(),
    units,
  };
  const missingResult = new AxialPileCapacityAnalysis().analyze({
    ...input,
    scenario: missing,
  });
  const mismatchResult = new AxialPileCapacityAnalysis().analyze({
    ...input,
    scenario: mismatch,
  });

  assert.equal(missingResult.status, "failed");
  assert.match(missingResult.warnings[0], /lower-layer/);
  assert.equal(mismatchResult.status, "failed");
  assert.match(mismatchResult.warnings[0], /total-stress-undrained/);
});

test("deep-foundation application returns a serializable capacity/FEM contract", () => {
  const fixture = layeredDrainedFixture();
  const applicationResult = new GeotechnicalDeepFoundationApplication().run({
    ...fixture,
    pile: pile(),
    units,
  });
  const serialized = JSON.parse(JSON.stringify(applicationResult.toJSON()));

  assert.equal(applicationResult.applicationId, "geotechnical-deep-foundations");
  assert.equal(applicationResult.status, "ok");
  assert.equal(
    serialized.outputs.structuralCoupling.capacityMode.status,
    "available",
  );
  assert.equal(
    serialized.outputs.structuralCoupling.responseMode.status,
    "not-implemented",
  );
  assert.equal(
    serialized.outputs.structuralCoupling.structuralVerification.status,
    "not-analyzed",
  );
});
