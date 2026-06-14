import test from "node:test";
import assert from "node:assert/strict";

import {
  ConcreteParabolaRectangleLaw,
  RCBiaxialDomainBuilder,
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  SteelElasticPerfectlyPlasticLaw,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createBiaxialFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC biaxial fixture",
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

test("biaxial domain builder returns a set of resistant points at assigned axial force", () => {
  const fixture = createBiaxialFixture();
  const domain = new RCBiaxialDomainBuilder().buildAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    angleCount: 16,
  });

  assert.equal(domain.points.length, 16);
  assert.ok(domain.points.every((point) => point.converged));
  assert.ok(domain.points.every((point) => Math.abs(point.axialResidual) < 10));
  assert.ok(
    domain.points.every((point) =>
      Number.isFinite(point.concreteCompressionEdge?.strain),
    ),
  );
  assert.ok(domain.points.some((point) => Math.abs(point.MxRd) > 0));
  assert.ok(domain.points.some((point) => Math.abs(point.MyRd) > 0));
});

test("biaxial domain follows increasing theta counterclockwise from Mzz to Myy", () => {
  const fixture = createBiaxialFixture();
  const domain = new RCBiaxialDomainBuilder().buildAtAxialLoad({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: -800000,
    angleCount: 4,
  });
  const [theta0, theta90, theta180, theta270] = domain.points;

  assert.equal(theta0.theta, 0);
  assert.equal(theta90.theta, Math.PI / 2);
  assert.equal(theta180.theta, Math.PI);
  assert.equal(theta270.theta, (3 * Math.PI) / 2);
  assert.ok(theta0.MxRd > 0);
  assert.ok(theta90.MyRd > 0);
  assert.ok(theta180.MxRd < 0);
  assert.ok(theta270.MyRd < 0);
  assert.equal(theta90.concreteCompressionEdge.z, 0);
  assert.equal(theta270.concreteCompressionEdge.z, 300);
});
