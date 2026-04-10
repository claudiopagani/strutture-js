import test from "node:test";
import assert from "node:assert/strict";

import {
  ConcreteNoTensionLaw,
  RCSectionStateIntegrator,
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  SteelElasticPerfectlyPlasticLaw,
  StrainField,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createDemoSection() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
  });

  return new ReinforcedConcreteSection({
    name: "RC section for fiber analysis",
    concreteSection: new RectangularSection({ width: 300, height: 500 }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 60,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 240,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 450,
        z: 60,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 450,
        z: 240,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
  });
}

test("section fiber discretizer generates concrete fibers inside the section bounds", () => {
  const section = createDemoSection();
  const discretizer = new SectionFiberDiscretizer();
  const mesh = discretizer.discretize(section, { targetCount: 100 });

  assert.ok(mesh.generatedCount > 0);
  assert.ok(Math.abs(mesh.generatedCount - 100) <= mesh.grid.cols);
  approx(mesh.bounds.minY, 0);
  approx(mesh.bounds.maxY, 500);
  approx(mesh.bounds.minZ, 0);
  approx(mesh.bounds.maxZ, 300);
  mesh.fibers.forEach((fiber) => {
    assert.ok(fiber.y >= 0 && fiber.y <= 500);
    assert.ok(fiber.z >= 0 && fiber.z <= 300);
    assert.ok(fiber.area > 0);
  });
});

test("strain field evaluates affine strain profiles and neutral-axis form", () => {
  const field = new StrainField({
    eps0: 0.001,
    kappaY: 0.00001,
    kappaZ: 0.00002,
  });

  approx(field.strainAt({ y: 100, z: 50 }), -0.0005);

  const neutralAxisField = StrainField.fromNeutralAxis({
    theta: 0,
    curvature: 0.002,
    neutralAxisOffset: 100,
  });

  approx(neutralAxisField.strainAt({ y: 100, z: 0 }), 0);
  approx(neutralAxisField.strainAt({ y: 0, z: 0 }), -0.2);
  approx(neutralAxisField.strainAt({ y: 200, z: 0 }), 0.2);
});

test("rc section state integrator returns near-zero moments for uniform strain on symmetric section", () => {
  const section = createDemoSection();
  const discretizer = new SectionFiberDiscretizer();
  const mesh = discretizer.discretize(section, { targetCount: 100 });
  const integrator = new RCSectionStateIntegrator();
  const result = integrator.evaluate({
    section,
    concreteFibers: mesh.fibers,
    concreteLaw: new ConcreteNoTensionLaw({
      ecm: section.concreteMaterial.elasticModulus,
      compressionCap: section.concreteMaterial.fcd,
    }),
    steelLaw: new SteelElasticPerfectlyPlasticLaw({
      Es: section.reinforcementMaterial.elasticModulus,
      fyd: section.reinforcementMaterial.fyd,
      esu: 0.01,
    }),
    strainField: new StrainField({ eps0: -0.0002 }),
    includeConcreteTension: false,
  });

  assert.ok(result.N < 0);
  approx(result.Mx, 0, 1e-6);
  approx(result.My, 0, 1e-6);
  assert.ok(result.extremes.maxConcreteCompression.value < 0);
});

test("rc section state integrator develops bending moment under linear strain profile", () => {
  const section = createDemoSection();
  const discretizer = new SectionFiberDiscretizer();
  const mesh = discretizer.discretize(section, { targetCount: 100 });
  const integrator = new RCSectionStateIntegrator();
  const result = integrator.evaluate({
    section,
    concreteFibers: mesh.fibers,
    concreteLaw: new ConcreteNoTensionLaw({
      ecm: section.concreteMaterial.elasticModulus,
      compressionCap: section.concreteMaterial.fcd,
    }),
    steelLaw: new SteelElasticPerfectlyPlasticLaw({
      Es: section.reinforcementMaterial.elasticModulus,
      fyd: section.reinforcementMaterial.fyd,
      esu: 0.01,
    }),
    strainField: new StrainField({
      eps0: -0.0005,
      kappaZ: -0.0000025,
    }),
    includeConcreteTension: false,
  });

  assert.ok(Math.abs(result.Mx) > 0);
  approx(result.My, 0, 1e-6);
  assert.ok(result.extremes.minStrain < 0);
  assert.ok(result.extremes.maxStrain > 0);
});
