import test from "node:test";
import assert from "node:assert/strict";

import {
  SingleBeamAnalysis,
  XlamBeamSectionProvider,
  XlamBeamVerification,
  XlamMaterial,
  XlamPanelSection,
} from "../src/index.js";

const beamUnits = { force: "kN", length: "m" };
const sectionUnits = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createXlamFixture() {
  const section = new XlamPanelSection({
    effectiveWidth: 1000,
    layerThicknesses: [30, 20, 30, 20, 30],
    activeLayerIndexes: [0, 2, 4],
    units: sectionUnits,
  });
  const material = new XlamMaterial({
    name: "XLAM validation material",
    strengthClass: "custom-xlam",
    elasticModulus: 11000,
    e0Mean: 11000,
    e90Mean: 370,
    g0Mean: 690,
    g90Mean: 70,
    fmK: 24,
    fvK: 2.7,
    rollingShearStrength: 1.2,
    kdef: 0.8,
    units: sectionUnits,
  });

  return { section, material };
}

test("xlam beam provider exposes Timoshenko stiffness for a panel strip", () => {
  const { section, material } = createXlamFixture();
  const provider = new XlamBeamSectionProvider({
    section,
    material,
    kdef: 0.8,
  });
  const instant = provider.getElasticBeamProperties({ limitState: "ULS" });
  const final = provider.getElasticBeamProperties({
    limitState: "SLE",
    deformationState: "final",
  });

  approx(instant.axialRigidity, material.e0Mean * section.area);
  approx(instant.flexuralRigidity, section.calculateBendingStiffness(material));
  assert.ok(instant.shearRigidity > 0);
  assert.equal(instant.shearCorrectionFactor, 1);
  approx(final.flexuralRigidity, instant.flexuralRigidity / 1.8);
  assert.equal(instant.metadata.provider, "XlamBeamSectionProvider");
});

test("xlam beam verification checks FEM bending, rolling shear and deflection", () => {
  const { section, material } = createXlamFixture();
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "xlam-strip-test",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4.5, y: 0 },
    },
    analysisModel: "timoshenko",
    sectionProvider: new XlamBeamSectionProvider({
      section,
      material,
      kdef: 0.8,
    }),
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      { id: "g1", actionType: "G1", type: "uniform", value: -1.2 },
      { id: "q", actionType: "Qk", type: "uniform", value: -0.8 },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3, Qk: 1.5 },
      },
      {
        id: "sle",
        limitState: "SLE",
        combinationType: "SLE_RARE",
        factors: { G1: 1, Qk: 1 },
      },
    ],
    discretization: {
      elementCount: 6,
      stations: [2.25],
    },
    verificationStations: {
      mode: "combined",
      userStations: [2.25],
    },
  });
  const verification = new XlamBeamVerification({
    kmod: 0.8,
    gammaM: 1.45,
    verificationStations: {
      mode: "user",
      userStations: [2.25],
    },
  }).verify({
    beamId: "xlam-strip-test",
    section,
    material,
    analysisResult,
  });

  assert.equal(verification.applicationId, "xlam-beams");
  assert.ok(verification.checks.some((check) => check.id === "xlam-beam-bending"));
  assert.ok(verification.checks.some((check) => check.id === "xlam-beam-rolling-shear"));
  assert.ok(verification.checks.some((check) => check.id === "xlam-beam-deflection"));
  assert.ok(
    verification.checks.every(
      (check) =>
        check.id === "xlam-beam-deflection" ||
        check.metadata.stationSource === "user",
    ),
  );
  assert.ok(verification.warnings.some((warning) => warning.includes("vibration")));
  assert.ok(verification.warnings.some((warning) => warning.includes("fire")));
});

test("xlam beam verification neglects rotated in-plane components with a physical warning", () => {
  const { section, material } = createXlamFixture();
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "xlam-strip-rotated",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4.5, y: 0 },
    },
    sectionRotation: {
      alpha: 12,
      units: "deg",
    },
    analysisModel: "timoshenko",
    sectionProvider: new XlamBeamSectionProvider({
      section,
      material,
      kdef: 0.8,
    }),
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      { id: "g1", actionType: "G1", type: "uniform", value: -1.2 },
      { id: "q", actionType: "Qk", type: "uniform", value: -0.8 },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3, Qk: 1.5 },
      },
      {
        id: "sle",
        limitState: "SLE",
        combinationType: "SLE_RARE",
        factors: { G1: 1, Qk: 1 },
      },
    ],
    discretization: {
      elementCount: 6,
      stations: [2.25],
    },
    verificationStations: {
      mode: "combined",
      userStations: [2.25],
    },
  });
  const verification = new XlamBeamVerification({
    kmod: 0.8,
    gammaM: 1.45,
    verificationStations: {
      mode: "user",
      userStations: [2.25],
    },
  }).verify({
    beamId: "xlam-strip-rotated",
    section,
    material,
    analysisResult,
  });
  const bending = verification.checks.find(
    (check) => check.id === "xlam-beam-bending",
  );

  assert.equal(verification.status, "ok");
  assert.equal(bending.metadata.weakAxisComponentsNeglected, true);
  assert.ok(Math.abs(bending.metadata.mZEdSectionUnits) > 0);
  assert.ok(
    verification.warnings.some((warning) =>
      warning.includes("slab action provides high in-plane stiffness/resistance"),
    ),
  );
});
