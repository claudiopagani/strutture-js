import assert from "node:assert/strict";
import test from "node:test";
import {
  CircularSlipSurface2D,
  GeotechnicalDesignSituation,
  GeotechnicalRetainingWallApplication,
  GroundModel,
  GroundProfile,
  GroundSection2D,
  PorePressureField2D,
  RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
  RETAINING_WALL_LOAD_SCENARIO_SCHEMA_VERSION,
  RETAINING_WALL_MODEL_SCHEMA_VERSION,
  RetainingWallAnalysis,
  RetainingWallLoadScenario,
  RetainingWallModel,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  ShallowFoundationUltimateLimitStateAnalysis,
  SoilMaterial,
  SoilStructureInterface,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`,
  );
}

function sand({ id = "sand", unitWeight = 18 } = {}) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk: unitWeight, saturated: 20 },
    parameterSets: [{
      id: `${id}-drained`,
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: 30,
        cohesion: 0,
      },
      provenance: { source: "test-characterization" },
    }],
    angleUnits: "deg",
    units,
  });
}

function profile({
  id,
  soil,
  surface,
  bottom = -20,
  groundwater = { model: "none" },
}) {
  return new GroundProfile({
    id,
    groundSurfaceElevation: surface,
    materials: [soil],
    layers: [{
      id: `${id}-layer`,
      topElevation: surface,
      bottomElevation: bottom,
      materialId: soil.id,
    }],
    groundwater,
    units,
  });
}

function baseInterface(angle = 20) {
  return new SoilStructureInterface({
    id: `base-interface-${angle}`,
    wallSurface: {
      typeId: "formed-concrete",
      materialType: "concrete",
      finish: "formed",
    },
    parameterSets: [{
      id: "base-characteristic",
      basis: "characteristic",
      model: "assigned-angle",
      frictionAngle: angle,
      angleUnits: "deg",
      provenance: { source: "project-interface-test" },
    }],
  });
}

function wall({ inclination = 0 } = {}) {
  return RetainingWallModel.cantilever({
    id: "wall",
    geometry: {
      toeLength: 1,
      heelLength: 2,
      baseThickness: 0.5,
      stemHeight: 4,
      stemBaseThickness: 0.4,
      stemTopThickness: 0.2,
      retainedFaceInclinationFromVertical: inclination,
    },
    concreteUnitWeight: 25,
    placement: { originX: 0, baseElevation: 0 },
    angleUnits: "deg",
    units,
  });
}

function staticFixture({ groundwater = false } = {}) {
  const soil = sand();
  const retained = profile({
    id: "retained",
    soil,
    surface: 4.5,
    groundwater: groundwater
      ? {
          model: "hydrostatic",
          waterTableElevation: 4.5,
          waterUnitWeight: 9.81,
        }
      : { model: "none" },
  });
  const bearing = profile({
    id: "bearing",
    soil,
    surface: 0.5,
    groundwater: groundwater
      ? {
          model: "hydrostatic",
          waterTableElevation: 0.5,
          waterUnitWeight: 9.81,
        }
      : { model: "none" },
  });
  const groundModel = new GroundModel({
    id: "ground",
    materials: [soil],
    profiles: [retained, bearing],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "persistent-wall",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: retained.id,
    units,
  });
  return { soil, retained, bearing, groundModel, designSituation };
}

function staticScenario(overrides = {}) {
  return new RetainingWallLoadScenario({
    id: "static-scenario",
    retainedSide: {
      profileId: "retained",
      state: "active",
      method: "rankine",
    },
    foundation: {
      profileId: "bearing",
      baseInterface: baseInterface(),
      bearing: { enabled: false },
    },
    ...overrides,
    units,
  });
}

test("retaining-wall DTOs convert geometry, compute component properties and serialize", () => {
  const model = RetainingWallModel.cantilever({
    id: "millimetre-wall",
    geometry: {
      toeLength: 1000,
      heelLength: 2000,
      baseThickness: 500,
      stemHeight: 4000,
      stemBaseThickness: 400,
      stemTopThickness: 200,
      retainedFaceInclinationFromVertical: 5,
    },
    concreteUnitWeight: 25e-6,
    placement: { baseElevation: 0 },
    angleUnits: "deg",
    units: { force: "N", length: "mm" },
  });
  const scenario = staticScenario();

  assert.equal(model.schemaVersion, RETAINING_WALL_MODEL_SCHEMA_VERSION);
  assert.equal(
    scenario.schemaVersion,
    RETAINING_WALL_LOAD_SCENARIO_SCHEMA_VERSION,
  );
  approx(model.base.width, 3.4);
  approx(model.components[0].area, 1.7);
  approx(model.components[0].weightPerUnitWidth, 42.5);
  approx(model.retainedFace.inclinationFromVertical, 5 * Math.PI / 180);
  assert.doesNotThrow(() => JSON.stringify(model.toJSON()));
  assert.doesNotThrow(() => JSON.stringify(scenario.toJSON()));
});

test("dry Rankine wall reproduces independent force and rigid-body equilibrium", () => {
  const fixture = staticFixture();
  const analysis = new RetainingWallAnalysis().analyze({
    ...fixture,
    wall: wall(),
    scenario: staticScenario(),
    units,
  });

  assert.equal(analysis.status, "ok");
  assert.equal(
    analysis.outputs.schemaVersion,
    RETAINING_WALL_ANALYSIS_RESULT_SCHEMA_VERSION,
  );
  const active = analysis.outputs.loads.find(({ id }) =>
    id === "retained-soil-normal");
  const baseWeight = analysis.outputs.loads.find(({ id }) =>
    id === "wall-component-base");
  const soilWeight = analysis.outputs.loads
    .filter(({ category }) => category === "soil-over-heel")
    .reduce((sum, load) => sum - load.force.z, 0);
  const expectedActive = 0.5 * (1 / 3) * 18 * 4 ** 2;

  approx(-active.force.x, expectedActive);
  approx(active.applicationPoint.z, 0.5 + 4 / 3);
  approx(-baseWeight.force.z, 3.4 * 0.5 * 25);
  approx(soilWeight, 2 * 4 * 18);
  approx(analysis.outputs.equilibrium.forceX, -48);
  approx(analysis.outputs.equilibrium.verticalDownward, 216.5);
  approx(
    analysis.outputs.sliding.baseResistance,
    216.5 * Math.tan(20 * Math.PI / 180),
  );
  approx(
    analysis.outputs.contact.eccentricityX,
    analysis.outputs.equilibrium.eccentricityFromBaseCenter,
  );
});

test("linear hydrostatic uplift uses distinct toe and heel heads without double subtraction", () => {
  const fixture = staticFixture({ groundwater: true });
  const analysis = new RetainingWallAnalysis().analyze({
    ...fixture,
    wall: wall(),
    scenario: staticScenario({
      baseUplift: { model: "linear-hydrostatic", reductionFactor: 0.5 },
    }),
    units,
  });
  const uplift = analysis.outputs.baseUplift;
  const expectedToePressure = 9.81 * 0.5;
  const expectedHeelPressure = 9.81 * 4.5;
  const expectedForce = 0.5 * 3.4 *
    (expectedToePressure + expectedHeelPressure) / 2;

  assert.equal(analysis.status, "ok");
  approx(uplift.toePressure, expectedToePressure);
  approx(uplift.heelPressure, expectedHeelPressure);
  approx(uplift.forcePerUnitWidth, expectedForce);
  assert.equal(
    analysis.outputs.foundation.actionState.metadata.baseUpliftAlreadyIncluded,
    true,
  );
  approx(
    analysis.outputs.foundation.baseSliding.upliftForce,
    0,
  );
});

test("front passive soil is opt-in, justified and reduced independently from water", () => {
  assert.throws(() => new RetainingWallLoadScenario({
    id: "invalid-passive",
    retainedSide: { profileId: "retained" },
    frontSide: {
      enabled: true,
      profileId: "front",
      mobilizationFactor: 0.5,
    },
    units,
  }), /justification/);

  const fixture = staticFixture();
  const front = profile({
    id: "front",
    soil: fixture.soil,
    surface: 1,
  });
  const groundModel = new GroundModel({
    id: "passive-ground",
    materials: [fixture.soil],
    profiles: [fixture.retained, fixture.bearing, front],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "passive-situation",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: fixture.retained.id,
    units,
  });
  const scenario = staticScenario({
    frontSide: {
      enabled: true,
      profileId: front.id,
      method: "rankine",
      mobilizationFactor: 0.5,
      justification: "Compatible toe-directed displacement is checked.",
    },
  });
  const analysis = new RetainingWallAnalysis().analyze({
    groundModel,
    designSituation,
    wall: wall(),
    scenario,
    units,
  });
  const passive = analysis.outputs.loads.find(({ id }) =>
    id === "front-soil-normal");

  assert.equal(analysis.status, "ok");
  approx(passive.force.x, 0.5 * 0.5 * 3 * 18 * 1 ** 2);
  assert.match(analysis.warnings.join(" "), /mobilization factor 0.5/);
});

test("inclined retained face and material-specific interface flow through Coulomb", () => {
  const fixture = staticFixture();
  const faceInterface = new SoilStructureInterface({
    id: "formed-face",
    wallSurface: {
      typeId: "formed-concrete",
      materialType: "concrete",
      finish: "formed",
    },
    parameterSets: [{
      id: "face-characteristic",
      basis: "characteristic",
      model: "assigned-angle",
      frictionAngle: 10,
      angleUnits: "deg",
      provenance: { source: "project-interface-test" },
    }],
  });
  const inclinedWall = wall({ inclination: 5 });
  const retainedSurface = inclinedWall.toGlobalPoint(
    inclinedWall.retainedFace.top,
  ).z;
  assert.equal(retainedSurface, 4.5);
  const scenario = staticScenario({
    retainedSide: {
      profileId: fixture.retained.id,
      state: "active",
      method: "coulomb-active",
      interface: faceInterface,
    },
  });
  const analysis = new RetainingWallAnalysis().analyze({
    ...fixture,
    wall: inclinedWall,
    scenario,
    units,
  });

  assert.equal(analysis.status, "ok");
  approx(
    analysis.outputs.pressureActions.retained.outputs.geometry
      .wallInclinationFromVertical,
    5 * Math.PI / 180,
  );
  approx(
    analysis.outputs.pressureActions.retained.outputs.interface.frictionAngle,
    10 * Math.PI / 180,
  );
  assert.ok(analysis.outputs.loads.some(({ id }) =>
    id === "retained-soil-tangent"));
});

test("pseudostatic wall combines seismic pressure with explicit wall inertia", () => {
  const fixture = staticFixture();
  const designSituation = new GeotechnicalDesignSituation({
    id: "seismic-wall",
    groundModel: fixture.groundModel,
    situationType: "seismic",
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: fixture.retained.id,
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0.05 },
    units,
  });
  const scenario = staticScenario({
    retainedSide: {
      profileId: fixture.retained.id,
      state: "seismic-active",
      method: "mononobe-okabe-active",
      seismic: { distributionModel: "triangular-equivalent" },
    },
    seismicDirection: "retained-to-front",
  });
  const analysis = new RetainingWallAnalysis().analyze({
    groundModel: fixture.groundModel,
    designSituation,
    wall: wall(),
    scenario,
    units,
  });
  const baseHorizontalInertia = analysis.outputs.loads.find(({ id }) =>
    id === "wall-component-base-horizontal-inertia");
  const baseVerticalInertia = analysis.outputs.loads.find(({ id }) =>
    id === "wall-component-base-vertical-inertia");

  assert.equal(analysis.status, "ok");
  approx(baseHorizontalInertia.force.x, -0.1 * 42.5);
  approx(baseVerticalInertia.force.z, 0.05 * 42.5);
  assert.equal(
    analysis.outputs.foundation.bearing.status,
    "not-analyzed",
  );
  assert.ok(analysis.outputs.pressureActions.retained.outputs.diagram);
});

test("resultant-only layered wedge requires and uses an assigned application height", () => {
  const fixture = staticFixture();
  const designSituation = new GeotechnicalDesignSituation({
    id: "wedge-wall",
    groundModel: fixture.groundModel,
    situationType: "seismic",
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: fixture.retained.id,
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0 },
    units,
  });
  const makeScenario = (heightRatio) => staticScenario({
    retainedSide: {
      profileId: fixture.retained.id,
      state: "seismic-active",
      method: "trial-wedge-pseudostatic",
      resultantApplicationHeightRatio: heightRatio,
      seismic: { search: { sampleCount: 181 } },
    },
    seismicDirection: "retained-to-front",
  });
  const missingHeight = new RetainingWallAnalysis().analyze({
    groundModel: fixture.groundModel,
    designSituation,
    wall: wall(),
    scenario: makeScenario(null),
    units,
  });
  const assignedHeight = new RetainingWallAnalysis().analyze({
    groundModel: fixture.groundModel,
    designSituation,
    wall: wall(),
    scenario: makeScenario(0.4),
    units,
  });
  const thrust = assignedHeight.outputs.loads.find(({ id }) =>
    id === "retained-seismic-total");

  assert.equal(missingHeight.status, "not-supported");
  assert.match(missingHeight.summary, /resultantApplicationHeightRatio/);
  assert.equal(assignedHeight.status, "ok");
  approx(thrust.applicationPoint.z, 0.5 + 0.4 * 4);
  assert.equal(
    assignedHeight.outputs.pressureActions.retained.outputs.diagram,
    null,
  );
});

test("shallow-foundation uplift treatment preserves already-net wall actions", () => {
  const soil = sand({ id: "uplift-soil", unitWeight: 18 });
  const waterProfile = profile({
    id: "uplift-profile",
    soil,
    surface: 0,
    bottom: -12,
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: 0,
      waterUnitWeight: 10,
    },
  });
  const groundModel = new GroundModel({
    id: "uplift-ground",
    materials: [soil],
    profiles: [waterProfile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "uplift-situation",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: waterProfile.id,
    units,
  });
  const foundation = new ShallowFoundationModel({
    id: "uplift-strip",
    shape: "strip",
    geometry: { width: 2 },
    placement: { baseElevation: -1 },
    units,
  });
  const actionState = new ShallowFoundationActionState({
    id: "net-actions",
    basis: "per-unit-length",
    resultantScope: "total-at-foundation-base",
    actions: { verticalForcePerUnitLength: 980 },
    units,
  });
  const included = new ShallowFoundationUltimateLimitStateAnalysis().analyze({
    groundModel,
    designSituation,
    foundation,
    actionState,
    baseUpliftTreatment: "included-in-action-resultant",
    units,
  });
  const defaultTreatment =
    new ShallowFoundationUltimateLimitStateAnalysis().analyze({
      groundModel,
      designSituation,
      foundation,
      actionState,
      units,
    });

  assert.equal(included.status, "ok");
  approx(included.outputs.bearing.demand, 490);
  approx(defaultTreatment.outputs.bearing.demand, 480);
  assert.equal(
    included.outputs.groundwater.baseUpliftTreatment,
    "included-in-action-resultant",
  );
});

test("static global-stability coupling is explicitly an equivalent-surcharge screening", () => {
  const fixture = staticFixture();
  const section = new GroundSection2D({
    id: "wall-slope-section",
    surface: {
      points: [{ x: 0, z: 10 }, { x: 10, z: 0 }, { x: 20, z: 0 }],
    },
    zones: [{
      id: "wall-slope-zone",
      materialId: fixture.soil.id,
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
  const dryField = new PorePressureField2D({
    id: "wall-slope-dry",
    model: "none",
    units,
  });
  const groundModel = new GroundModel({
    id: "wall-slope-ground",
    materials: [fixture.soil],
    profiles: [fixture.retained, fixture.bearing],
    sections: [section],
    porePressureFields: [dryField],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "wall-slope-situation",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    requiredParameterBasis: "characteristic",
    profileId: fixture.retained.id,
    sectionId: section.id,
    porePressureFieldId: dryField.id,
    units,
  });
  const slipSurface = CircularSlipSurface2D.fromChordAndSagitta({
    id: "wall-global-circle",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units,
  });
  const scenario = staticScenario({
    globalStability: {
      enabled: true,
      analysisInput: {
        mode: "assigned-surface",
        slipSurface,
        sliceCount: 30,
      },
    },
  });
  const analysis = new RetainingWallAnalysis().analyze({
    groundModel,
    designSituation,
    wall: wall(),
    scenario,
    units,
  });

  assert.equal(analysis.status, "ok");
  assert.equal(analysis.outputs.globalStability.status, "ok");
  assert.equal(
    analysis.outputs.globalStability.fidelity,
    "screening-equivalent-surcharge",
  );
  approx(
    analysis.outputs.globalStability.equivalentWallSurcharge.intensity,
    (42.5 + 30) / 3.4,
  );
  assert.match(analysis.warnings.join(" "), /not finite elements/);
});

test("retaining-wall application returns serializable structural coupling", () => {
  const fixture = staticFixture();
  const applicationResult = new GeotechnicalRetainingWallApplication().run({
    ...fixture,
    wall: wall(),
    scenario: staticScenario({
      criteria: {
        minimumSlidingFactorOfSafety: 1.5,
        minimumOverturningFactorOfSafety: 1.5,
      },
    }),
    units,
  });
  const serialized = JSON.parse(JSON.stringify(applicationResult.toJSON()));

  assert.equal(applicationResult.applicationId, "geotechnical-retaining-walls");
  assert.equal(applicationResult.status, "ok");
  assert.equal(
    serialized.outputs.structuralCoupling.femTransfer.status,
    "contract-available",
  );
  assert.equal(
    serialized.outputs.structuralCoupling.structuralVerification.status,
    "not-analyzed",
  );
});
