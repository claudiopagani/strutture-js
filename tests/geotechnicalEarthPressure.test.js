import test from "node:test";
import assert from "node:assert/strict";

import {
  GeotechnicalEarthPressureApplication,
  GroundProfile,
  LateralEarthPressureAnalysis,
  SoilMaterial,
  SoilStructureInterface,
  VerticalStressProfile,
  coulombActiveEarthPressureCoefficient,
  coulombPassiveEarthPressureCoefficient,
  mononobeOkabeActiveEarthPressureCoefficient,
  rankineEarthPressureCoefficients,
} from "../src/index.js";
import {
  SOIL_TYPE_CATALOG,
  createSoilMaterialFromType,
} from "../src/catalogs/soil-types.js";
import {
  createSoilStructureInterfaceFromWallSurface,
  getUSACE2022InterfaceRecommendation,
} from "../src/catalogs/wall-interface-types.js";
import {
  calculateNTC2018RetainingWallSeismicCoefficients,
  createNTC2018MononobeOkabeSeismicInput,
} from "../src/norms/ntc2018/index.js";

const units = { force: "kN", length: "m" };

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function soil({
  id = "sand",
  name = "Sand",
  phi = 30,
  cohesion = 0,
  bulk = 18,
  saturated = 20,
  basis = "characteristic",
  k0 = null,
  inputUnits = units,
  angleUnits = "deg",
} = {}) {
  return new SoilMaterial({
    id,
    name,
    unitWeight: { bulk, saturated },
    parameterSets: [{
      id: "drained",
      basis,
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle: phi,
        cohesion,
      },
      atRest: k0 == null ? null : { coefficient: k0, method: "assigned-test" },
      provenance: { source: "test-fixture" },
    }],
    defaultParameterSetId: "drained",
    angleUnits,
    units: inputUnits,
  });
}

function homogeneousProfile({
  material = soil(),
  groundSurfaceElevation = 10,
  thickness = 10,
  groundwater = null,
  inputUnits = units,
} = {}) {
  return GroundProfile.fromThicknesses({
    id: "profile",
    groundSurfaceElevation,
    materials: [material],
    layers: [{ id: "layer", thickness, materialId: material.id }],
    groundwater,
    units: inputUnits,
  });
}

function undrainedSoil({
  id = "clay",
  undrainedShearStrength = 20,
  bulk = 18,
  k0 = 1,
} = {}) {
  return new SoilMaterial({
    id,
    name: "Undrained clay",
    unitWeight: { bulk, saturated: bulk + 1 },
    parameterSets: [{
      id: "undrained",
      basis: "characteristic",
      drainage: "undrained",
      strength: {
        model: "total-stress-undrained",
        undrainedShearStrength,
      },
      atRest: { coefficient: k0, method: "assigned-test" },
      provenance: { source: "test-fixture" },
    }],
    defaultParameterSetId: "undrained",
    units,
  });
}

function analyze(profile, overrides = {}) {
  return new LateralEarthPressureAnalysis().analyze({
    profile,
    state: "active",
    method: "rankine",
    units,
    ...overrides,
  });
}

test("soil catalog classifies materials without supplying numeric parameters", () => {
  assert.equal(
    SOIL_TYPE_CATALOG["sandy-soil"].classificationStatus,
    "generic-entry-not-a-site-classification",
  );
  assert.deepEqual(
    SOIL_TYPE_CATALOG["sandy-soil"].referenceParameterRanges,
    {},
  );

  const material = createSoilMaterialFromType({
    soilTypeId: "sandy-soil",
    id: "site-sand",
    name: "Site sand",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [{
      id: "project-values",
      basis: "characteristic",
      drainage: "drained",
      strength: {
        frictionAngle: 32,
        cohesion: 0,
      },
      provenance: { source: "ground-investigation" },
    }],
    angleUnits: "deg",
    units,
  });

  assert.equal(material.soilTypeId, "sandy-soil");
  assert.equal(material.metadata.catalogProvidedNumericParameters, false);
});

