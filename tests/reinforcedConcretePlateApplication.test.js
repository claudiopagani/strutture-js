import test from "node:test";
import assert from "node:assert/strict";

import {
  RC_PLATE_ANALYSIS_TYPES,
  ReinforcedConcretePlateApplication,
  ReinforcedConcretePlateModel,
  SectionFiberDiscretizer,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createPlateStripSection,
  rotatePlateMoments,
  rotatePlateShear,
  woodArmer,
} from "../src/index.js";

const units = Object.freeze({ force: "N", length: "mm" });

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function materials() {
  return {
    concreteMaterial: createNTC2018ConcreteMaterial({
      strengthClass: "C25/30",
      units,
    }),
    reinforcementMaterial: createNTC2018ReinforcementSteelMaterial({
      grade: "B450C",
      units,
    }),
  };
}

function plateInput(analysis = {}) {
  return {
    id: "plate-test",
    units,
    materials: materials(),
    geometry: {
      thickness: 200,
      unitWidth: 1000,
    },
    reinforcement: {
      angle: 0,
      top: {
        x: { barsPerMeter: 5, diameter: 12, clearCover: 25 },
        y: { barsPerMeter: 5, diameter: 12, clearCover: 40 },
      },
      bottom: {
        x: { barsPerMeter: 6, diameter: 14, clearCover: 25 },
        y: { barsPerMeter: 6, diameter: 14, clearCover: 42 },
      },
    },
    analysis: {
      type: RC_PLATE_ANALYSIS_TYPES.ULS_BENDING_SHEAR,
      combinationType: "ULS_FUNDAMENTAL",
      actions: {
        mxx: 25_000,
        myy: 15_000,
        mxy: 5_000,
        qx: 60,
        qy: 40,
      },
      ...analysis,
    },
  };
}

test("plate model validates inputs and derives bar area, spacing and axis coordinates", () => {
  const model = new ReinforcedConcretePlateModel(plateInput());
  const bottomX = model.reinforcement.bottom.x;
  const topY = model.reinforcement.top.y;

  approx(bottomX.area, 6 * Math.PI * 14 ** 2 / 4);
  approx(bottomX.spacing, 1000 / 6);
  approx(bottomX.axis, 32);
  approx(topY.axis, 154);
  assert.equal(model.geometry.unitWidth, 1000);

  assert.throws(
    () => new ReinforcedConcretePlateModel({
      ...plateInput(),
      reinforcement: {
        ...plateInput().reinforcement,
        bottom: {
          ...plateInput().reinforcement.bottom,
          x: { barsPerMeter: 0, diameter: 14, clearCover: 25 },
        },
      },
    }),
    /barsPerMeter must be positive/,
  );
});

test("plate model rejects reinforcement outside the thickness and overlapping orthogonal layers", () => {
  const outside = plateInput();
  outside.reinforcement.top.x.clearCover = 195;
  assert.throws(
    () => new ReinforcedConcretePlateModel(outside),
    /outside the plate thickness/,
  );

  const overlap = plateInput();
  overlap.reinforcement.top.y.clearCover = 25;
  assert.throws(
    () => new ReinforcedConcretePlateModel(overlap),
    /overlap geometrically/,
  );
});

test("plate model derives the distributed vertical S-link grid from diameter and X/Y spacings", () => {
  const input = plateInput();
  input.reinforcement.shear = {
    diameter: 8,
    spacingX: 150,
    spacingY: 200,
  };
  const model = new ReinforcedConcretePlateModel(input);
  const shear = model.reinforcement.shear;
  const area = Math.PI * 8 ** 2 / 4;

  approx(shear.areaPerLink, area);
  approx(shear.linksPerSquareMeter, 1_000_000 / (150 * 200));
  approx(shear.areaPerSpacingForUnitStrip, 1000 * area / (150 * 200));
  assert.equal(shear.angle, 90);
  assert.equal(shear.effectiveLegsPerLink, 1);

  const incomplete = plateInput();
  incomplete.reinforcement.shear = { diameter: 8, spacingX: 150 };
  assert.throws(
    () => new ReinforcedConcretePlateModel(incomplete),
    /reinforcement\.shear\.spacingY must be positive/,
  );
});

