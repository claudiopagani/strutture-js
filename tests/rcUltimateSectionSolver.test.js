import test from "node:test";
import assert from "node:assert/strict";

import {
  ConcreteParabolaRectangleLaw,
  RCUltimateSectionSolver,
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  SteelElasticPerfectlyPlasticLaw,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createSolverFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
  });
  const section = new ReinforcedConcreteSection({
    name: "RC SLU solver fixture",
    concreteSection: new RectangularSection({ width: 300, height: 500 }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
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
  assert.ok(Math.abs(result.MxRd) > 0);
  approx(result.MyRd, 0, 1e-6);
  assert.ok(result.state.extremes.maxConcreteCompression.value < 0);
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