test("wall-surface catalog resolves traceable soil-dependent interface friction", () => {
  const paintedSteel = getUSACE2022InterfaceRecommendation({
    wallSurfaceTypeId: "painted-steel-smooth",
    soilInterfaceClassId: "medium-sand",
  });
  const formedConcrete = getUSACE2022InterfaceRecommendation({
    wallSurfaceTypeId: "formed-concrete",
    soilInterfaceClassId: "medium-sand",
  });
  const castConcrete = getUSACE2022InterfaceRecommendation({
    wallSurfaceTypeId: "rough-concrete-cast-against-ground",
    soilInterfaceClassId: "medium-sand",
  });

  assert.equal(paintedSteel.value, 14);
  assert.equal(formedConcrete.value, 24);
  assert.equal(castConcrete.value, 28);
  assert.equal(formedConcrete.basis, "indicative");

  const interfaceModel = createSoilStructureInterfaceFromWallSurface({
    id: "formed-concrete-medium-sand",
    wallSurfaceTypeId: "formed-concrete",
    soilInterfaceClassId: "medium-sand",
  });
  const resolved = interfaceModel.resolveFrictionAngle({
    soilFrictionAngles: [20 * Math.PI / 180, 30 * Math.PI / 180],
  });

  assert.ok(interfaceModel instanceof SoilStructureInterface);
  approx(resolved.nominalFrictionAngle, 24 * Math.PI / 180);
  approx(resolved.frictionAngle, 20 * Math.PI / 180);
  assert.equal(resolved.cappedBySoilFriction, true);
  assert.equal(interfaceModel.toJSON().schemaVersion,
    "soil-structure-interface/v1");
  assert.throws(() => getUSACE2022InterfaceRecommendation({
    wallSurfaceTypeId: "masonry-custom",
    soilInterfaceClassId: "medium-sand",
  }), /explicit project interface parameter/);
});

test("indicative wall-interface recommendations require explicit authorization", () => {
  const profile = homogeneousProfile({ material: soil({ phi: 30 }) });
  const interfaceModel = createSoilStructureInterfaceFromWallSurface({
    id: "formed-concrete-medium-sand",
    wallSurfaceTypeId: "formed-concrete",
    soilInterfaceClassId: "medium-sand",
  });
  const blocked = analyze(profile, {
    method: "coulomb-active",
    interface: interfaceModel,
  });
  const authorized = analyze(profile, {
    method: "coulomb-active",
    interface: interfaceModel,
    allowIndicativeValues: true,
  });

  assert.equal(blocked.status, "not-supported");
  assert.equal(authorized.status, "ok");
  approx(authorized.outputs.interface.frictionAngle, 24 * Math.PI / 180);
  assert.ok(authorized.warnings.some((warning) => warning.includes("indicative")));
});

test("GroundProfile normalizes layers and hydrostatic effective stress", () => {
  const profile = homogeneousProfile({
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: 5,
      waterUnitWeight: 9.81,
    },
  });
  const state = new VerticalStressProfile({ profile }).evaluate(0);

  approx(state.totalVerticalStress, 18 * 5 + 20 * 5);
  approx(state.porePressure, 9.81 * 5);
  approx(state.effectiveVerticalStress, 18 * 5 + (20 - 9.81) * 5);
  assert.equal(profile.toJSON().schemaVersion, "ground-profile/v1");
});

test("Rankine active pressure integrates a homogeneous triangular diagram", () => {
  const result = analyze(homogeneousProfile());
  const diagram = result.outputs.diagram;

  assert.equal(result.status, "ok");
  approx(diagram.segments[0].coefficient, 1 / 3);
  approx(diagram.segments.at(-1).bottom.totalNormal, 60);
  approx(diagram.resultants.totalNormal.forcePerUnitWidth, 300);
  approx(diagram.resultants.totalNormal.applicationElevation, 10 / 3);
});

