import test from "node:test";
import assert from "node:assert/strict";

import {
  CIRCULAR_SLIP_SURFACE_2D_SCHEMA_VERSION,
  CIRCULAR_SLOPE_STABILITY_RESULT_SCHEMA_VERSION,
  SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION,
  SLOPE_SURFACE_SURCHARGE_2D_SCHEMA_VERSION,
  CircularSlipSurface2D,
  CircularSlopeStabilityAnalysis,
  GeotechnicalDesignSituation,
  GeotechnicalSlopeStabilityApplication,
  GroundModel,
  GroundSection2D,
  PorePressureField2D,
  SlopeSurfaceSurcharge2D,
  SoilMaterial,
  ordinaryMethodOfSlices,
  simplifiedBishop,
  spencerMethod,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function drainedMaterial({
  id = "soil",
  frictionAngle = 25,
  cohesion = 10,
  bulk = 18,
  saturated = 20,
} = {}) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk, saturated },
    parameterSets: [{
      id: "characteristic-drained",
      basis: "characteristic",
      drainage: "drained",
      strength: {
        model: "mohr-coulomb-effective",
        frictionAngle,
        cohesion,
      },
      provenance: { source: "test-fixture" },
    }],
    defaultParameterSetId: "characteristic-drained",
    angleUnits: "deg",
    units,
  });
}

function undrainedMaterial({ id = "clay", su = 25, bulk = 18 } = {}) {
  return new SoilMaterial({
    id,
    name: id,
    unitWeight: { bulk, saturated: bulk + 1 },
    parameterSets: [{
      id: "characteristic-undrained",
      basis: "characteristic",
      drainage: "undrained",
      strength: {
        model: "total-stress-undrained",
        undrainedShearStrength: su,
      },
      provenance: { source: "test-fixture" },
    }],
    defaultParameterSetId: "characteristic-undrained",
    units,
  });
}

