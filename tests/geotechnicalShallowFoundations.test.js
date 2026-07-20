import assert from "node:assert/strict";
import test from "node:test";
import {
  GeotechnicalDesignSituation,
  GeotechnicalShallowFoundationApplication,
  GroundModel,
  GroundProfile,
  PorePressureField2D,
  SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION,
  SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION,
  SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  ShallowFoundationUltimateLimitStateAnalysis,
  SoilMaterial,
  SoilStructureInterface,
  calculateShallowFoundationBearingCapacity,
  calculateShallowFoundationEffectiveGeometry,
  calculateShallowFoundationSlidingResistance,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const FOOT = 0.3048;
const KIP = 4.4482216152605;
const KSF = 47.8802589803358;
const KCF = 157.087463846246;

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`,
  );
}

function drainedMaterial({
  id = "sand",
  frictionAngle = 34,
  cohesion = 0,
  unitWeight = 20,
} = {}) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk: unitWeight, saturated: unitWeight },
    parameterSets: [{
      id: `${id}-drained`,
      basis: "representative",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle,
        cohesion,
      },
    }],
    angleUnits: "deg",
    units,
  });
}

function undrainedMaterial({
  id = "clay",
  undrainedShearStrength = 50,
  unitWeight = 20,
} = {}) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk: unitWeight, saturated: unitWeight },
    parameterSets: [{
      id: `${id}-undrained`,
      basis: "representative",
      drainage: "undrained",
      strength: {
        model: "total-stress-undrained",
        undrainedShearStrength,
      },
    }],
    units,
  });
}

function totalActions({
  verticalForce = 1000,
  horizontalX = 0,
  horizontalY = 0,
  momentX = 0,
  momentY = 0,
} = {}) {
  return new ShallowFoundationActionState({
    id: "actions",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: {
      verticalForce,
      horizontalX,
      horizontalY,
      momentX,
      momentY,
    },
    units,
  });
}

function b3Case() {
  const sand = drainedMaterial({
    id: "b3-sand",
    frictionAngle: 34,
    unitWeight: 0.135 * KCF,
  });
  const clay = undrainedMaterial({
    id: "b3-clay",
    undrainedShearStrength: 0.5 * KSF,
    unitWeight: 0.135 * KCF,
  });
  const profile = new GroundProfile({
    id: "b3-profile",
    groundSurfaceElevation: 0,
    materials: [sand, clay],
    layers: [
      {
        id: "b3-upper-sand",
        topElevation: 0,
        bottomElevation: -8 * FOOT,
        materialId: sand.id,
      },
      {
        id: "b3-lower-clay",
        topElevation: -8 * FOOT,
        bottomElevation: -30 * FOOT,
        materialId: clay.id,
      },
    ],
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: -13 * FOOT,
      waterUnitWeight: 9.81,
    },
    units,
  });
  const groundModel = new GroundModel({
    id: "b3-ground",
    materials: [sand, clay],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "b3-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: "mixed",
    profileId: profile.id,
    parameterSelection: {
      byLayer: {
        "b3-upper-sand": "b3-sand-drained",
        "b3-lower-clay": "b3-clay-undrained",
      },
    },
    units,
  });
  const foundation = new ShallowFoundationModel({
    id: "b3-foundation",
    shape: "rectangular",
    geometry: { width: 7 * FOOT, length: 7 * FOOT },
    placement: { baseElevation: -2 * FOOT },
    units,
  });
  const actionState = totalActions({ verticalForce: 104.7 * KIP });
  return { groundModel, designSituation, foundation, actionState };
}

test("shallow-foundation model and action DTOs convert units and serialize", () => {
  const foundation = new ShallowFoundationModel({
    id: "metric-footing",
    shape: "rectangular",
    geometry: { width: 2000, length: 3000 },
    placement: { x: 1000, y: 2000, baseElevation: -1500 },
    units: { force: "N", length: "mm" },
  });
  const actions = new ShallowFoundationActionState({
    id: "metric-actions",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: { verticalForce: 1e6, momentY: 2e8 },
    units: { force: "N", length: "mm" },
  });

  assert.equal(foundation.schemaVersion,
    SHALLOW_FOUNDATION_MODEL_SCHEMA_VERSION);
  assert.equal(actions.schemaVersion,
    SHALLOW_FOUNDATION_ACTION_STATE_SCHEMA_VERSION);
  approx(foundation.geometry.width, 2);
  approx(foundation.geometry.length, 3);
  approx(actions.actions.verticalForce, 1000);
  approx(actions.actions.momentY, 200);
  assert.doesNotThrow(() => JSON.stringify(foundation.toJSON()));
  assert.doesNotThrow(() => JSON.stringify(actions.toJSON()));
});

test("effective dimensions follow rectangular, strip and circular equations", () => {
  const rectangular = new ShallowFoundationModel({
    id: "rectangular",
    shape: "rectangular",
    geometry: { width: 2, length: 3 },
    placement: { baseElevation: -1 },
    units,
  });
  const rectangle = calculateShallowFoundationEffectiveGeometry({
    foundation: rectangular,
    actionState: totalActions({
      verticalForce: 1000,
      momentX: 150,
      momentY: 100,
    }),
  });
  approx(rectangle.eccentricityWidth, 0.1);
  approx(rectangle.eccentricityLength, 0.15);
  approx(rectangle.effectiveWidthOnWidthAxis, 1.8);
  approx(rectangle.effectiveLengthOnLengthAxis, 2.7);
  approx(rectangle.effectiveArea, 4.86);

  const strip = new ShallowFoundationModel({
    id: "strip",
    shape: "strip",
    geometry: { width: 2 },
    placement: { baseElevation: -1 },
    units,
  });
  const stripGeometry = calculateShallowFoundationEffectiveGeometry({
    foundation: strip,
    actionState: new ShallowFoundationActionState({
      id: "strip-actions",
      basis: "per-unit-length",
      resultantScope: "total-at-foundation-base",
      actions: {
        verticalForcePerUnitLength: 500,
        momentPerUnitLength: 50,
      },
      units,
    }),
  });
  approx(stripGeometry.effectiveWidth, 1.8);
  approx(stripGeometry.shapeRatio, 0);

  const circle = new ShallowFoundationModel({
    id: "circle",
    shape: "circular",
    geometry: { diameter: 2 },
    placement: { baseElevation: -1 },
    units,
  });
  const circularGeometry = calculateShallowFoundationEffectiveGeometry({
    foundation: circle,
    actionState: totalActions({ verticalForce: 1000, momentY: 200 }),
  });
  const radius = 1;
  const eccentricity = 0.2;
  const expectedArea = 2 * (
    radius ** 2 * Math.acos(eccentricity / radius) -
    eccentricity * Math.sqrt(radius ** 2 - eccentricity ** 2)
  );
  approx(circularGeometry.effectiveArea, expectedArea);
});

test("bearing kernel reproduces rounded USACE Example B-3 surface-layer values", () => {
  const { foundation, actionState } = b3Case();
  const geometry = calculateShallowFoundationEffectiveGeometry({
    foundation,
    actionState,
  });
  const parameterSet = drainedMaterial({
    id: "kernel-sand",
    frictionAngle: 34,
    unitWeight: 0.135 * KCF,
  }).getParameterSet();
  const common = {
    parameterSet,
    effectiveGeometry: geometry,
    embedmentDepth: 2 * FOOT,
    surchargeStress: 0.27 * KSF,
    totalUnitWeightBelowBase: 0.135 * KCF,
    waterTableDepth: 13 * FOOT,
  };
  const usace = calculateShallowFoundationBearingCapacity({
    ...common,
    method: "usace-meyerhof-2025",
  });
  const fhwa = calculateShallowFoundationBearingCapacity({
    ...common,
    method: "fhwa-vesic-2002",
  });

  approx(usace.ultimateGrossBearingPressure / KSF, 32.15, 0.2);
  approx(fhwa.ultimateGrossBearingPressure / KSF, 25.86, 0.1);
  approx(usace.factors.bearing.nq, 29.44, 0.1);
  approx(fhwa.factors.shape.gamma, 0.6, 1e-12);
});

test("layered application reproduces USACE Example B-3 punch-through", () => {
  const input = b3Case();
  const analysis = new ShallowFoundationUltimateLimitStateAnalysis().analyze({
    ...input,
    units,
  });

  assert.equal(analysis.status, "ok");
  assert.equal(analysis.outputs.schemaVersion,
    SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION);
  const punch = analysis.outputs.bearing.punchThroughCandidates[0];
  approx(punch.spreadRatio, 3.45, 0.01);
  approx(
    analysis.outputs.bearing.methodCapacities["usace-meyerhof-2025"] / KSF,
    12.21,
    0.05,
  );
  approx(
    analysis.outputs.bearing.methodCapacities["fhwa-vesic-2002"] / KSF,
    11.56,
    0.05,
  );
  approx(analysis.outputs.bearing.demand / KSF, 2.14, 0.01);
  assert.equal(
    analysis.outputs.bearing.governingByMethod["usace-meyerhof-2025"]
      .governingMechanism.type,
    "strong-over-weak-punch-through",
  );
});

test("undrained bearing factors reproduce the rounded USACE Example B-4 values", () => {
  const clay = undrainedMaterial({
    id: "b4-clay",
    undrainedShearStrength: 0.85 * KSF,
    unitWeight: 0.113 * KCF,
  });
  const foundation = new ShallowFoundationModel({
    id: "b4-foundation",
    shape: "rectangular",
    geometry: { width: 7 * FOOT, length: 7 * FOOT },
    placement: { baseElevation: -2 * FOOT },
    units,
  });
  const geometry = calculateShallowFoundationEffectiveGeometry({
    foundation,
    actionState: totalActions({ verticalForce: 94.7 * KIP }),
  });
  const common = {
    parameterSet: clay.getParameterSet(),
    effectiveGeometry: geometry,
    embedmentDepth: 2 * FOOT,
    surchargeStress: 0.226 * KSF,
    totalUnitWeightBelowBase: 0.113 * KCF,
  };
  const usace = calculateShallowFoundationBearingCapacity({
    ...common,
    method: "usace-meyerhof-2025",
  });
  const fhwa = calculateShallowFoundationBearingCapacity({
    ...common,
    method: "fhwa-vesic-2002",
  });

  approx(usace.ultimateGrossBearingPressure / KSF, 5.78, 0.03);
  approx(fhwa.ultimateGrossBearingPressure / KSF, 5.47, 0.03);
  approx(usace.factors.depth.c, 1.057, 0.001);
  approx(fhwa.factors.depth.c, 1);
});

test("load inclination reduces USACE capacity while FHWA uses its documented omission", () => {
  const { foundation } = b3Case();
  const actionState = totalActions({ verticalForce: 1000, horizontalX: 200 });
  const geometry = calculateShallowFoundationEffectiveGeometry({
    foundation,
    actionState,
  });
  const parameterSet = drainedMaterial({
    id: "inclined-sand",
    frictionAngle: 34,
    unitWeight: 20,
  }).getParameterSet();
  const common = {
    parameterSet,
    effectiveGeometry: geometry,
    embedmentDepth: 0.6,
    surchargeStress: 12,
    totalUnitWeightBelowBase: 20,
  };
  const usace = calculateShallowFoundationBearingCapacity({
    ...common,
    method: "usace-meyerhof-2025",
  });
  const fhwa = calculateShallowFoundationBearingCapacity({
    ...common,
    method: "fhwa-vesic-2002",
  });

  assert.ok(usace.factors.inclination.q < 1);
  assert.equal(fhwa.factors.inclination.q, 1);
  assert.match(fhwa.factors.inclination.policy, /omitted-per-fhwa/);
});

test("base sliding uses the selected surface interface and explicit adhesion", () => {
  const foundation = new ShallowFoundationModel({
    id: "sliding-foundation",
    shape: "rectangular",
    geometry: { width: 2, length: 3 },
    placement: { baseElevation: -1 },
    units,
  });
  const geometry = calculateShallowFoundationEffectiveGeometry({
    foundation,
    actionState: totalActions({ verticalForce: 1000, horizontalX: 200 }),
  });
  const soil = drainedMaterial({
    id: "cohesive-sand",
    frictionAngle: 30,
    cohesion: 10,
  });
  const interfaceModel = new SoilStructureInterface({
    id: "cast-concrete-base",
    wallSurface: {
      typeId: "cast-concrete",
      materialType: "concrete",
      finish: "rough",
    },
    parameterSets: [{
      id: "interface-representative",
      basis: "representative",
      model: "soil-friction-ratio",
      frictionRatio: 2 / 3,
    }],
  });
  const output = calculateShallowFoundationSlidingResistance({
    parameterSet: soil.getParameterSet(),
    effectiveGeometry: geometry,
    porePressureAtBase: 5,
    interfaceModel,
    drainedAdhesionRatio: 0.5,
  });
  const expectedNormal = 1000 - 5 * 6;
  const expected = expectedNormal * Math.tan(20 * Math.PI / 180) +
    0.5 * 10 * 6;

  approx(output.capacity, expected);
  approx(output.interface.frictionAngle, 20 * Math.PI / 180);
  approx(output.utilizationRatio, 200 / expected);
});

test("assigned-grid pore pressure is explicitly outside the current ULS method", () => {
  const sand = drainedMaterial();
  const profile = GroundProfile.fromThicknesses({
    id: "grid-profile",
    groundSurfaceElevation: 0,
    materials: [sand],
    layers: [{ thickness: 10, materialId: sand.id }],
    groundwater: { model: "none" },
    units,
  });
  const field = new PorePressureField2D({
    id: "grid-field",
    model: "assigned-grid",
    assignedGrid: {
      xCoordinates: [-5, 5],
      zCoordinates: [-10, 0],
      values: [[100, 100], [0, 0]],
    },
    units,
  });
  const groundModel = new GroundModel({
    id: "grid-ground",
    materials: [sand],
    profiles: [profile],
    porePressureFields: [field],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "grid-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    profileId: profile.id,
    porePressureFieldId: field.id,
    units,
  });
  const foundation = new ShallowFoundationModel({
    id: "grid-foundation",
    shape: "rectangular",
    geometry: { width: 2, length: 2 },
    placement: { baseElevation: -1 },
    units,
  });
  const analysis = new ShallowFoundationUltimateLimitStateAnalysis().analyze({
    groundModel,
    designSituation,
    foundation,
    actionState: totalActions(),
    units,
  });

  assert.equal(analysis.status, "not-supported");
  assert.match(analysis.warnings[0], /Assigned-grid/);
});

test("application returns a serializable result and an explicit failed kern check", () => {
  const sand = drainedMaterial({ id: "application-sand" });
  const profile = GroundProfile.fromThicknesses({
    id: "application-profile",
    groundSurfaceElevation: 0,
    materials: [sand],
    layers: [{ thickness: 10, materialId: sand.id }],
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new GroundModel({
    id: "application-ground",
    materials: [sand],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "application-uls",
    groundModel,
    limitState: "ULS",
    drainageCondition: "drained",
    profileId: profile.id,
    units,
  });
  const result = new GeotechnicalShallowFoundationApplication().run({
    groundModel,
    designSituation,
    foundation: new ShallowFoundationModel({
      id: "application-foundation",
      shape: "rectangular",
      geometry: { width: 2, length: 3 },
      placement: { baseElevation: -1 },
      units,
    }),
    actionState: totalActions({ verticalForce: 1000, momentY: 400 }),
    units,
  });
  const serialized = JSON.parse(JSON.stringify(result.toJSON()));

  assert.equal(result.applicationId, "geotechnical-shallow-foundations");
  assert.equal(result.status, "not-verified");
  assert.equal(serialized.outputs.schemaVersion,
    SHALLOW_FOUNDATION_ULS_RESULT_SCHEMA_VERSION);
  assert.equal(
    serialized.outputs.checks.find(({ id }) => id === "full-compression-kern")
      .ok,
    false,
  );
});
