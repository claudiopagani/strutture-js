import test from "node:test";
import assert from "node:assert/strict";

import {
  ConcreteNoTensionLaw,
  ConcreteParabolaRectangleLaw,
  ConcreteStressBlockLaw,
  ConcreteTriangularRectangleLaw,
  IllinoisRootSolver,
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  SteelElasticPlasticHardeningLaw,
  SteelElasticPerfectlyPlasticLaw,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("concrete parabola-rectangle law returns zero in tension and design compression in plateau", () => {
  const law = new ConcreteParabolaRectangleLaw({
    fcd: 14.17,
    ec2: 0.002,
    ecu: 0.0035,
  });

  approx(law.stress(0.0005), 0);
  approx(law.stress(-0.002), -14.17, 1e-9);
  approx(law.stress(-0.0035), -14.17, 1e-9);
});

test("concrete triangular-rectangle law ramps linearly to design compression", () => {
  const law = new ConcreteTriangularRectangleLaw({
    fcd: 14.17,
    ec3: 0.00175,
    ecu: 0.0035,
  });

  approx(law.stress(0.0005), 0);
  approx(law.stress(-0.000875), -7.085, 1e-9);
  approx(law.stress(-0.00175), -14.17, 1e-9);
  approx(law.stress(-0.0035), -14.17, 1e-9);
  approx(law.peakCompressionStrain(), 0.00175, 1e-12);
});

test("concrete stress-block law applies a rectangular compression stress", () => {
  const law = new ConcreteStressBlockLaw({
    fcd: 14.17,
    eta: 0.9,
    ec4: 0,
    ecu: 0.0035,
  });

  approx(law.stress(0.0005), 0);
  approx(law.stress(-0.0001), -12.753, 1e-9);
  approx(law.stress(-0.0035), -12.753, 1e-9);
});

test("concrete no-tension law reacts only in compression and can cap stress", () => {
  const law = new ConcreteNoTensionLaw({
    ecm: 30000,
    compressionCap: 12,
  });

  approx(law.stress(0.0002), 0);
  approx(law.stress(-0.0002), -6);
  approx(law.stress(-0.001), -12);
});

test("steel elastic-plastic hardening law reaches ultimate design stress at esu", () => {
  const law = new SteelElasticPlasticHardeningLaw({
    Es: 210000,
    fyd: 391.3,
    ftd: 469.6,
    esu: 0.01,
  });

  approx(law.yieldStrain(), 391.3 / 210000, 1e-12);
  approx(law.stress(0.001), 210);
  approx(law.stress(law.yieldStrain()), 391.3, 1e-9);
  approx(law.stress(0.01), 469.6, 1e-9);
  approx(law.stress(-0.01), -469.6, 1e-9);
});

test("steel elastic-perfectly-plastic law yields at the design stress", () => {
  const law = new SteelElasticPerfectlyPlasticLaw({
    Es: 210000,
    fyd: 391.3,
    esu: 0.01,
  });

  approx(law.yieldStrain(), 391.3 / 210000, 1e-12);
  approx(law.stress(0.001), 210);
  approx(law.stress(0.01), 391.3);
  approx(law.stress(-0.01), -391.3);
});

test("illinois root solver converges on a smooth scalar function", () => {
  const solver = new IllinoisRootSolver({
    tolerance: 1e-10,
    maxIterations: 50,
  });
  const result = solver.solve({
    fn: (x) => x ** 2 - 2,
    min: 1,
    max: 2,
  });

  assert.equal(result.converged, true);
  approx(result.root, Math.sqrt(2), 1e-8);
  assert.ok(result.iterations > 0);
  assert.ok(Array.isArray(result.history));
});

test("illinois root solver can skip diagnostic history", () => {
  const solver = new IllinoisRootSolver({
    tolerance: 1e-10,
    maxIterations: 50,
  });
  const result = solver.solve({
    fn: (x) => x ** 2 - 2,
    min: 1,
    max: 2,
    includeHistory: false,
  });

  assert.equal(result.converged, true);
  approx(result.root, Math.sqrt(2), 1e-8);
  assert.equal("history" in result, false);
});

test("reinforced concrete section exposes geometry support helpers", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC helper demo",
    concreteSection: new RectangularSection({ width: 300, height: 500, units }),
    reinforcementBars: [
      new ReinforcementBar({
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 60,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  assert.equal(section.getConcreteOutlinePoints().length, 4);
  assert.equal(section.getReinforcementBars().length, 1);
  assert.deepEqual(section.getBoundingBox(), {
    minY: 0,
    maxY: 500,
    minZ: 0,
    maxZ: 300,
  });
  assert.deepEqual(section.getReferencePoint("concrete-centroid"), {
    y: 250,
    z: 150,
  });
  assert.deepEqual(section.getReferencePoint("section-center"), {
    y: 250,
    z: 150,
  });
  assert.deepEqual(
    section.getReferencePoint("custom", { y: 10, z: 20, units }),
    { y: 10, z: 20 },
  );
});