test("layered Rankine pressure preserves coefficient jumps at interfaces", () => {
  const upper = soil({ id: "upper", phi: 30, bulk: 18 });
  const lower = soil({ id: "lower", phi: 36, bulk: 20 });
  const profile = new GroundProfile({
    id: "layered",
    groundSurfaceElevation: 10,
    materials: [upper, lower],
    layers: [
      { id: "upper-layer", topElevation: 10, bottomElevation: 5, materialId: upper.id },
      { id: "lower-layer", topElevation: 5, bottomElevation: 0, materialId: lower.id },
    ],
    units,
  });
  const result = analyze(profile);
  const [upperSegment, lowerSegment] = result.outputs.diagram.segments;
  const lowerKa = rankineEarthPressureCoefficients({
    frictionAngle: 36 * Math.PI / 180,
  }).active;

  approx(upperSegment.bottom.totalNormal, 30);
  approx(lowerSegment.top.totalNormal, lowerKa * 90);
  assert.notEqual(upperSegment.bottom.totalNormal, lowerSegment.top.totalNormal);
  approx(
    result.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
    0.5 * 30 * 5 + 0.5 * (lowerKa * 90 + lowerKa * 190) * 5,
  );
});

test("water pressure remains separate from effective soil pressure", () => {
  const profile = homogeneousProfile({
    groundwater: {
      model: "hydrostatic",
      waterTableElevation: 5,
      waterUnitWeight: 9.81,
    },
  });
  const result = analyze(profile);
  const bottom = result.outputs.diagram.segments.at(-1).bottom;
  const resultants = result.outputs.diagram.resultants;

  approx(bottom.effectiveSoilNormal, (18 * 5 + (20 - 9.81) * 5) / 3);
  approx(bottom.waterNormal, 9.81 * 5);
  approx(bottom.totalNormal, bottom.effectiveSoilNormal + bottom.waterNormal);
  approx(resultants.waterNormal.forcePerUnitWidth, 0.5 * 9.81 * 5 ** 2);
});

test("active cohesive pressure clips tension and inserts a zero-pressure breakpoint", () => {
  const profile = homogeneousProfile({
    material: soil({ cohesion: 10 }),
  });
  const result = analyze(profile);
  const diagram = result.outputs.diagram;
  const tensionDepth = 2 * 10 * Math.sqrt(1 / 3) / (18 / 3);
  const loadedHeight = 10 - tensionDepth;
  const bottomPressure = 60 - 2 * 10 * Math.sqrt(1 / 3);

  assert.equal(result.status, "ok");
  assert.equal(diagram.segments.length, 2);
  approx(diagram.segments[0].bottomElevation, 10 - tensionDepth);
  approx(diagram.resultants.effectiveSoilNormal.forcePerUnitWidth,
    0.5 * bottomPressure * loadedHeight);
  assert.ok(result.warnings.some((warning) => warning.includes("clipped")));
});

test("assigned K0 and Jaky produce traceable at-rest pressures", () => {
  const profile = homogeneousProfile({ material: soil({ k0: 0.5 }) });
  const explicit = analyze(profile, {
    state: "at-rest",
    method: "at-rest-explicit",
  });
  const jaky = analyze(profile, {
    state: "at-rest",
    method: "jaky-nc",
  });

  approx(explicit.outputs.diagram.resultants.totalNormal.forcePerUnitWidth, 450);
  approx(jaky.outputs.diagram.resultants.totalNormal.forcePerUnitWidth, 450);
  assert.ok(jaky.assumptions.some((assumption) => assumption.includes("normally consolidated")));
});

test("Coulomb active reduces to Rankine for a smooth vertical wall", () => {
  const phi = 30 * Math.PI / 180;
  const rankine = rankineEarthPressureCoefficients({ frictionAngle: phi });
  const coulomb = coulombActiveEarthPressureCoefficient({
    frictionAngle: phi,
    interfaceFrictionAngle: 0,
  });

  approx(coulomb.coefficient, rankine.active);
  const result = analyze(homogeneousProfile(), {
    method: "coulomb-active",
    interface: { frictionAngle: 0, angleUnits: "deg" },
  });
  approx(result.outputs.diagram.resultants.totalNormal.forcePerUnitWidth, 300);
});

