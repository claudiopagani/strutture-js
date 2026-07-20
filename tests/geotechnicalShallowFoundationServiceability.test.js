import assert from "node:assert/strict";
import test from "node:test";

import {
  GeotechnicalDesignSituation,
  GeotechnicalShallowFoundationApplication,
  GroundModel,
  GroundProfile,
  SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION,
  ShallowFoundationActionState,
  ShallowFoundationModel,
  ShallowFoundationServiceabilityAnalysis,
  SoilMaterial,
  calculateRigidFoundationElasticStiffness,
  calculateSchmertmannStrainInfluence,
  calculateShallowFoundationDifferentialMovement,
  calculateShallowFoundationVerticalStressInfluence,
} from "../src/index.js";

const units = Object.freeze({ force: "kN", length: "m" });
const FOOT = 0.3048;
const INCH = 0.0254;
const TSF = 95.7605179606716;
const PCF = 0.157087463846246;

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function strengthSet() {
  return {
    id: "drained-strength",
    basis: "representative",
    drainage: "drained",
    strength: {
      model: "mohr-coulomb-effective",
      frictionAngle: 32,
      cohesion: 0,
    },
  };
}

function actions({ verticalForce = 1000, momentX = 0, momentY = 0 } = {}) {
  return new ShallowFoundationActionState({
    id: "sls-actions",
    basis: "total",
    resultantScope: "total-at-foundation-base",
    actions: { verticalForce, momentX, momentY },
    units,
  });
}

