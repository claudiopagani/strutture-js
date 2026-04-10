import test from "node:test";
import assert from "node:assert/strict";

import {
  ConcreteParabolaRectangleLaw,
  RCUniaxialDomainBuilder,
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  SteelElasticPerfectlyPlasticLaw,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createUniaxialFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC uniaxial domain fixture",
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

  return {
    section,
    fibers: new SectionFiberDiscretizer().discretize(section, {
      targetCount: 120,
    }).fibers,
    concreteLaw: new ConcreteParabolaRectangleLaw({
      fcd: concreteMaterial.fcd,
      ec2: 0.002,
      ecu: 0.0035,
    }),
    steelLaw: new SteelElasticPerfectlyPlasticLaw({
      Es: reinforcementMaterial.elasticModulus,
      fyd: reinforcementMaterial.fyd,
      esu: 0.01,
    }),
  };
}

test("uniaxial domain builder returns M-N points for assigned axial-force levels", () => {
  const fixture = createUniaxialFixture();
  const domain = new RCUniaxialDomainBuilder().build({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nValues: [-1200000, -800000, -400000, -100000],
  });

  assert.equal(domain.points.length, 4);
  assert.ok(domain.points.every((point) => point.converged));
  assert.ok(domain.points.every((point) => Math.abs(point.axialResidual) < 10));
});
