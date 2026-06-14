import test from "node:test";
import assert from "node:assert/strict";

import {
  ConcreteParabolaRectangleLaw,
  RCMomentCurvatureAnalyzer,
  RCUltimateSectionSolver,
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  SteelElasticPerfectlyPlasticLaw,
  TSection,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createSolverFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC SLU solver fixture",
    concreteSection: new RectangularSection({ width: 300, height: 500, units }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 120,
  });
  const concreteLaw = new ConcreteParabolaRectangleLaw({
    fcd: concreteMaterial.fcd,
    ec2: 0.002,
    ecu: 0.0035,
  });
  const steelLaw = new SteelElasticPerfectlyPlasticLaw({
    Es: reinforcementMaterial.elasticModulus,
    fyd: reinforcementMaterial.fyd,
    esu: 0.01,
  });

  return {
    section,
    concreteLaw,
    steelLaw,
    fibers: mesh.fibers,
  };
}

test("rc ultimate section solver satisfies axial equilibrium for top-compressed uniaxial bending", () => {
  const fixture = createSolverFixture();
  const solver = new RCUltimateSectionSolver();
  const result = solver.solveUniaxialAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    compressedEdge: "top",
  });

  assert.equal(result.converged, true);
  approx(result.axialResidual, 0, 5);
  assert.ok(result.neutralAxisDepth > 0);
  assert.ok(result.MxRd > 0);
  assert.equal(result.MxRd, result.state.Mx);
  approx(result.MyRd, 0, 1e-6);
  assert.ok(result.state.extremes.maxConcreteCompression.value < 0);
  assert.ok(result.state.extremes.maxConcreteCompression.y > 250);
  assert.equal(result.state.extremes.maxSteelTensionStrain.y, 40);
  approx(result.concreteStrainExtremes.compression.strain, -0.0035, 1e-12);
  assert.equal(result.concreteStrainExtremes.compression.y, 500);
});

test("rc ultimate section solver evaluates concrete strain on the real non-rectangular edge", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC T-section edge fixture",
    concreteSection: new TSection({
      flangeWidth: 300,
      flangeThickness: 100,
      webWidth: 100,
      webHeight: 400,
      units,
    }),
    reinforcementBars: [
      [40, 130],
      [40, 170],
      [460, 40],
      [460, 260],
    ].map(
      ([y, z], index) =>
        new ReinforcementBar({
          id: `bar-${index}`,
          diameter: 16,
          grade: "B450C",
          material: reinforcementMaterial,
          y,
          z,
          units,
        }),
    ),
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });
  const fibers = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 160,
  }).fibers;
  const solver = new RCUltimateSectionSolver();
  const concreteLaw = new ConcreteParabolaRectangleLaw({
    fcd: concreteMaterial.fcd,
    ec2: 0.002,
    ecu: 0.0035,
  });
  const steelLaw = new SteelElasticPerfectlyPlasticLaw({
    Es: reinforcementMaterial.elasticModulus,
    fyd: reinforcementMaterial.fyd,
    esu: 0.01,
  });
  const result = solver.solveAtAxialLoad({
    section,
    concreteFibers: fibers,
    concreteLaw,
    steelLaw,
    nEd: -300000,
    theta: Math.PI / 4,
    compressedSide: "negative",
  });

  assert.equal(result.converged, true);
  assert.equal(result.failureMode, "concrete-compression");
  approx(result.concreteStrainExtremes.compression.strain, -0.0035, 1e-12);
  assert.equal(result.concreteStrainExtremes.compression.y, 0);
  assert.equal(result.concreteStrainExtremes.compression.z, 200);
  assert.notEqual(result.concreteStrainExtremes.compression.z, 0);
  assert.ok(
    result.MxRd * Math.cos(Math.PI / 4) +
      result.MyRd * Math.sin(Math.PI / 4) <
      0,
  );

  const uniaxial = solver.solveUniaxialAtAxialLoad({
    section,
    concreteFibers: fibers,
    concreteLaw,
    steelLaw,
    nEd: -300000,
    compressedEdge: "top",
  });
  const fullTurn = solver.solveAtAxialLoad({
    section,
    concreteFibers: fibers,
    concreteLaw,
    steelLaw,
    nEd: -300000,
    theta: -2 * Math.PI,
    compressedSide: "positive",
  });

  approx(fullTurn.MxRd, uniaxial.MxRd, 1e-6);
  approx(fullTurn.MyRd, uniaxial.MyRd, 1e-6);
  assert.ok(fullTurn.MxRd > 0);
});

