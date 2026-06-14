import test from "node:test";
import assert from "node:assert/strict";

import {
  ConcreteNoTensionLaw,
  RCServiceStressSolver,
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  SteelElasticLaw,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createServiceFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC service fixture",
    concreteSection: new RectangularSection({ width: 300, height: 500, units }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 450,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 450,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return {
    section,
    fibers: new SectionFiberDiscretizer().discretize(section, {
      targetCount: 120,
    }).fibers,
    concreteLaw: new ConcreteNoTensionLaw({
      ecm: concreteMaterial.elasticModulus,
    }),
    steelLaw: new SteelElasticLaw({
      Es: reinforcementMaterial.elasticModulus,
    }),
  };
}

test("service stress solver equilibrates a combined N-Mx-My state with concrete tension excluded", () => {
  const fixture = createServiceFixture();
  const result = new RCServiceStressSolver({
    tolerance: 1e-2,
    maxIterations: 50,
  }).solve({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    actions: {
      nEd: -400000,
      mxEd: 6e7,
      myEd: 2e7,
    },
  });

  assert.equal(result.converged, true);
  assert.ok(Math.abs(result.residual.n) < 1e-1);
  assert.ok(Math.abs(result.residual.mx) < 1e-1);
  assert.ok(Math.abs(result.residual.my) < 1e-1);
  assert.equal(result.state.extremes.maxConcreteTension, null);
  assert.ok(result.strainField.kappaZ > 0);
  assert.ok(result.strainField.kappaY > 0);
  assert.ok(result.state.extremes.maxConcreteCompression.y > 250);
  assert.ok(result.state.extremes.maxConcreteCompression.z < 150);
  assert.equal(result.state.extremes.maxSteelTension.id, "bottom-right");
});