test("Coulomb coefficients support planar slopes and a guarded passive branch", () => {
  const phi = 30 * Math.PI / 180;
  const beta = 10 * Math.PI / 180;
  const active = coulombActiveEarthPressureCoefficient({
    frictionAngle: phi,
    backfillInclination: beta,
  });
  const passive = coulombPassiveEarthPressureCoefficient({
    frictionAngle: phi,
    backfillInclination: beta,
  });

  approx(active.coefficient, 0.3736789578194454);
  approx(passive.coefficient, 4.080353483615686);
  const battered = coulombActiveEarthPressureCoefficient({
    frictionAngle: 35 * Math.PI / 180,
    wallInclinationFromVertical: 10 * Math.PI / 180,
  });
  approx(battered.coefficient, 0.20905929357334757);
  assert.throws(() => coulombPassiveEarthPressureCoefficient({
    frictionAngle: phi,
    interfaceFrictionAngle: 11 * Math.PI / 180,
  }), /phi\/3/);

  const profile = homogeneousProfile();
  const activeResult = analyze(profile, {
    method: "coulomb-active",
    geometry: { backfillInclination: 10, angleUnits: "deg" },
  });
  const passiveResult = analyze(profile, {
    state: "passive",
    method: "coulomb-passive",
    geometry: { backfillInclination: 10, angleUnits: "deg" },
  });
  const inclinedWallResult = analyze(homogeneousProfile({
    material: soil({ phi: 35 }),
  }), {
    method: "coulomb-active",
    geometry: { wallInclinationFromVertical: 10, angleUnits: "deg" },
  });

  assert.equal(activeResult.status, "ok");
  assert.equal(passiveResult.status, "ok");
  approx(activeResult.outputs.diagram.segments[0].coefficient,
    0.3736789578194454);
  approx(passiveResult.outputs.diagram.segments[0].coefficient,
    4.080353483615686);
  approx(inclinedWallResult.outputs.diagram.segments[0].coefficient,
    0.20905929357334757);
  approx(
    inclinedWallResult.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
    188.15336421601282,
  );
  assert.equal(
    inclinedWallResult.outputs.diagram.metadata.pressureDistributionBasis,
    "per-unit-vertical-projection",
  );
  assert.equal(
    inclinedWallResult.outputs.geometry.wallInclinationPositiveDirection,
    "wall-top-toward-retained-ground",
  );
});

test("Rankine total-stress analysis supports undrained active, passive and at-rest states", () => {
  const profile = homogeneousProfile({ material: undrainedSoil() });
  const active = analyze(profile);
  const passive = analyze(profile, { state: "passive", method: "rankine" });
  const atRest = analyze(profile, {
    state: "at-rest",
    method: "at-rest-explicit",
  });

  assert.equal(active.status, "ok");
  approx(active.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
    544.4444444444445);
  approx(
    active.outputs.diagram.resultants.totalStressSoilNormal.forcePerUnitWidth,
    544.4444444444445,
  );
  assert.equal(
    active.outputs.diagram.resultants.effectiveSoilNormal.coverage,
    "not-applicable",
  );
  approx(passive.outputs.diagram.resultants.totalNormal.forcePerUnitWidth, 1300);
  approx(atRest.outputs.diagram.resultants.totalNormal.forcePerUnitWidth, 900);
  assert.ok(active.assumptions.some((assumption) =>
    assumption.includes("total stress")));
});

test("Mononobe-Okabe recovers static Coulomb when kh and kv are zero", () => {
  const phi = 30 * Math.PI / 180;
  const delta = 10 * Math.PI / 180;
  const staticCoefficient = coulombActiveEarthPressureCoefficient({
    frictionAngle: phi,
    interfaceFrictionAngle: delta,
  });
  const seismicCoefficient = mononobeOkabeActiveEarthPressureCoefficient({
    frictionAngle: phi,
    interfaceFrictionAngle: delta,
    horizontalSeismicCoefficient: 0,
    verticalSeismicCoefficient: 0,
  });

  approx(seismicCoefficient.coefficient, staticCoefficient.coefficient);
  approx(seismicCoefficient.equivalentCoefficient, staticCoefficient.coefficient);
});