test("plate strip section passes exact layer area and axis depth while preserving spacing metadata", () => {
  const model = new ReinforcedConcretePlateModel(plateInput());
  const strip = createPlateStripSection({ model, direction: "x" });
  const bottomGroup = strip.groups.find((group) => group.face === "bottom");
  const bottomBars = strip.reinforcementBars.filter((bar) => bar.metadata.face === "bottom");

  assert.equal(bottomBars.length, 1);
  approx(bottomBars[0].area, model.reinforcement.bottom.x.area);
  approx(bottomBars[0].y, model.reinforcement.bottom.x.axis);
  approx(bottomBars[0].z, 500);
  assert.equal(bottomGroup.longitudinalReinforcementArea, model.reinforcement.bottom.x.area);
  approx(bottomGroup.spacing, 1000 / 6);
});

test("plate concrete is discretized as full-width uniaxial strips along the height", () => {
  const model = new ReinforcedConcretePlateModel(plateInput());
  const { section } = createPlateStripSection({ model, direction: "x" });
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 40,
    method: "uniaxial-strips",
  });

  assert.equal(mesh.method, "uniaxial-strips");
  assert.equal(mesh.generatedCount, 40);
  assert.ok(mesh.fibers.every((fiber) => fiber.width === 1000));
  approx(mesh.fibers.reduce((sum, fiber) => sum + fiber.area, 0), 200_000);
  approx(mesh.fibers[0].y, 2.5);
  approx(mesh.fibers.at(-1).y, 197.5);
});

test("plate moment rotation handles zero and ninety-degree axes", () => {
  assert.deepEqual(
    rotatePlateMoments({ mxx: 30, myy: 10, mxy: 4, angle: 0 }),
    {
      mxx: 30,
      myy: 10,
      mxy: 4,
      angle: 0,
      angleRadians: 0,
      invariants: { trace: 40, determinant: 284 },
    },
  );
  const quarterTurn = rotatePlateMoments({ mxx: 30, myy: 10, mxy: 4, angle: 90 });
  approx(quarterTurn.mxx, 10);
  approx(quarterTurn.myy, 30);
  approx(quarterTurn.mxy, -4);
});

test("plate moment rotation reaches principal axes and preserves tensor invariants", () => {
  const source = { mxx: 30, myy: 20, mxy: 10 };
  const principalAngle = 0.5 * Math.atan2(2 * source.mxy, source.mxx - source.myy) * 180 / Math.PI;
  const rotated = rotatePlateMoments({ ...source, angle: principalAngle });
  const recovered = rotatePlateMoments({ ...rotated, angle: -principalAngle });

  approx(rotated.mxy, 0, 1e-12);
  approx(rotated.invariants.trace, source.mxx + source.myy);
  approx(rotated.invariants.determinant, source.mxx * source.myy - source.mxy ** 2);
  approx(recovered.mxx, source.mxx);
  approx(recovered.myy, source.myy);
  approx(recovered.mxy, source.mxy);
});

test("plate shear rotation preserves the vector norm", () => {
  const rotated = rotatePlateShear({ qx: 3, qy: 4, angle: 90 });

  approx(rotated.qx, 4);
  approx(rotated.qy, -3);
  approx(rotated.resultant, 5);
});

test("Wood-Armer covers unidirectional signs, zero twist and pure twist", () => {
  assert.deepEqual(
    woodArmer({ mxx: 12, myy: 0, mxy: 0 }).moments.map(({ id, value }) => [id, value]),
    [["bottom-x", 12], ["bottom-y", 0], ["top-x", 0], ["top-y", 0]],
  );
  assert.equal(woodArmer({ mxx: -12, myy: 0, mxy: 0 })["top-x"], -12);
  assert.equal(woodArmer({ mxx: 0, myy: 9, mxy: 0 })["bottom-y"], 9);
  assert.equal(woodArmer({ mxx: 0, myy: -9, mxy: 0 })["top-y"], -9);
  assert.deepEqual(
    woodArmer({ mxx: 0, myy: 0, mxy: 7 }).moments.map(({ value }) => value),
    [7, 7, -7, -7],
  );
});