function homogeneousCase({ deformationParameterSet, depth = 20 } = {}) {
  const material = new SoilMaterial({
    id: "homogeneous-soil",
    name: "Homogeneous soil",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [strengthSet()],
    deformationParameterSets: [deformationParameterSet],
    angleUnits: "deg",
    units,
  });
  const profile = GroundProfile.fromThicknesses({
    id: "homogeneous-profile",
    groundSurfaceElevation: 0,
    materials: [material],
    layers: [{
      id: "homogeneous-layer",
      thickness: depth,
      materialId: material.id,
    }],
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new GroundModel({
    id: "homogeneous-ground",
    materials: [material],
    profiles: [profile],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "homogeneous-sls",
    groundModel,
    limitState: "SLS",
    timeCondition: "short-term",
    drainageCondition: deformationParameterSet.drainage,
    profileId: profile.id,
    parameterSelection: {
      deformationByLayer: {
        "homogeneous-layer": deformationParameterSet.id,
      },
    },
    units,
  });
  return { material, profile, groundModel, designSituation };
}

function schmertmannC7Case() {
  const coneTipResistanceTsf = [100, 100, 160, 100, 300, 160, 200];
  const layerBottomDepthFeet = [1.5, 2.5, 4, 7.5, 9.5, 12.5, 16];
  const deformationParameterSets = coneTipResistanceTsf.map((value, index) => ({
    id: `cpt-${index + 1}`,
    basis: "measured",
    drainage: "drained",
    model: "schmertmann-cpt",
    coneTipResistance: value * TSF,
    provenance: {
      source: "USACE EM 1110-1-1905 (2025), Appendix C, Example C-7",
    },
  }));
  const material = new SoilMaterial({
    id: "c7-sand",
    name: "C-7 sand",
    unitWeight: { bulk: 125 * PCF },
    parameterSets: [strengthSet()],
    deformationParameterSets,
    angleUnits: "deg",
    units,
  });
  const baseDepth = 2.5 * FOOT;
  const layers = [{
    id: "cover",
    topElevation: 0,
    bottomElevation: -baseDepth,
    materialId: material.id,
  }];
  let topElevation = -baseDepth;
  for (let index = 0; index < layerBottomDepthFeet.length; index += 1) {
    const bottomElevation = -baseDepth - layerBottomDepthFeet[index] * FOOT;
    layers.push({
      id: `cpt-layer-${index + 1}`,
      topElevation,
      bottomElevation,
      materialId: material.id,
    });
    topElevation = bottomElevation;
  }
  const profile = new GroundProfile({
    id: "c7-profile",
    groundSurfaceElevation: 0,
    materials: [material],
    layers,
    groundwater: { model: "none" },
    units,
  });
  const groundModel = new GroundModel({
    id: "c7-ground",
    materials: [material],
    profiles: [profile],
    units,
  });
  const deformationByLayer = { cover: "cpt-1" };
  for (let index = 0; index < layerBottomDepthFeet.length; index += 1) {
    deformationByLayer[`cpt-layer-${index + 1}`] = `cpt-${index + 1}`;
  }
  const designSituation = new GeotechnicalDesignSituation({
    id: "c7-sls",
    groundModel,
    limitState: "SLS",
    timeCondition: "short-term",
    drainageCondition: "drained",
    profileId: profile.id,
    parameterSelection: { deformationByLayer },
    units,
  });
  const foundation = new ShallowFoundationModel({
    id: "c7-foundation",
    shape: "rectangular",
    geometry: { width: 8 * FOOT, length: 8 * FOOT },
    placement: { baseElevation: -baseDepth },
    units,
  });
  const area = (8 * FOOT) ** 2;
  return {
    groundModel,
    designSituation,
    foundation,
    actionState: actions({ verticalForce: 3.31 * TSF * area }),
  };
}

test("soil deformation sets are typed, converted and selected independently", () => {
  const material = new SoilMaterial({
    id: "typed-soil",
    name: "Typed soil",
    unitWeight: { bulk: 18 },
    parameterSets: [strengthSet()],
    deformationParameterSets: [{
      id: "elastic-sec",
      basis: "representative",
      drainage: "drained",
      model: "isotropic-elastic",
      shearModulus: 12000,
      poissonRatio: 0.25,
      modulusDefinition: "secant",
      stressRange: [0, 300],
      strainRange: [0, 0.02],
      provenance: { source: "site-specific pressuremeter interpretation" },
    }],
    angleUnits: "deg",
    units,
  });
  const selected = material.getDeformationParameterSet();

  assert.equal(selected.model, "isotropic-elastic");
  approx(selected.youngModulus, 30000);
  assert.equal(material.toJSON().defaultDeformationParameterSetId, "elastic-sec");
  assert.throws(() => new SoilMaterial({
    id: "missing-provenance",
    name: "Missing provenance",
    unitWeight: { bulk: 18 },
    parameterSets: [strengthSet()],
    deformationParameterSets: [{
      id: "invalid",
      basis: "representative",
      drainage: "drained",
      model: "constrained-modulus",
      constrainedModulus: 10000,
    }],
    angleUnits: "deg",
    units,
  }), /provenance.source/);
});

test("USACE stress and Schmertmann strain influence equations match tabulated C-7 values", () => {
  const stressInfluence = calculateShallowFoundationVerticalStressInfluence({
    shape: "rectangular",
    width: 8,
    length: 8,
    depth: 2.6,
  });
  approx(stressInfluence, 0.882, 0.001);

  const peakInfluence = 0.779;
  const layerOne = calculateSchmertmannStrainInfluence({
    depth: 0.75,
    width: 8,
    lengthToWidthRatio: 1,
    peakInfluence,
  });
  const layerFour = calculateSchmertmannStrainInfluence({
    depth: 5.75,
    width: 8,
    lengthToWidthRatio: 1,
    peakInfluence,
  });
  approx(layerOne.rectangular, 0.227, 0.001);
  approx(layerFour.rectangular, 0.665, 0.001);
});

test("Schmertmann CPT analysis reproduces the internally consistent C-7 equation path", () => {
  const output = new ShallowFoundationServiceabilityAnalysis().analyze({
    ...schmertmannC7Case(),
    method: "usace-schmertmann-cpt-2025",
    units,
  });

  assert.equal(output.status, "ok");
  approx(output.outputs.methodResult.factors.peakInfluence, 0.779, 0.001);
  approx(output.outputs.methodResult.factors.embedmentFactor, 0.975, 0.001);
  approx(output.outputs.settlement.value / INCH, 0.71627, 0.001);
  assert.equal(output.outputs.methodResult.timeEffects.status, "not-included");
  assert.equal(output.outputs.methodResult.convergence.converged, true);
});

test("incremental constrained-modulus analysis resolves stratigraphy and convergence", () => {
  const deformationParameterSet = {
    id: "dmt-modulus",
    basis: "measured",
    drainage: "drained",
    model: "constrained-modulus",
    constrainedModulus: 12000,
    modulusDefinition: "tangent",
    settlementComponent: "immediate",
    testMethod: "dmt",
    provenance: { source: "site-specific DMT" },
  };
  const { groundModel, designSituation } = homogeneousCase({
    deformationParameterSet,
  });
  const foundation = new ShallowFoundationModel({
    id: "dmt-foundation",
    shape: "rectangular",
    geometry: { width: 2, length: 2 },
    placement: { baseElevation: -1 },
    units,
  });
  const output = new ShallowFoundationServiceabilityAnalysis().analyze({
    groundModel,
    designSituation,
    foundation,
    actionState: actions({ verticalForce: 900 }),
    method: "usace-incremental-constrained-modulus-2025",
    units,
  });

  assert.equal(output.status, "ok");
  assert.ok(output.outputs.settlement.value > 0);
  assert.equal(output.outputs.methodResult.convergence.converged, true);
  assert.ok(output.outputs.methodResult.sublayers.length > 8);
  assert.ok(output.outputs.methodResult.sublayers.every(
    ({ deformationParameterSetId }) => deformationParameterSet.id ===
      deformationParameterSetId,
  ));
});

test("NIST Pais-Kausel stiffness gives static settlement, rotations and plane movements", () => {
  const elastic = {
    id: "elastic-sec",
    basis: "representative",
    drainage: "drained",
    model: "isotropic-elastic",
    youngModulus: 30000,
    poissonRatio: 0.3,
    modulusDefinition: "secant",
    settlementComponent: "immediate",
    provenance: { source: "site-specific triaxial secant modulus" },
  };
  const { groundModel, designSituation } = homogeneousCase({
    deformationParameterSet: elastic,
  });
  const foundation = new ShallowFoundationModel({
    id: "elastic-foundation",
    shape: "rectangular",
    geometry: { width: 2, length: 4 },
    placement: { baseElevation: -1 },
    units,
  });
  const actionState = actions({
    verticalForce: 1000,
    momentX: 100,
    momentY: 50,
  });
  const output = new ShallowFoundationServiceabilityAnalysis().analyze({
    groundModel,
    designSituation,
    foundation,
    actionState,
    method: "nist-pais-kausel-elastic-2012",
    analysisSettings: { embedmentContact: "surface-equivalent" },
    units,
  });
  const G = 30000 / (2 * 1.3);
  const stiffness = calculateRigidFoundationElasticStiffness({
    width: 2,
    length: 4,
    shearModulus: G,
    poissonRatio: 0.3,
  });
  const netVertical = 1000 - 18 * 1 * 8;

  assert.equal(output.status, "ok");
  approx(stiffness.stiffness.vertical, 112311.39188856645, 1e-8);
  approx(output.outputs.settlement.value, netVertical / stiffness.stiffness.vertical);
  approx(
    output.outputs.rotation.x,
    100 / stiffness.stiffness.rockingAboutShortAxis,
  );
  approx(
    output.outputs.rotation.y,
    50 / stiffness.stiffness.rockingAboutLongAxis,
  );
  const cornerAverage = output.outputs.cornerMovements.reduce(
    (sum, point) => sum + point.settlement,
    0,
  ) / 4;
  approx(cornerAverage, output.outputs.settlement.value);
  assert.equal(
    output.outputs.structuralCoupling.stiffnessStatus,
    "available-for-rigid-point-support-model",
  );
});

test("elastic branch applies embedment only when full sidewall contact is explicit", () => {
  const surface = calculateRigidFoundationElasticStiffness({
    width: 2,
    length: 4,
    embedmentDepth: 1,
    shearModulus: 10000,
    poissonRatio: 0.3,
    embedmentContact: "surface-equivalent",
  });
  const embedded = calculateRigidFoundationElasticStiffness({
    width: 2,
    length: 4,
    embedmentDepth: 1,
    shearModulus: 10000,
    poissonRatio: 0.3,
    embedmentContact: "full-sidewall-contact",
  });

  assert.deepEqual(surface.embedmentModifiers, {
    vertical: 1,
    rockingAboutShortAxis: 1,
    rockingAboutLongAxis: 1,
  });
  assert.ok(embedded.stiffness.vertical > surface.stiffness.vertical);
  assert.ok(
    embedded.stiffness.rockingAboutLongAxis >
      surface.stiffness.rockingAboutLongAxis,
  );
});

test("differential movement preserves signed settlement and checks angular distortion", () => {
  const output = calculateShallowFoundationDifferentialMovement({
    firstMovement: {
      foundationId: "F1",
      placement: { x: 0, y: 0 },
      settlement: 0.01,
    },
    secondMovement: {
      foundationId: "F2",
      placement: { x: 5, y: 0 },
      settlement: 0.02,
    },
    criteria: {
      maximumDifferentialSettlement: 0.015,
      maximumAngularDistortion: 1 / 600,
    },
    units,
  });

  approx(output.differentialSettlement, 0.01);
  approx(output.angularDistortion, 0.002);
  assert.equal(output.status, "not-verified");
  assert.equal(
    output.checks.find(({ id }) => id === "maximum-differential-settlement")
      .ok,
    true,
  );
  assert.equal(
    output.checks.find(({ id }) => id === "maximum-angular-distortion").ok,
    false,
  );
});

test("differential movement consumes movement-state units independently", () => {
  const output = calculateShallowFoundationDifferentialMovement({
    firstMovement: {
      foundationId: "F1",
      placement: { x: 0, y: 0 },
      settlement: 0.01,
      units,
    },
    secondMovement: {
      foundationId: "F2",
      placement: { x: 5, y: 0 },
      settlement: 0.02,
      units,
    },
    criteria: { maximumDifferentialSettlement: 15 },
    units: { force: "kN", length: "mm" },
  });

  approx(output.differentialSettlement, 0.01);
  approx(output.supportDistance, 5);
  assert.equal(output.checks[0].capacity, 0.015);
});

test("application dispatches SLS and returns a serializable result", () => {
  const input = schmertmannC7Case();
  const output = new GeotechnicalShallowFoundationApplication().run({
    ...input,
    method: "usace-schmertmann-cpt-2025",
    criteria: { maximumSettlement: 1 * INCH },
    units,
  });
  const serialized = JSON.parse(JSON.stringify(output.toJSON()));

  assert.equal(output.status, "ok");
  assert.equal(
    serialized.outputs.schemaVersion,
    SHALLOW_FOUNDATION_SLS_RESULT_SCHEMA_VERSION,
  );
  assert.equal(serialized.outputs.movementState.foundationId, "c7-foundation");
  assert.equal(
    serialized.outputs.checks.find(({ id }) => id === "maximum-settlement").ok,
    true,
  );
});

test("time-dependent deformation data remain outside the immediate SLS solver", () => {
  const deformationParameterSet = {
    id: "consolidation-modulus",
    basis: "measured",
    drainage: "drained",
    model: "constrained-modulus",
    constrainedModulus: 8000,
    modulusDefinition: "secant",
    settlementComponent: "primary-consolidation",
    testMethod: "oedometer",
    provenance: { source: "laboratory oedometer" },
  };
  const { groundModel, designSituation } = homogeneousCase({
    deformationParameterSet,
  });
  const output = new ShallowFoundationServiceabilityAnalysis().analyze({
    groundModel,
    designSituation,
    foundation: new ShallowFoundationModel({
      id: "clay-foundation",
      shape: "rectangular",
      geometry: { width: 2, length: 2 },
      placement: { baseElevation: -1 },
      units,
    }),
    actionState: actions(),
    method: "usace-incremental-constrained-modulus-2025",
    units,
  });

  assert.equal(output.status, "not-supported");
  assert.match(output.warnings[0], /consolidation workflow/);
});