test("Mononobe-Okabe returns thrust only unless a distribution is explicit", () => {
  const profile = homogeneousProfile();
  const thrustOnly = analyze(profile, {
    state: "seismic-active",
    method: "mononobe-okabe-active",
    interface: { frictionAngle: 0, angleUnits: "deg" },
    seismic: { kh: 0.1, kv: 0, distributionModel: "resultant-only" },
  });
  const triangular = analyze(profile, {
    state: "seismic-active",
    method: "mononobe-okabe-active",
    interface: { frictionAngle: 0, angleUnits: "deg" },
    seismic: { kh: 0.1, kv: 0, distributionModel: "triangular-equivalent" },
  });

  assert.equal(thrustOnly.status, "ok");
  assert.equal(thrustOnly.outputs.diagram, null);
  assert.ok(thrustOnly.outputs.resultants.seismicTotal.magnitude >
    thrustOnly.outputs.resultants.staticReference.magnitude);
  assert.equal(triangular.status, "ok");
  approx(
    triangular.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
    triangular.outputs.resultants.seismicTotal.normal,
  );
  approx(triangular.outputs.resultants.seismicTotal.applicationElevation, 10 / 3);
  assert.ok(triangular.warnings.some((warning) => warning.includes("explicitly requested")));
});

test("closed-form Coulomb and Mononobe-Okabe require the wall top at ground surface", () => {
  const profile = homogeneousProfile();
  const coulomb = analyze(profile, {
    method: "coulomb-active",
    geometry: { topElevation: 8, bottomElevation: 0 },
  });
  const seismic = analyze(profile, {
    state: "seismic-active",
    method: "mononobe-okabe-active",
    geometry: { topElevation: 8, bottomElevation: 0 },
    seismic: { kh: 0.1, kv: 0 },
  });

  assert.equal(coulomb.status, "not-supported");
  assert.equal(seismic.status, "not-supported");
  assert.match(coulomb.summary, /wall top/);
  assert.match(seismic.summary, /wall top/);
});

test("layered pseudostatic analysis remains distinct from Mononobe-Okabe", () => {
  const upper = soil({ id: "upper" });
  const lower = soil({ id: "lower", phi: 34 });
  const profile = new GroundProfile({
    id: "layered-seismic",
    groundSurfaceElevation: 10,
    materials: [upper, lower],
    layers: [
      { id: "upper", topElevation: 10, bottomElevation: 5, materialId: upper.id },
      { id: "lower", topElevation: 5, bottomElevation: 0, materialId: lower.id },
    ],
    units,
  });
  const mononobeOkabe = analyze(profile, {
    state: "seismic-active",
    method: "mononobe-okabe-active",
    seismic: { kh: 0.1, kv: 0 },
  });
  const trialWedge = analyze(profile, {
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    seismic: { kh: 0.1, kv: 0 },
  });

  assert.equal(mononobeOkabe.status, "not-supported");
  assert.equal(trialWedge.status, "ok");
  assert.equal(trialWedge.outputs.method, "trial-wedge-pseudostatic");
  assert.equal(trialWedge.outputs.diagram, null);
  assert.ok(trialWedge.outputs.criticalWedges.seismic.segments.length >= 2);
  assert.doesNotThrow(() => JSON.stringify(trialWedge));
  assert.ok(trialWedge.warnings.some((warning) =>
    warning.includes("constant-inclination")));
});