test("uniaxial top compression and theta zero positive-side compression are identical", () => {
  const fixture = createSolverFixture();
  const solver = new RCUltimateSectionSolver();
  const uniaxial = solver.solveUniaxialAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    compressedEdge: "top",
  });
  const oriented = solver.solveAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    theta: 0,
    compressedSide: "positive",
  });

  approx(uniaxial.MxRd, oriented.MxRd, 1e-6);
  approx(uniaxial.MyRd, oriented.MyRd, 1e-6);
  approx(uniaxial.strainField.eps0, oriented.strainField.eps0, 1e-12);
  assert.ok(uniaxial.MxRd > 0);
});

test("theta zero and full positive or negative turns give identical signed resistance", () => {
  const fixture = createSolverFixture();
  const solver = new RCUltimateSectionSolver();
  const solve = (theta) =>
    solver.solveAtAxialLoad({
      section: fixture.section,
      concreteFibers: fixture.fibers,
      concreteLaw: fixture.concreteLaw,
      steelLaw: fixture.steelLaw,
      nEd: -800000,
      theta,
      compressedSide: "positive",
    });
  const zero = solve(0);

  for (const fullTurn of [2 * Math.PI, -2 * Math.PI]) {
    const result = solve(fullTurn);

    assert.equal(result.theta, 0);
    approx(result.MxRd, zero.MxRd, 1e-6);
    approx(result.MyRd, zero.MyRd, 1e-6);
    assert.equal(Math.sign(result.MxRd), Math.sign(zero.MxRd));
    assert.equal(Math.sign(result.MyRd), Math.sign(zero.MyRd));
  }

  const diagonal = solve(Math.PI / 4);
  const diagonalFullTurn = solve(Math.PI / 4 + 2 * Math.PI);

  assert.equal(diagonalFullTurn.theta, diagonal.theta);
  approx(diagonalFullTurn.MxRd, diagonal.MxRd, 1e-6);
  approx(diagonalFullTurn.MyRd, diagonal.MyRd, 1e-6);
});

test("theta pi over two rotates counterclockwise and positive-side compression gives positive Myy", () => {
  const fixture = createSolverFixture();
  const solver = new RCUltimateSectionSolver();
  const positiveSide = solver.solveAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    theta: Math.PI / 2,
    compressedSide: "positive",
  });
  const negativeSide = solver.solveAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    theta: Math.PI / 2,
    compressedSide: "negative",
  });

  approx(positiveSide.MxRd, 0, 1e-6);
  assert.ok(positiveSide.MyRd > 0);
  assert.equal(positiveSide.concreteStrainExtremes.compression.z, 0);
  approx(negativeSide.MxRd, 0, 1e-6);
  assert.ok(negativeSide.MyRd < 0);
  assert.ok(positiveSide.MyRd * negativeSide.MyRd < 0);
});

test("moment-curvature and ultimate resistance use the same components at a common theta", () => {
  const fixture = createSolverFixture();
  const theta = Math.PI / 2;
  const ultimate = new RCUltimateSectionSolver().solveAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    theta,
    compressedSide: "positive",
  });
  const curvature = Math.hypot(
    ultimate.strainField.kappaY,
    ultimate.strainField.kappaZ,
  );
  const point = new RCMomentCurvatureAnalyzer().solveAtCurvature({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    theta,
    compressedSide: "positive",
    curvature,
    eps0Hint: ultimate.strainField.eps0,
    postUltimateResponse: "retain",
  });

  assert.equal(point.converged, true);
  approx(point.Mx, ultimate.MxRd, 5);
  approx(point.My, ultimate.MyRd, 5);
  assert.ok(point.My > 0);
});

test("rc ultimate section solver changes moment sign when compressed edge flips", () => {
  const fixture = createSolverFixture();
  const solver = new RCUltimateSectionSolver();
  const topResult = solver.solveUniaxialAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    compressedEdge: "top",
  });
  const bottomResult = solver.solveUniaxialAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    compressedEdge: "bottom",
  });

  assert.equal(topResult.converged, true);
  assert.equal(bottomResult.converged, true);
  assert.ok(topResult.MxRd * bottomResult.MxRd < 0);
  approx(Math.abs(topResult.MxRd), Math.abs(bottomResult.MxRd), 5e4);
});

test("rc ultimate section solver can be governed by steel ultimate tension strain", () => {
  const fixture = createSolverFixture();
  const steelLaw = new SteelElasticPerfectlyPlasticLaw({
    Es: fixture.steelLaw.Es,
    fyd: fixture.steelLaw.fyd,
    esu: 0.003,
  });
  const solver = new RCUltimateSectionSolver();
  const result = solver.solveUniaxialAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw,
    nEd: 0,
    compressedEdge: "top",
  });

  assert.equal(result.converged, true);
  assert.equal(result.failureMode, "steel-tension");
  approx(result.state.extremes.maxSteelTension.strain, 0.003, 1e-12);
  assert.ok(Math.abs(result.state.extremes.minStrain) < 0.0035);
  approx(result.axialResidual, 0, 5);
});
