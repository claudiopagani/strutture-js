import test from "node:test";
import assert from "node:assert/strict";

import {
  SingleBeamAnalysis,
  SteelBeamSectionProvider,
  SteelMemberVerification,
  createNTC2018StructuralSteelMaterial,
  createSteelBeamSectionProvider,
  createSteelProfileSection,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const beamUnits = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createSteelFixture() {
  const section = createSteelProfileSection({
    profileName: "IPE200",
    units,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });

  return { section, material };
}

test("steel beam provider returns elastic stiffness and resistance metadata", () => {
  const { section, material } = createSteelFixture();
  const provider = new SteelBeamSectionProvider({
    section,
    material,
  });
  const properties = provider.getElasticBeamProperties({ limitState: "ULS" });

  approx(properties.axialRigidity, material.elasticModulus * section.area);
  approx(properties.flexuralRigidity, material.elasticModulus * section.inertiaY);
  assert.ok(properties.shearRigidity > 0);
  assert.equal(properties.metadata.provider, "SteelBeamSectionProvider");
  assert.equal(properties.metadata.profileName, "IPE200");
  assert.equal(properties.metadata.grade, "S275");
  approx(properties.metadata.fyd, material.fyd);
  approx(
    properties.metadata.elasticMomentResistance,
    material.fyd * section.catalogProperties.Wel_y * 1e9,
    1e-6,
  );
  approx(
    properties.metadata.plasticMomentResistance,
    material.fyd * section.catalogProperties.Wpl_y * 1e9,
    1e-6,
  );
});

test("steel beam provider can drive SingleBeamAnalysis with Timoshenko model", () => {
  const { section, material } = createSteelFixture();
  const sectionProvider = createSteelBeamSectionProvider({
    section,
    material,
  });
  const result = new SingleBeamAnalysis().analyze({
    id: "steel-beam",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 },
    },
    sectionProvider,
    analysisModel: "timoshenko",
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "g1",
        actionType: "G1",
        type: "uniform",
        value: -8,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3 },
      },
    ],
    discretization: {
      elementCount: 4,
    },
  });
  const combination = result.combinations.uls;

  assert.equal(combination.sectionProperties.metadata.provider, "SteelBeamSectionProvider");
  assert.equal(combination.sectionProperties.metadata.limitState, "ULS");
  assert.ok(Math.abs(combination.displacements.maxAbsVerticalDisplacement.uy) > 0);
  assert.ok(result.envelopes.uls.maxAbsBendingMoment.value > 0);
});

test("steel member verification checks base resistance from FEM samples", () => {
  const { section, material } = createSteelFixture();
  const sectionProvider = createSteelBeamSectionProvider({
    section,
    material,
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "steel-check",
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
        value: -4,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3 },
      },
    ],
    discretization: {
      elementCount: 4,
    },
  });
  const verification = new SteelMemberVerification().verify({
    memberId: "steel-check",
    section,
    material,
    analysisResult,
  });

  assert.equal(verification.applicationId, "steel-frames");
  assert.equal(verification.status, "ok");
  assert.ok(verification.checks.some((check) => check.id === "steel-bending"));
  assert.ok(verification.checks.some((check) => check.id === "steel-shear"));
  assert.ok(verification.checks.some((check) => check.id === "steel-axial"));
  assert.ok(verification.utilizationRatio < 1);
});