test("Wood-Armer is applied after rotation in the reinforcement axes", () => {
  const modelInput = plateInput();
  modelInput.reinforcement.angle = 90;
  modelInput.analysis.actions = { mxx: 20_000, myy: -10_000, mxy: 0, qx: 0, qy: 0 };
  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(modelInput),
  });
  const moments = Object.fromEntries(
    result.outputs.woodArmerMoments[0].moments.map((moment) => [moment.id, moment.value]),
  );

  approx(moments["bottom-y"], 20_000);
  approx(moments["top-x"], -10_000);
});

test("ULS plate workflow verifies four bending strips and two independent shear directions", () => {
  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(plateInput()),
  });

  assert.equal(result.outputs.bendingChecks.length, 4);
  assert.equal(result.outputs.shearChecks.length, 2);
  assert.deepEqual(
    result.outputs.bendingChecks.map((check) => check.id).sort(),
    ["bottom-x", "bottom-y", "top-x", "top-y"],
  );
  assert.deepEqual(
    result.outputs.shearChecks.map((check) => check.direction).sort(),
    ["x", "y"],
  );
  assert.ok(result.outputs.bendingChecks.every((item) => Number.isFinite(item.mRd)));
  assert.ok(result.outputs.bendingChecks.every((item) => item.concreteStripCount === 40));
  assert.ok(result.outputs.bendingChecks.every((item) =>
    item.concreteDiscretization === "uniaxial-strips"));
  assert.ok(result.checks.every((check) => check.analysisType === "ULS_BENDING_SHEAR"));
});

test("ULS plate shear compares S-link truss and unreinforced resistance in both directions", () => {
  const input = plateInput();
  input.reinforcement.shear = {
    diameter: 8,
    spacingX: 150,
    spacingY: 200,
  };
  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(input),
  });
  const areaPerSpacing = 1000 * (Math.PI * 8 ** 2 / 4) / (150 * 200);
  const [x, y] = result.outputs.shearChecks;

  assert.ok(result.outputs.shearChecks.every((check) =>
    check.method === "ntc2018-4.1.2.3.5.2-wood-armer-strip-s-links"));
  assert.ok(result.outputs.shearChecks.every((check) =>
    check.vRdWithTransverseReinforcement > 0));
  assert.ok(result.outputs.shearChecks.every((check) =>
    check.vRdWithoutTransverseReinforcement > 0));
  assert.ok(result.outputs.shearChecks.every((check) =>
    check.capacity === Math.max(
      check.vRdWithTransverseReinforcement,
      check.vRdWithoutTransverseReinforcement,
    )));
  approx(x.candidates[0].outputs.parameters.transverseReinforcement.areaPerSpacing, areaPerSpacing);
  approx(y.candidates[0].outputs.parameters.transverseReinforcement.areaPerSpacing, areaPerSpacing);
  approx(x.shearReinforcement.longitudinalSpacing, 150);
  approx(x.shearReinforcement.transverseSpacing, 200);
  approx(x.shearReinforcement.effectiveLinksAcrossUnitWidth, 5);
  approx(y.shearReinforcement.longitudinalSpacing, 200);
  approx(y.shearReinforcement.transverseSpacing, 150);
  approx(y.shearReinforcement.effectiveLinksAcrossUnitWidth, 1000 / 150);
  assert.ok(result.assumptions.some((assumption) =>
    assumption.includes("one effective shear leg")));
});

