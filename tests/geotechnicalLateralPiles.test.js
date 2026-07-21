import assert from "node:assert/strict";
import test from "node:test";
import {
  LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION,
  DeepFoundationModel,
  GeotechnicalDesignSituation,
  GeotechnicalLateralPileApplication,
  GroundModel,
  GroundProfile,
  LateralPileCapacityAnalysis,
  LateralPileLoadScenario,
  MicropileBromsApplication,
  SoilMaterial,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`,
  );
}

function material({
  id,
  drainage,
  strength,
  bulk = 18,
  saturated = 20,
}) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk, saturated },
    parameterSets: [{
      id: `${id}-characteristic`,
      basis: "characteristic",
      drainage,
      strength,
      provenance: { source: "test-characterization" },
    }],
    angleUnits: drainage === "drained" ? "deg" : null,
    units,
  });
}

function fixture({ soil, bottom = -20, groundwater = { model: "none" } }) {
  const profile = new GroundProfile({
    id: "lateral-profile",
    groundSurfaceElevation: 0,
    materials: [soil],
    layers: [{
      id: "lateral-layer",
      topElevation: 0,
      bottomElevation: bottom,
      materialId: soil.id,
    }],
    groundwater,
    units,
  });
  const groundModel = new GroundModel({
    id: "lateral-ground",
    materials: [soil],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "lateral-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: soil.parameterSets[0].drainage,
    requiredParameterBasis: "characteristic",
    profileId: profile.id,
    units,
  });
  return { profile, groundModel, designSituation };
}

function pile({ diameter = 1, embedment = 6 } = {}) {
  return new DeepFoundationModel({
    id: "lateral-pile",
    geometry: { model: "circular", diameter },
    placement: {
      headElevation: 0,
      soilContactTopElevation: 0,
      toeElevation: -embedment,
    },
    construction: {
      installationMethod: "assigned-test-method",
      structuralMaterial: "assigned-test-material",
      displacementClass: "not-classified",
    },
    units,
  });
}

function scenario({ soilBranch, conversion = null, shear = 100, moment = 50 }) {
  return new LateralPileLoadScenario({
    id: `${soilBranch}-scenario`,
    soilBranch,
    action: {
      lateralShear: shear,
      overturningMoment: moment,
      basis: "design",
      referencePoint: "groundline-at-pile-axis",
    },
    behaviorAssertion: {
      classification: "short-rigid",
      basis: "project-rigidity-assessment",
      provenance: { source: "test-behavior-assessment" },
    },
    resistanceConversion: conversion,
    units,
  });
}

test("lateral scenario normalizes units and remains serializable", () => {
  const model = new LateralPileLoadScenario({
    id: "converted-units",
    soilBranch: "cohesionless-drained",
    action: {
      lateralShear: 100000,
      overturningMoment: 50000000,
      referencePoint: "groundline-at-pile-axis",
    },
    behaviorAssertion: {
      classification: "short-rigid",
      provenance: { source: "project-check" },
    },
    units: { force: "N", length: "mm" },
  });
  const reconstructed = new LateralPileLoadScenario(model.toJSON());

  assert.equal(
    model.schemaVersion,
    LATERAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION,
  );
  approx(model.action.lateralShear, 100);
  approx(model.action.overturningMoment, 50);
  approx(reconstructed.action.overturningMoment, 50);
  assert.doesNotThrow(() => JSON.stringify(model.toJSON()));
});

test("cohesive Broms branch reproduces equations 6-8 through 6-12", () => {
  const clay = material({
    id: "clay",
    drainage: "undrained",
    strength: {
      model: "total-stress-undrained",
      undrainedShearStrength: 50,
    },
  });
  const ground = fixture({ soil: clay });
  const result = new LateralPileCapacityAnalysis().analyze({
    ...ground,
    pile: pile({ diameter: 1, embedment: 6 }),
    scenario: scenario({ soilBranch: "cohesive-undrained" }),
    units,
  });
  const f = 100 / (9 * 50 * 1);
  const maximumMoment = 50 + 100 * (1.5 + 0.5 * f);
  const g = Math.sqrt(maximumMoment / (2.25 * 50 * 1));
  const requiredEmbedment = 1.5 + f + g;
  const expectedCapacity =
    (-6750 + Math.sqrt(61_605_000)) / 2;

  assert.equal(result.status, "ok");
  assert.equal(
    result.outputs.schemaVersion,
    LATERAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  );
  approx(result.outputs.mechanism.nominal.response.f, f);
  approx(result.outputs.mechanism.nominal.response.g, g);
  approx(
    result.outputs.mechanism.nominal.response.maximumMoment,
    maximumMoment,
  );
  approx(
    result.outputs.mechanism.nominal.response.requiredEmbedment,
    requiredEmbedment,
  );
  approx(
    result.outputs.capacity.nominalLateralResistance,
    expectedCapacity,
    1e-8,
  );
  assert.equal(result.outputs.verification.status, "not-performed");
});

test("cohesionless Broms branch returns capacity and structural action effects", () => {
  const sand = material({
    id: "sand",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
  });
  const ground = fixture({ soil: sand });
  const resistanceConversion = {
    model: "soil-reaction-factor",
    factor: 0.8,
    provenance: { source: "test-project-factor" },
  };
  const result = new LateralPileCapacityAnalysis().analyze({
    ...ground,
    pile: pile({ diameter: 1, embedment: 5 }),
    scenario: scenario({
      soilBranch: "cohesionless-drained",
      conversion: resistanceConversion,
    }),
    units,
  });
  const passiveCoefficient = 3;
  const f = Math.sqrt(100 / (1.5 * 18 * passiveCoefficient));
  const maximumMoment = 50 + 100 * f -
    18 * passiveCoefficient * f ** 3 / 2;
  const nominalCapacity = 0.5 * 18 * 5 ** 2 * passiveCoefficient - 50 / 5;
  const convertedCapacity =
    0.5 * 0.8 * 18 * 5 ** 2 * passiveCoefficient - 50 / 5;

  assert.equal(result.status, "ok");
  approx(result.outputs.soil.parameters.passiveCoefficient, 3);
  approx(result.outputs.mechanism.converted.response.f, f / Math.sqrt(0.8));
  approx(
    result.outputs.mechanism.nominal.response.maximumMoment,
    maximumMoment,
  );
  approx(result.outputs.capacity.nominalLateralResistance, nominalCapacity);
  approx(result.outputs.capacity.convertedLateralResistance, convertedCapacity);
  approx(result.outputs.verification.utilizationRatio, 100 / convertedCapacity);
  approx(
    result.outputs.structuralCoupling.actionEffects.maximumPileMoment,
    result.outputs.mechanism.converted.response.maximumMoment,
  );
});

test("fully submerged sand uses buoyant unit weight", () => {
  const sand = material({
    id: "submerged-sand",
    drainage: "drained",
    bulk: 18,
    saturated: 20,
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
  });
  const ground = fixture({
    soil: sand,
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: 0,
      waterUnitWeight: 10,
    },
  });
  const result = new LateralPileCapacityAnalysis().analyze({
    ...ground,
    pile: pile({ embedment: 5 }),
    scenario: scenario({ soilBranch: "cohesionless-drained" }),
    units,
  });

  assert.equal(result.status, "ok");
  approx(result.outputs.soil.parameters.effectiveUnitWeight, 10);
  approx(
    result.outputs.capacity.nominalLateralResistance,
    0.5 * 10 * 5 ** 2 * 3 - 50 / 5,
  );
});

test("Broms guardrails reject stratigraphy and an internal water table", () => {
  const sand = material({
    id: "guard-sand",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
  });
  const second = material({
    id: "second-sand",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 32,
      cohesion: 0,
    },
  });
  const layeredProfile = new GroundProfile({
    id: "layered-lateral",
    groundSurfaceElevation: 0,
    materials: [sand, second],
    layers: [{
      id: "top",
      topElevation: 0,
      bottomElevation: -3,
      materialId: sand.id,
    }, {
      id: "bottom",
      topElevation: -3,
      bottomElevation: -20,
      materialId: second.id,
    }],
    units,
  });
  const layeredGround = new GroundModel({
    id: "layered-lateral-ground",
    materials: [sand, second],
    profiles: [layeredProfile],
    units,
  });
  const layeredSituation = new GeotechnicalDesignSituation({
    id: "layered-lateral-uls",
    groundModel: layeredGround,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: layeredProfile.id,
    units,
  });
  const layeredResult = new LateralPileCapacityAnalysis().analyze({
    groundModel: layeredGround,
    designSituation: layeredSituation,
    pile: pile({ embedment: 6 }),
    scenario: scenario({ soilBranch: "cohesionless-drained" }),
    units,
  });
  const waterGround = fixture({
    soil: sand,
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: -2,
      waterUnitWeight: 10,
    },
  });
  const waterResult = new LateralPileCapacityAnalysis().analyze({
    ...waterGround,
    pile: pile({ embedment: 6 }),
    scenario: scenario({ soilBranch: "cohesionless-drained" }),
    units,
  });

  assert.equal(layeredResult.status, "not-supported");
  assert.match(layeredResult.summary, /homogeneous soil layer/);
  assert.equal(waterResult.status, "not-supported");
  assert.match(waterResult.summary, /water table within the embedment/);
});

test("lateral-pile application exposes serializable capacity and FEM bridges", () => {
  const sand = material({
    id: "application-sand",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
  });
  const ground = fixture({ soil: sand });
  const applicationResult = new GeotechnicalLateralPileApplication().run({
    ...ground,
    pile: pile({ embedment: 5 }),
    scenario: scenario({ soilBranch: "cohesionless-drained" }),
    units,
  });
  const serialized = JSON.parse(JSON.stringify(applicationResult.toJSON()));

  assert.equal(applicationResult.applicationId, "geotechnical-lateral-piles");
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

test("deprecated Broms entry point delegates general input and preserves legacy status", () => {
  const sand = material({
    id: "compatibility-sand",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 30,
      cohesion: 0,
    },
  });
  const ground = fixture({ soil: sand });
  const application = new MicropileBromsApplication();
  const delegated = application.run({
    ...ground,
    pile: pile({ embedment: 5 }),
    scenario: scenario({ soilBranch: "cohesionless-drained" }),
    units,
  });
  const legacy = application.run({ model: { id: "legacy-micropile" } });

  assert.equal(delegated.applicationId, "micropiles-broms");
  assert.equal(delegated.status, "ok");
  assert.equal(
    delegated.metadata.replacementApplicationId,
    "geotechnical-lateral-piles",
  );
  assert.match(delegated.warnings[0], /deprecated/);
  assert.equal(legacy.status, "not-implemented");
  assert.equal(legacy.metadata.pileId, "legacy-micropile");
});