test("homogeneous trial wedge recovers Mononobe-Okabe and supports sloping ground", () => {
  const profile = homogeneousProfile({ material: soil({ phi: 35 }) });
  const mononobeOkabe = analyze(profile, {
    state: "seismic-active",
    method: "mononobe-okabe-active",
    seismic: { kh: 0.2, kv: 0 },
  });
  const trialWedge = analyze(profile, {
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    seismic: { kh: 0.2, kv: 0, search: { sampleCount: 361 } },
  });
  const sloping = analyze(profile, {
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    geometry: { backfillInclination: 10, angleUnits: "deg" },
    seismic: { kh: 0.2, kv: 0, search: { sampleCount: 361 } },
  });

  assert.equal(trialWedge.status, "ok");
  approx(
    trialWedge.outputs.resultants.seismicTotal.magnitude,
    mononobeOkabe.outputs.resultants.seismicTotal.magnitude,
    1e-8,
  );
  approx(trialWedge.outputs.homogeneousEquivalentCoefficient,
    0.3955858126218416, 1e-10);
  assert.equal(sloping.status, "ok");
  approx(sloping.outputs.homogeneousEquivalentCoefficient,
    0.46132767699036736, 1e-10);
});

test("inclined frictional trial wedge recovers homogeneous Coulomb at kh zero", () => {
  const profile = homogeneousProfile({ material: soil({ phi: 35 }) });
  const result = analyze(profile, {
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    geometry: {
      wallInclinationFromVertical: 8,
      backfillInclination: 5,
      angleUnits: "deg",
    },
    interface: { frictionAngle: 12, angleUnits: "deg" },
    seismic: { kh: 0, kv: 0 },
  });

  assert.equal(result.status, "ok");
  approx(result.outputs.homogeneousEquivalentCoefficient,
    0.2100609450346865, 1e-10);
  approx(result.outputs.resultants.seismicTotal.magnitude,
    189.05485053121785, 1e-8);
  approx(result.outputs.resultants.seismicTotal.normal,
    184.923548454199, 1e-8);
  approx(result.outputs.resultants.seismicTotal.tangent,
    39.306713631244264, 1e-8);
  approx(result.outputs.criticalWedges.seismic.wallForceAngleFromHorizontal,
    4 * Math.PI / 180, 1e-12);
});

test("layered pseudostatic wedge accepts wall inclination and interface friction", () => {
  const upper = soil({ id: "upper-inclined", phi: 30 });
  const lower = soil({ id: "lower-inclined", phi: 34, bulk: 20 });
  const profile = new GroundProfile({
    id: "layered-inclined",
    groundSurfaceElevation: 10,
    materials: [upper, lower],
    layers: [
      {
        id: "upper",
        topElevation: 10,
        bottomElevation: 5,
        materialId: upper.id,
      },
      {
        id: "lower",
        topElevation: 5,
        bottomElevation: 0,
        materialId: lower.id,
      },
    ],
    units,
  });
  const result = analyze(profile, {
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    geometry: {
      wallInclinationFromVertical: 6,
      backfillInclination: 4,
      angleUnits: "deg",
    },
    interface: { frictionAngle: 10, angleUnits: "deg" },
    seismic: { kh: 0.1, kv: 0 },
  });

  assert.equal(result.status, "ok");
  assert.ok(result.outputs.criticalWedges.seismic.segments.length >= 2);
  assert.ok(result.outputs.resultants.seismicTotal.magnitude > 0);
  approx(
    result.outputs.resultants.seismicTotal.tangent /
      result.outputs.resultants.seismicTotal.magnitude,
    Math.sin(10 * Math.PI / 180),
  );
});

test("trial wedge accepts an explicit undrained total-stress parameter set", () => {
  const profile = homogeneousProfile({ material: undrainedSoil() });
  const result = analyze(profile, {
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    seismic: { kh: 0.1, kv: 0 },
  });

  assert.equal(result.status, "ok");
  approx(result.outputs.resultants.seismicTotal.magnitude,
    603.3520605161737, 1e-8);
  assert.equal(
    result.outputs.criticalWedges.seismic.segments[0].stressBasis,
    "total",
  );
  assert.ok(result.warnings.some((warning) =>
    warning.includes("tension crack")));
});