test("pure twisting makes plate shear evaluate both faces and use the lower resistance", () => {
  const input = plateInput();
  input.analysis.actions = { mxx: 0, myy: 0, mxy: 10_000, qx: 40, qy: 20 };
  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(input),
  });

  assert.ok(result.outputs.shearChecks.every((check) => check.evaluatedFaces.length === 2));
  assert.ok(result.warnings.some((warning) => warning.includes("both reinforcement faces")));
  assert.ok(result.outputs.shearChecks.every((check) =>
    check.capacity === Math.min(...check.candidates.map((candidate) => candidate.capacity))));
});

test("SLE plate workflow reuses service-stress and indirect crack-control checks", () => {
  const input = plateInput({
    type: RC_PLATE_ANALYSIS_TYPES.SLS_STRESS_CRACKING,
    combinationType: "SLE_FREQUENT",
    actions: { mxx: 15_000, myy: 10_000, mxy: 2_000, qx: 0, qy: 0 },
  });
  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(input),
  });

  assert.equal(result.outputs.serviceabilityStripResults.length, 4);
  assert.ok(result.outputs.crackingChecks.some((check) => check.id.includes("bar-diameter")));
  assert.ok(result.outputs.crackingChecks.some((check) => check.id.includes("bar-spacing")));
  assert.ok(result.outputs.crackingChecks
    .filter((check) => check.id.includes("bar-spacing"))
    .every((check) => check.metadata.spacingSource === "reinforcement-group-explicit"));
  assert.ok(result.outputs.serviceabilityStripResults.every((strip) =>
    strip.terminology === "Tensione nella striscia equivalente Wood-Armer"));
});

test("SLE rare plate state exposes concrete and reinforcement stress checks", () => {
  const input = plateInput({
    type: RC_PLATE_ANALYSIS_TYPES.SLS_STRESS_CRACKING,
    combinationType: "SLE_RARE",
    actions: { mxx: 12_000, myy: 8_000, mxy: 1_000, qx: 0, qy: 0 },
  });
  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(input),
  });

  assert.ok(result.outputs.serviceStressChecks.some((check) =>
    check.id.includes("rc-sle-concrete-stress")));
  assert.ok(result.outputs.serviceStressChecks.some((check) =>
    check.id.includes("rc-sle-steel-stress")));
  assert.ok(result.outputs.serviceStressChecks.every((check) =>
    check.metadata.sourceMethod?.startsWith("ntc2018-4.1.2.2.5")));
});

test("SLE states retain correlated action components and reject incompatible combinations", () => {
  const compatible = plateInput({
    type: RC_PLATE_ANALYSIS_TYPES.SLS_STRESS_CRACKING,
    combinationType: "SLE_FREQUENT",
    states: [
      { id: "frequent-a", combinationType: "SLE_FREQUENT", actions: { mxx: 12_000, myy: 4_000, mxy: 3_000, qx: 0, qy: 0 } },
      { id: "qp-a", combinationType: "SLE_QUASI_PERMANENT", actions: { mxx: 8_000, myy: 2_000, mxy: -1_000, qx: 0, qy: 0 } },
    ],
  });
  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(compatible),
  });

  assert.deepEqual(result.outputs.sourceActions.map((state) => state.stateId), ["frequent-a", "qp-a"]);
  assert.equal(result.outputs.woodArmerMoments.length, 2);

  const incompatible = plateInput({
    type: RC_PLATE_ANALYSIS_TYPES.SLS_STRESS_CRACKING,
    combinationType: "ULS_FUNDAMENTAL",
  });
  const unsupported = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(incompatible),
  });
  assert.equal(unsupported.status, "not-supported");
  assert.equal(unsupported.checks.length, 0);
});

