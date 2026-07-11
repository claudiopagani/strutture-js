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

const units = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createDemoSection() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });

  return new ReinforcedConcreteSection({
    name: "RC section for fiber analysis",
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

  const counterclockwiseField = StrainField.fromNeutralAxis({
    theta: Math.PI / 2,
    curvature: 0.002,
  });
  const fullTurnField = StrainField.fromNeutralAxis({
    theta: 2 * Math.PI,
    curvature: 0.002,
    neutralAxisOffset: 100,
  });

  approx(counterclockwiseField.strainAt({ y: 0, z: 100 }), -0.2);
  approx(counterclockwiseField.strainAt({ y: 0, z: -100 }), 0.2);
  approx(fullTurnField.strainAt({ y: 200, z: 0 }), 0.2);
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

test("rc section state integrator accepts affine strain coefficients", () => {
  const section = createDemoSection();
  const discretizer = new SectionFiberDiscretizer();
  const mesh = discretizer.discretize(section, { targetCount: 100 });
  const integrator = new RCSectionStateIntegrator();
  const concreteLaw = new ConcreteNoTensionLaw({
    ecm: section.concreteMaterial.elasticModulus,
    compressionCap: section.concreteMaterial.fcd,
  });
  const steelLaw = new SteelElasticPerfectlyPlasticLaw({
    Es: section.reinforcementMaterial.elasticModulus,
    fyd: section.reinforcementMaterial.fyd,
    esu: 0.01,
  });
  const classResult = integrator.evaluate({
    section,
    concreteFibers: mesh.fibers,
    concreteLaw,
    steelLaw,
    strainField: new StrainField({
      eps0: -0.0002,
      kappaY: 0,
      kappaZ: 0.000001,
    }),
    includeConcreteTension: false,
    includeResponseDetails: false,
  });
  const coefficientsResult = integrator.evaluate({
    section,
    concreteFibers: mesh.fibers,
    concreteLaw,
    steelLaw,
    strainField: {
      eps0: -0.0002,
      kappaY: 0,
      kappaZ: 0.000001,
    },
    includeConcreteTension: false,
    includeResponseDetails: false,
  });

  approx(coefficientsResult.N, classResult.N);
  approx(coefficientsResult.Mx, classResult.Mx);
  approx(coefficientsResult.My, classResult.My);
});

test("rc section fast evaluators match the complete integration kernel", () => {
  const section = createDemoSection();
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 100,
  });
  const integrator = new RCSectionStateIntegrator();
  const concreteLaw = new ConcreteNoTensionLaw({
    ecm: section.concreteMaterial.elasticModulus,
    compressionCap: section.concreteMaterial.fcd,
  });
  const steelLaw = new SteelElasticPerfectlyPlasticLaw({
    Es: section.reinforcementMaterial.elasticModulus,
    fyd: section.reinforcementMaterial.fyd,
    esu: 0.01,
  });
  const fractureEnergyDensity =
    0.5 * section.reinforcementMaterial.fyd * 0.01;
  const scenarios = [
    {
      strainField: {
        eps0: -0.0002,
        kappaY: 0.0000004,
        kappaZ: 0.000001,
      },
      postUltimateResponse: "retain",
      postUltimateFractureEnergyDensity: null,
    },
    {
      strainField: new StrainField({
        eps0: 0.015,
        kappaY: 0,
        kappaZ: 0,
      }),
      postUltimateResponse: "zero-stress",
      postUltimateFractureEnergyDensity: null,
    },
    {
      strainField: {
        eps0: 0.015,
        kappaY: 0,
        kappaZ: 0,
      },
      postUltimateResponse: "linear-softening",
      postUltimateFractureEnergyDensity: {
        steel: fractureEnergyDensity,
      },
    },
  ];

  for (const scenario of scenarios) {
    const options = {
      section,
      concreteFibers: mesh.fibers,
      concreteLaw,
      steelLaw,
      includeConcreteTension: false,
      postUltimateResponse: scenario.postUltimateResponse,
      postUltimateFractureEnergyDensity:
        scenario.postUltimateFractureEnergyDensity,
    };
    const evaluateAxialForce = integrator.createAxialForceEvaluator(options);
    const evaluateResultants = integrator.createResultantEvaluator(options);
    const completeState = integrator.evaluate({
      ...options,
      strainField: scenario.strainField,
      includeResponseDetails: false,
    });

    approx(evaluateAxialForce(scenario.strainField), completeState.N, 1e-8);
    const resultants = evaluateResultants(scenario.strainField);

    approx(resultants.N, completeState.N, 1e-8);
    approx(resultants.Mx, completeState.Mx, 1e-6);
    approx(resultants.My, completeState.My, 1e-6);
  }
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

test("rc section state integrator uses Mzz = -sum Fi yi for top-edge compression", () => {
  const section = createDemoSection();
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 100,
  });
  const result = new RCSectionStateIntegrator().evaluate({
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
      eps0: 0.0005,
      kappaZ: 0.000002,
    }),
    includeConcreteTension: false,
  });
  const integratedMx = [
    ...result.concrete.fibers,
    ...result.steel.bars,
  ].reduce((sum, item) => sum + item.mx, 0);

  assert.ok(result.Mx > 0);
  approx(result.Mx, integratedMx, 1e-6);
  result.concrete.fibers.forEach((fiber) => {
    const leverY = fiber.y - result.referencePoint.y;
    approx(fiber.mx, -fiber.force * leverY, 1e-9);
  });
});