test("indicative parameter sets require explicit authorization", () => {
  const profile = homogeneousProfile({ material: soil({ basis: "indicative" }) });
  const blocked = analyze(profile);
  const authorized = analyze(profile, { allowIndicativeValues: true });

  assert.equal(blocked.status, "not-supported");
  assert.equal(authorized.status, "ok");
  assert.ok(authorized.warnings.some((warning) => warning.includes("indicative")));
});

test("indicative Mononobe-Okabe parameters remain explicit in warnings", () => {
  const profile = homogeneousProfile({ material: soil({ basis: "indicative" }) });
  const blocked = analyze(profile, {
    state: "seismic-active",
    method: "mononobe-okabe-active",
    seismic: { kh: 0.1, kv: 0 },
  });
  const authorized = analyze(profile, {
    state: "seismic-active",
    method: "mononobe-okabe-active",
    seismic: { kh: 0.1, kv: 0 },
    allowIndicativeValues: true,
  });

  assert.equal(blocked.status, "not-supported");
  assert.ok(blocked.warnings.some((warning) => warning.includes("indicative")));
  assert.equal(authorized.status, "ok");
  assert.ok(authorized.warnings.some((warning) => warning.includes("indicative")));
});

test("geotechnical calculations are invariant under N-mm input conversion", () => {
  const metricProfile = homogeneousProfile();
  const metric = analyze(metricProfile);
  const metricWedge = analyze(metricProfile, {
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    seismic: { kh: 0.1, kv: 0 },
  });
  const nMmUnits = { force: "N", length: "mm" };
  const convertedMaterial = soil({
    bulk: 18e-6,
    saturated: 20e-6,
    phi: 30,
    inputUnits: nMmUnits,
  });
  const convertedProfile = homogeneousProfile({
    material: convertedMaterial,
    groundSurfaceElevation: 10000,
    thickness: 10000,
    inputUnits: nMmUnits,
  });
  const converted = new LateralEarthPressureAnalysis().analyze({
    profile: convertedProfile,
    state: "active",
    method: "rankine",
    units: nMmUnits,
  });
  const convertedWedge = new LateralEarthPressureAnalysis().analyze({
    profile: convertedProfile,
    state: "seismic-active",
    method: "trial-wedge-pseudostatic",
    seismic: { kh: 0.1, kv: 0 },
    units: nMmUnits,
  });

  approx(
    converted.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
    metric.outputs.diagram.resultants.totalNormal.forcePerUnitWidth,
  );
  approx(
    convertedWedge.outputs.resultants.seismicTotal.magnitude,
    metricWedge.outputs.resultants.seismicTotal.magnitude,
  );
});

test("NTC 2018 adapter keeps betaM explicit and returns both vertical cases", () => {
  const coefficients = calculateNTC2018RetainingWallSeismicCoefficients({
    maximumSiteAccelerationRatio: 0.25,
    betaM: 0.38,
  });
  const seismic = createNTC2018MononobeOkabeSeismicInput({
    maximumSiteAccelerationRatio: 0.25,
    betaM: 0.38,
    verticalCase: "reduced-effective-gravity",
  });

  approx(coefficients.kh, 0.095);
  approx(coefficients.verticalMagnitude, 0.0475);
  approx(seismic.kh, 0.095);
  approx(seismic.kv, 0.0475);
  assert.equal(seismic.metadata.betaMSource, "explicit-input");
});

test("application wrapper returns a serializable CalculationResult", () => {
  const result = new GeotechnicalEarthPressureApplication().run({
    profile: homogeneousProfile(),
    state: "active",
    method: "rankine",
    units,
  });
  const serialized = JSON.parse(JSON.stringify(result.toJSON()));

  assert.equal(result.status, "ok");
  assert.equal(result.applicationId, "geotechnical-earth-pressures");
  assert.equal(serialized.outputs.diagram.schemaVersion,
    "geotechnical-pressure-diagram-2d/v1");
});
