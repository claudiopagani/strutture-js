import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcedConcreteBeamSectionProvider,
  ReinforcedConcreteSection,
  ReinforcementBar,
  SingleBeamAnalysis,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createReinforcedConcreteBeamSectionProvider,
} from "../src/index.js";

const units = { force: "N", length: "mm" };
const beamUnits = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createRcFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const concreteSection = new RectangularSection({
    width: 300,
    height: 500,
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC beam section",
    concreteSection,
    reinforcementBars: [
      new ReinforcementBar({
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 60,
        units,
      }),
      new ReinforcementBar({
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
    referenceModularRatio:
      reinforcementMaterial.elasticModulus / concreteMaterial.elasticModulus,
    units,
  });

  return { concreteMaterial, reinforcementMaterial, concreteSection, section };
}

test("reinforced concrete beam provider returns gross and transformed stiffness", () => {
  const { concreteMaterial, concreteSection, section } = createRcFixture();
  const provider = new ReinforcedConcreteBeamSectionProvider({
    section,
    stiffnessState: "gross",
  });
  const gross = provider.getElasticBeamProperties();
  const transformed = provider.getElasticBeamProperties({
    stiffnessState: "transformed",
  });

  approx(gross.axialRigidity, concreteMaterial.elasticModulus * concreteSection.area);
  approx(
    gross.flexuralRigidity,
    concreteMaterial.elasticModulus * concreteSection.inertiaY,
  );
  approx(
    transformed.flexuralRigidity,
    concreteMaterial.elasticModulus * section.transformedSection.inertiaY,
  );
  assert.equal(gross.metadata.stiffnessState, "gross");
  assert.equal(transformed.metadata.stiffnessState, "transformed");
  assert.equal(transformed.metadata.cracked, false);
  assert.ok(transformed.flexuralRigidity !== gross.flexuralRigidity);
});

test("reinforced concrete beam provider can drive SingleBeamAnalysis", () => {
  const { section } = createRcFixture();
  const sectionProvider = createReinforcedConcreteBeamSectionProvider({
    section,
    stiffnessState: "transformed",
  });
  const result = new SingleBeamAnalysis().analyze({
    id: "rc-beam",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 },
    },
    sectionProvider,
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "g1",
        actionType: "G1",
        type: "uniform",
        value: -12,
      },
    ],
    combinations: [
      {
        id: "sle",
        limitState: "SLE",
        stiffnessState: "gross",
        factors: { G1: 1 },
      },
    ],
    discretization: {
      elementCount: 4,
    },
  });
  const combination = result.combinations.sle;

  assert.equal(
    combination.sectionProperties.metadata.provider,
    "ReinforcedConcreteBeamSectionProvider",
  );
  assert.equal(combination.sectionProperties.metadata.stiffnessState, "gross");
  assert.ok(Math.abs(combination.displacements.maxAbsVerticalDisplacement.uy) > 0);
});