test("rc section state integrator uses Myy = sum Fi zi for left-edge compression", () => {
  const section = createDemoSection();
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 100,
  });
  const result = new RCSectionStateIntegrator().evaluate({
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
      eps0: -0.0003,
      kappaY: 0.000002,
    }),
    includeConcreteTension: false,
  });

  assert.ok(result.My > 0);
  approx(result.Mx, 0, 1e-6);
  result.concrete.fibers.forEach((fiber) => {
    const leverZ = fiber.z - result.referencePoint.z;
    approx(fiber.my, fiber.force * leverZ, 1e-9);
  });
});

test("rc section state integrator tracks steel strain extremes after yielding", () => {
  const section = createDemoSection();
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 100,
  });
  const result = new RCSectionStateIntegrator().evaluate({
    section,
    concreteFibers: mesh.fibers,
    concreteLaw: new ConcreteNoTensionLaw({
      ecm: section.concreteMaterial.elasticModulus,
      compressionCap: section.concreteMaterial.fcd,
    }),
    steelLaw: new SteelElasticPerfectlyPlasticLaw({
      Es: section.reinforcementMaterial.elasticModulus,
      fyd: section.reinforcementMaterial.fyd,
      esu: 0.07,
    }),
    strainField: new StrainField({
      eps0: -0.0035,
      kappaZ: -0.000154,
    }),
    includeConcreteTension: false,
  });

  assert.equal(result.extremes.maxSteelTensionStrain.id, "top-left");
  assert.equal(result.extremes.maxSteelTensionStrain.y, 450);
  approx(result.extremes.maxSteelTensionStrain.strain, 0.0658, 1e-12);
  assert.equal(
    result.extremes.maxSteelTensionStrain.stress,
    section.reinforcementMaterial.fyd,
  );
});

test("rc section state integrator drops stress to zero after ultimate strain", () => {
  const section = createDemoSection();
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 100,
  });
  const result = new RCSectionStateIntegrator().evaluate({
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
    strainField: new StrainField({ eps0: 0.015 }),
  });

  assert.ok(result.steel.bars.every((bar) => bar.stress === 0));
  assert.ok(result.steel.bars.every((bar) => bar.postUltimate));
  assert.deepEqual(result.postUltimate.fractureEnergyDensity, {
    concrete: 0,
    steel: 0,
  });
});

test("rc section state integrator derives softening tail from fracture-energy density", () => {
  const section = createDemoSection();
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 100,
  });
  const fyd = section.reinforcementMaterial.fyd;
  const fractureEnergyDensity = 0.5 * fyd * 0.01;
  const result = new RCSectionStateIntegrator().evaluate({
    section,
    concreteFibers: mesh.fibers,
    concreteLaw: new ConcreteNoTensionLaw({
      ecm: section.concreteMaterial.elasticModulus,
      compressionCap: section.concreteMaterial.fcd,
    }),
    steelLaw: new SteelElasticPerfectlyPlasticLaw({
      Es: section.reinforcementMaterial.elasticModulus,
      fyd,
      esu: 0.01,
    }),
    strainField: new StrainField({ eps0: 0.015 }),
    postUltimateResponse: "linear-softening",
    postUltimateFractureEnergyDensity: {
      steel: fractureEnergyDensity,
    },
  });

  result.steel.bars.forEach((bar) => {
    approx(bar.stress, 0.5 * fyd, 1e-9);
    approx(bar.terminalStrain, 0.02, 1e-12);
    assert.equal(bar.fractureEnergyDensity, fractureEnergyDensity);
  });
});

test("rc section state integrator rejects softening without fracture-energy density", () => {
  const section = createDemoSection();
  const mesh = new SectionFiberDiscretizer().discretize(section, {
    targetCount: 100,
  });

  assert.throws(
    () =>
      new RCSectionStateIntegrator().evaluate({
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
        strainField: new StrainField({ eps0: 0.015 }),
        postUltimateResponse: "linear-softening",
      }),
    /requires a positive postUltimateFractureEnergyDensity/,
  );
});