function homogeneousFixture({
  material = drainedMaterial(),
  porePressure = null,
  drainageCondition = material.parameterSets[0].drainage,
} = {}) {
  const section = new GroundSection2D({
    id: "slope-section",
    surface: {
      points: [{ x: 0, z: 10 }, { x: 10, z: 0 }, { x: 20, z: 0 }],
    },
    zones: [{
      id: "slope-zone",
      materialId: material.id,
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
  const field = porePressure ?? new PorePressureField2D({
    id: "dry",
    model: "none",
    units,
  });
  const groundModel = new GroundModel({
    id: "slope-ground-model",
    materials: [material],
    sections: [section],
    porePressureFields: [field],
    defaultSectionId: section.id,
    defaultPorePressureFieldId: field.id,
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "slope-situation",
    groundModel,
    situationType: "persistent",
    limitState: "not-specified",
    drainageCondition,
    requiredParameterBasis: "characteristic",
    sectionId: section.id,
    porePressureFieldId: field.id,
    units,
  });
  return { material, section, field, groundModel, designSituation };
}

function assignedCircle(sagitta = 2) {
  return CircularSlipSurface2D.fromChordAndSagitta({
    id: "assigned-circle",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta,
    units,
  });
}

function analyze(fixture, overrides = {}) {
  return new CircularSlopeStabilityAnalysis().analyze({
    groundModel: fixture.groundModel,
    designSituation: fixture.designSituation,
    slipSurface: assignedCircle(),
    sliceCount: 30,
    units,
    ...overrides,
  });
}

test("CircularSlipSurface2D builds a lower arc from chord and sagitta", () => {
  const circle = CircularSlipSurface2D.fromChordAndSagitta({
    id: "symmetric-circle",
    entry: { x: 0, z: 0 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units,
  });

  approx(circle.center.x, 5);
  approx(circle.center.z, 5.25);
  approx(circle.radius, 7.25);
  approx(circle.lowerElevationAt(5), -2);
  assert.equal(circle.toJSON().schemaVersion,
    CIRCULAR_SLIP_SURFACE_2D_SCHEMA_VERSION);
  assert.deepEqual(new CircularSlipSurface2D(circle.toJSON()).toJSON(),
    circle.toJSON());
  assert.throws(() => CircularSlipSurface2D.fromChordAndSagitta({
    id: "too-deep",
    entry: { x: 0, z: 0 },
    exit: { x: 10, z: 0 },
    sagitta: 5,
    units,
  }), /smaller than half/);
});

test("circular surface and surcharge convert N-mm inputs to geotechnical units", () => {
  const circle = CircularSlipSurface2D.fromChordAndSagitta({
    id: "circle-mm",
    entry: { x: 0, z: 0 },
    exit: { x: 10000, z: 0 },
    sagitta: 2000,
    units: { force: "N", length: "mm" },
  });
  const surcharge = new SlopeSurfaceSurcharge2D({
    id: "surcharge-mm",
    intensity: 0.02,
    minimumX: 0,
    maximumX: 5000,
    units: { force: "N", length: "mm" },
  });

  approx(circle.radius, 7.25);
  approx(circle.exitX, 10);
  approx(surcharge.intensity, 20);
  approx(surcharge.forcePerUnitWidthBetween(0, 10), 100);
  assert.equal(surcharge.toJSON().schemaVersion,
    SLOPE_SURFACE_SURCHARGE_2D_SCHEMA_VERSION);
});

test("slice equations reproduce independent Ordinary and Bishop arithmetic", () => {
  const slices = [
    {
      id: "a",
      width: 2,
      baseLength: 2.1,
      totalVerticalLoad: 100,
      baseInclination: 20 * Math.PI / 180,
      cohesion: 5,
      frictionAngle: 30 * Math.PI / 180,
      porePressure: 10,
      stressBasis: "effective",
    },
    {
      id: "b",
      width: 2,
      baseLength: 2.1,
      totalVerticalLoad: 80,
      baseInclination: -5 * Math.PI / 180,
      cohesion: 5,
      frictionAngle: 30 * Math.PI / 180,
      porePressure: 5,
      stressBasis: "effective",
    },
  ];

  const ordinary = ordinaryMethodOfSlices(slices);
  const bishop = simplifiedBishop(slices);

  approx(ordinary.factorOfSafety, 3.8393296189203707, 1e-12);
  approx(bishop.factorOfSafety, 3.935106297581459, 1e-12);
  assert.equal(bishop.converged, true);
  assert.equal(bishop.iterations, 6);
  assert.equal(bishop.sliceContributions.length, 2);
});

test("phi-zero total-stress slices give the same Bishop and Ordinary result", () => {
  const slices = [
    {
      width: 2,
      baseLength: 2 / Math.cos(20 * Math.PI / 180),
      totalVerticalLoad: 100,
      baseInclination: 20 * Math.PI / 180,
      cohesion: 25,
      frictionAngle: 0,
      porePressure: 100,
      stressBasis: "total",
    },
    {
      width: 2,
      baseLength: 2 / Math.cos(-5 * Math.PI / 180),
      totalVerticalLoad: 80,
      baseInclination: -5 * Math.PI / 180,
      cohesion: 25,
      frictionAngle: 0,
      porePressure: 100,
      stressBasis: "total",
    },
  ];

  approx(
    simplifiedBishop(slices).factorOfSafety,
    ordinaryMethodOfSlices(slices).factorOfSafety,
    1e-12,
  );
});

test("Spencer satisfies force and moment equilibrium in an independent phi-zero case", () => {
  const radius = 10;
  const cohesion = 10;
  const baseLength = 2;
  const inputs = [
    { id: "a", vertical: 100, horizontal: 10, alphaDegrees: 20 },
    { id: "b", vertical: 80, horizontal: 8, alphaDegrees: 10 },
  ];
  const slices = inputs.map((input) => {
    const alpha = input.alphaDegrees * Math.PI / 180;
    const driving = input.vertical * Math.sin(alpha) +
      input.horizontal * Math.cos(alpha);
    return {
      id: input.id,
      width: 1,
      baseLength,
      totalVerticalLoad: input.vertical,
      horizontalSeismicLoad: input.horizontal,
      baseInclination: alpha,
      cohesion,
      frictionAngle: 0,
      porePressure: 0,
      stressBasis: "total",
      baseMomentArm: radius,
      drivingMoment: driving * radius,
    };
  });
  const expectedFactor = slices.reduce(
    (sum, slice) =>
      sum + slice.cohesion * slice.baseLength * slice.baseMomentArm,
    0,
  ) / slices.reduce((sum, slice) => sum + slice.drivingMoment, 0);
  const result = spencerMethod(slices);

  approx(result.factorOfSafety, expectedFactor, 1e-12);
  approx(result.intersliceForceInclination, 15 * Math.PI / 180, 1e-12);
  assert.ok(result.equilibrium.residualNorm < 1e-12);
  assert.ok(result.equilibrium.maximumLocalShearResidual < 1e-12);
  assert.throws(() => simplifiedBishop(slices), /Spencer/);
  assert.throws(() => ordinaryMethodOfSlices(slices), /Spencer/);
});

test("assigned dry circular slope returns detailed Bishop and Ordinary results", () => {
  const result = analyze(homogeneousFixture());

  assert.equal(result.status, "ok");
  assert.equal(
    result.outputs.schemaVersion,
    CIRCULAR_SLOPE_STABILITY_RESULT_SCHEMA_VERSION,
  );
  assert.equal(
    result.outputs.discretization.schemaVersion,
    SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION,
  );
  approx(result.outputs.factorOfSafety, 1.220569958045434, 1e-10);
  approx(
    result.outputs.methods["ordinary-method-of-slices"].factorOfSafety,
    1.1966386984566488,
    1e-10,
  );
  assert.equal(result.outputs.discretization.requestedSliceCount, 30);
  assert.equal(result.outputs.discretization.actualSliceCount, 30);
  assert.ok(result.outputs.discretization.slices.every((slice) =>
    slice.area > 0 && slice.selfWeight > 0));
  assert.equal(result.outputs.methods.spencer.status, "not-supported");
  assert.equal(result.outputs.comparison.spencerFactorOfSafety, null);
  assert.ok(result.warnings.some((warning) =>
    warning.includes("tensile effective normal force")));
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("assigned circular slope converges as the slice mesh is refined", () => {
  const fixture = homogeneousFixture();
  const coarse = analyze(fixture, { sliceCount: 20 });
  const medium = analyze(fixture, { sliceCount: 80 });
  const reference = analyze(fixture, { sliceCount: 240 });

  assert.equal(coarse.status, "ok");
  assert.equal(medium.status, "ok");
  assert.equal(reference.status, "ok");
  assert.ok(
    Math.abs(medium.outputs.factorOfSafety - reference.outputs.factorOfSafety) <
    Math.abs(coarse.outputs.factorOfSafety - reference.outputs.factorOfSafety),
  );
});

test("undrained circular slope uses total stress and ignores pore-pressure subtraction", () => {
  const fixture = homogeneousFixture({ material: undrainedMaterial() });
  const result = analyze(fixture);

  assert.equal(result.status, "ok");
  assert.ok(result.outputs.discretization.slices.every((slice) =>
    slice.stressBasis === "total" &&
    slice.frictionAngle === 0 &&
    slice.porePressure === 0));
  approx(
    result.outputs.comparison.bishopFactorOfSafety,
    result.outputs.comparison.ordinaryFactorOfSafety,
    1e-12,
  );
});

test("phreatic pore pressure and saturated weight reduce the drained factor", () => {
  const dry = analyze(homogeneousFixture(), {
    slipSurface: assignedCircle(2.5),
  });
  const phreaticField = new PorePressureField2D({
    id: "phreatic",
    model: "phreatic-line",
    phreaticLine: {
      points: [{ x: 0, z: 8 }, { x: 10, z: -2 }, { x: 20, z: -2 }],
    },
    waterUnitWeight: 9.81,
    units,
  });
  const wet = analyze(homogeneousFixture({ porePressure: phreaticField }), {
    slipSurface: assignedCircle(2.5),
  });

  assert.equal(dry.status, "ok");
  assert.equal(wet.status, "ok");
  assert.ok(wet.outputs.factorOfSafety < dry.outputs.factorOfSafety);
  assert.ok(wet.outputs.discretization.slices.some((slice) =>
    slice.porePressure > 0));
  assert.ok(wet.outputs.discretization.slices.some((slice) =>
    slice.selfWeight > dry.outputs.discretization.slices
      .find(({ id }) => id === slice.id).selfWeight));
});

test("uniform vertical surcharge is integrated and changes slope stability", () => {
  const fixture = homogeneousFixture();
  const reference = analyze(fixture);
  const loaded = analyze(fixture, {
    surfaceSurcharges: [{
      id: "crest-load",
      intensity: 50,
      minimumX: 0,
      maximumX: 4,
    }],
  });

  assert.equal(loaded.status, "ok");
  assert.ok(loaded.outputs.discretization.slices.some((slice) =>
    slice.surfaceLoad > 0));
  assert.notEqual(loaded.outputs.factorOfSafety, reference.outputs.factorOfSafety);
});

test("material crossings split slices and resolve zone-specific strength", () => {
  const upper = drainedMaterial({
    id: "upper-sand",
    frictionAngle: 30,
    cohesion: 2,
  });
  const lower = undrainedMaterial({ id: "lower-clay", su: 35, bulk: 19 });
  const section = new GroundSection2D({
    id: "layered-section",
    surface: {
      points: [{ x: 0, z: 10 }, { x: 10, z: 0 }, { x: 20, z: 0 }],
    },
    zones: [
      {
        id: "upper-zone",
        materialId: upper.id,
        polygon: [{ x: 0, z: 5 }, { x: 5, z: 5 }, { x: 0, z: 10 }],
      },
      {
        id: "lower-zone",
        materialId: lower.id,
        polygon: [
          { x: 0, z: -20 }, { x: 20, z: -20 },
          { x: 20, z: 0 }, { x: 10, z: 0 },
          { x: 5, z: 5 }, { x: 0, z: 5 },
        ],
      },
    ],
    units,
  });
  const field = new PorePressureField2D({ id: "dry", model: "none", units });
  const groundModel = new GroundModel({
    id: "layered-model",
    materials: [upper, lower],
    sections: [section],
    porePressureFields: [field],
    units,
  });
  const designSituation = new GeotechnicalDesignSituation({
    id: "mixed",
    groundModel,
    drainageCondition: "mixed",
    requiredParameterBasis: "characteristic",
    sectionId: section.id,
    porePressureFieldId: field.id,
    units,
  });
  const result = new CircularSlopeStabilityAnalysis().analyze({
    groundModel,
    designSituation,
    slipSurface: assignedCircle(),
    sliceCount: 20,
    units,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.discretization.parameterSets.length, 2);
  assert.ok(result.outputs.discretization.slices.some((slice) =>
    slice.zoneId === "upper-zone" && slice.stressBasis === "effective"));
  assert.ok(result.outputs.discretization.slices.some((slice) =>
    slice.zoneId === "lower-zone" && slice.stressBasis === "total"));
  assert.ok(result.outputs.discretization.actualSliceCount > 20);
});

test("bounded entry-exit-sagitta search is deterministic and reports rejections", () => {
  const fixture = homogeneousFixture();
  const input = {
    groundModel: fixture.groundModel,
    designSituation: fixture.designSituation,
    search: {
      entryX: { minimum: 0, maximum: 2, count: 3 },
      exitX: { minimum: 8, maximum: 10, count: 3 },
      sagitta: { minimum: 1, maximum: 3, count: 3 },
      refinementIterations: 3,
      retainCandidates: 5,
    },
    sliceCount: 20,
    units,
  };
  const first = new CircularSlopeStabilityAnalysis().analyze(input);
  const second = new CircularSlopeStabilityAnalysis().analyze(input);

  assert.equal(first.status, "ok");
  approx(first.outputs.factorOfSafety, 1.1757070539301433, 1e-10);
  approx(second.outputs.factorOfSafety, first.outputs.factorOfSafety, 1e-12);
  assert.ok(first.outputs.search.validCandidateCount > 0);
  assert.ok(first.outputs.search.rejectedCandidateCount > 0);
  assert.equal(first.outputs.search.retainedCandidates.length, 5);
  assert.ok(first.outputs.search.retainedCandidates.every((candidate) =>
    candidate.analysis === undefined));
});

test("Spencer solves a static cohesionless slope and agrees closely with Bishop", () => {
  const fixture = homogeneousFixture({
    material: drainedMaterial({ frictionAngle: 30, cohesion: 0 }),
  });
  const result = analyze(fixture, { method: "spencer" });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.method, "spencer");
  approx(result.outputs.factorOfSafety, 0.7172768096610556, 1e-10);
  assert.ok(result.outputs.methods.spencer.equilibrium.residualNorm < 1e-9);
  assert.ok(result.outputs.methods.spencer.startsAttempted >= 1);
  assert.ok(
    Math.abs(result.outputs.comparison.spencerToBishopRatio - 1) < 0.005,
  );
});

test("pseudostatic slope analysis defaults to Spencer and applies kh and kv", () => {
  const fixture = homogeneousFixture({
    material: drainedMaterial({ frictionAngle: 30, cohesion: 0 }),
  });
  const seismic = new GeotechnicalDesignSituation({
    ...fixture.designSituation.toJSON(),
    id: "seismic-slope",
    situationType: "seismic",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0.1 },
  });
  const result = new CircularSlopeStabilityAnalysis().analyze({
    groundModel: fixture.groundModel,
    designSituation: seismic,
    slipSurface: assignedCircle(),
    surfaceSurcharges: [{
      id: "seismic-static-surcharge",
      intensity: 10,
      minimumX: 0,
      maximumX: 2,
    }],
    units,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.method, "spencer");
  assert.equal(
    result.outputs.discretization.metadata.seismicLoading.gravityFactor,
    0.9,
  );
  assert.ok(result.outputs.discretization.slices.every((slice) =>
    Math.abs(slice.verticalSelfWeight - 0.9 * slice.selfWeight) < 1e-10 &&
    Math.abs(slice.horizontalSeismicLoad - 0.1 * slice.selfWeight) < 1e-10));
  assert.ok(result.outputs.discretization.slices.some((slice) =>
    slice.surfaceLoad > 0 &&
    Math.abs(
      slice.totalVerticalLoad -
        (slice.verticalSelfWeight + slice.surfaceLoad),
    ) < 1e-10));
  assert.equal(
    result.outputs.discretization.metadata.seismicLoading.surfaceLoadInertia,
    "not-included",
  );
  assert.equal(
    result.outputs.comparison.staticSimplifiedMethods,
    "not-applicable",
  );
  assert.ok(result.outputs.methods.spencer.equilibrium.residualNorm < 1e-9);
});

test("pseudostatic inertia lowers the factor and simplified methods reject it", () => {
  const fixture = homogeneousFixture({
    material: drainedMaterial({ frictionAngle: 30, cohesion: 0 }),
  });
  const staticResult = analyze(fixture, { method: "spencer" });
  const seismic = new GeotechnicalDesignSituation({
    ...fixture.designSituation.toJSON(),
    id: "seismic-slope",
    situationType: "seismic",
    seismic: { model: "pseudostatic", kh: 0.1, kv: 0 },
  });
  const pseudostatic = analyze(fixture, { designSituation: seismic });
  const bishop = analyze(fixture, {
    designSituation: seismic,
    method: "bishop-simplified",
  });

  assert.equal(pseudostatic.status, "ok");
  assert.ok(
    pseudostatic.outputs.factorOfSafety < staticResult.outputs.factorOfSafety,
  );
  assert.equal(bishop.status, "not-supported");
  assert.match(bishop.summary, /Spencer/);
});

test("slope-stability application wraps the domain result", () => {
  const fixture = homogeneousFixture();
  const result = new GeotechnicalSlopeStabilityApplication().run({
    groundModel: fixture.groundModel,
    designSituation: fixture.designSituation,
    slipSurface: assignedCircle(),
    units,
  });

  assert.equal(result.applicationId, "geotechnical-slope-stability");
  assert.equal(result.status, "ok");
  assert.equal(result.metadata.domain, "geotechnics");
  assert.doesNotThrow(() => JSON.stringify(result));
});