test("simplified plate deflection checks both faces and takes the lower directional flat_slab limit", () => {
  const input = plateInput({
    type: RC_PLATE_ANALYSIS_TYPES.SLS_SIMPLIFIED_DEFLECTION,
    combinationType: "SLE_QUASI_PERMANENT",
    actions: { mxx: 2_000, myy: -1_000, mxy: 5_000 },
    deflection: { spanX: 3200, spanY: 3000 },
  });
  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(input),
  });

  assert.equal(result.outputs.slendernessChecks.length, 2);
  assert.ok(result.outputs.slendernessChecks.every((item) => item.structuralSystem === "flat_slab"));
  const rhoX = 6 * Math.PI * 14 ** 2 / 4 / (1000 * 168);
  const rhoY = 6 * Math.PI * 14 ** 2 / 4 / (1000 * 151);
  const expectedLimitX = 24 + ((rhoX - 0.005) / 0.01) * (17 - 24);
  const expectedLimitY = 24 + ((rhoY - 0.005) / 0.01) * (17 - 24);
  const [x, y] = result.outputs.slendernessChecks;

  assert.ok(result.outputs.slendernessChecks.every((item) =>
    item.stressLevel === "interpolated-from-rho-l"));
  approx(x.capacity, expectedLimitX, 1e-6);
  approx(y.capacity, expectedLimitY, 1e-6);
  approx(x.reinforcementRatio, rhoX, 1e-12);
  approx(y.reinforcementRatio, rhoY, 1e-12);
  assert.equal(x.governingFace, "bottom");
  assert.equal(y.governingFace, "bottom");
  assert.deepEqual(x.faceChecks.map((item) => item.face), ["bottom", "top"]);
  assert.deepEqual(x.faceChecks.map((item) => item.woodArmerMoment), [7_000, -3_000]);
  assert.deepEqual(y.faceChecks.map((item) => item.woodArmerMoment), [4_000, -6_000]);
  assert.ok(x.faceChecks[0].capacity < x.faceChecks[1].capacity);
  assert.ok(y.faceChecks[0].capacity < y.faceChecks[1].capacity);
  assert.equal(result.checks.filter((check) =>
    check.analysisType === RC_PLATE_ANALYSIS_TYPES.SLS_SIMPLIFIED_DEFLECTION).length, 4);
  assert.deepEqual(result.outputs.slendernessChecks.map((item) => item.demand), [16, 15]);

  input.analysis.deflection.system = "simple_span";
  assert.throws(
    () => new ReinforcedConcretePlateModel(input),
    /fixed flat_slab/,
  );
});

test("flat_slab rho_l thresholds select limits 24 and 17 outside interpolation", () => {
  const analysis = {
    type: RC_PLATE_ANALYSIS_TYPES.SLS_SIMPLIFIED_DEFLECTION,
    combinationType: "SLE_QUASI_PERMANENT",
    actions: {},
    deflection: { spanX: 3000, spanY: 2800 },
  };
  const lowInput = plateInput(analysis);
  const highInput = plateInput(analysis);

  for (const face of ["top", "bottom"]) {
    for (const direction of ["x", "y"]) {
      lowInput.reinforcement[face][direction].barsPerMeter = 2;
      highInput.reinforcement[face][direction].barsPerMeter = 20;
    }
  }

  const low = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(lowInput),
  });
  const high = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(highInput),
  });

  assert.ok(low.outputs.slendernessChecks.every((item) => item.capacity === 24));
  assert.ok(low.outputs.slendernessChecks.every((item) => item.stressLevel === "low"));
  assert.ok(high.outputs.slendernessChecks.every((item) => item.capacity === 17));
  assert.ok(high.outputs.slendernessChecks.every((item) => item.stressLevel === "high"));
});

test("plate model excludes membrane actions and result remains JSON serializable", () => {
  const input = plateInput();
  input.analysis.actions.nxx = 1;
  assert.throws(
    () => new ReinforcedConcretePlateModel(input),
    /membrane actions must be zero/,
  );

  const result = new ReinforcedConcretePlateApplication().run({
    model: new ReinforcedConcretePlateModel(plateInput()),
  });
  const json = JSON.parse(JSON.stringify(result));

  assert.equal(json.applicationId, "reinforced-concrete-plates");
  assert.deepEqual(json.metadata.scope.membraneActions, { nxx: 0, nyy: 0, nxy: 0 });
  assert.ok(json.outputs.governingCheck);
});
