import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcedConcreteBeamVerification,
  ReinforcedConcreteBeamSectionProvider,
  ReinforcedConcreteSection,
  ReinforcementBar,
  SingleBeamAnalysis,
  createLongitudinalReinforcementLayout,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  createReinforcedConcreteBeamSectionProvider,
} from "../src/index.js";

const units = { force: "N", length: "mm" };
const beamUnits = { force: "kN", length: "m" };

test("reinforced concrete beam reports missing input as not analyzed", () => {
  const result = new ReinforcedConcreteBeamVerification().verify();

  assert.equal(result.status, "not-analyzed");
});

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

test("reinforced concrete beam verification includes SLE biaxial stress and warns on neglected crack/shear components", () => {
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
  const reinforcementLayout = createLongitudinalReinforcementLayout({
    section: concreteSection,
    material: reinforcementMaterial,
    units,
    bottom: {
      id: "bottom-main",
      diameter: 16,
      count: 2,
      cover: 40,
    },
    top: {
      id: "top-main",
      diameter: 16,
      count: 2,
      cover: 40,
    },
  });
  const section = new ReinforcedConcreteSection({
    name: "RC rotated SLE section",
    concreteSection,
    reinforcementBars: reinforcementLayout.reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    units,
    metadata: {
      longitudinalReinforcementGroups:
        reinforcementLayout.longitudinalReinforcementGroups,
    },
  });
  const sectionProvider = createReinforcedConcreteBeamSectionProvider({
    section,
    stiffnessState: "transformed",
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "rc-alpha",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    },
    sectionRotation: {
      alpha: 10,
      units: "deg",
    },
    sectionProvider,
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "g1",
        loadCaseId: "G1",
        type: "uniform",
        value: -1,
      },
      {
        id: "live",
        loadCaseId: "LIVE",
        type: "uniform",
        value: -0.5,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        combinationType: "ULS_STR_GEO",
        factors: {
          G1: 1.3,
          LIVE: 1.5,
        },
      },
      {
        id: "sqp",
        limitState: "SLE",
        combinationType: "SLE_QUASI_PERMANENT",
        factors: {
          G1: 1,
          LIVE: 0.3,
        },
      },
    ],
    discretization: {
      elementCount: 2,
    },
  });
  const verification = new ReinforcedConcreteBeamVerification({
    mesh: { targetFiberCount: 40 },
    solver: {
      tolerance: 1e-4,
      maxIterations: 80,
      serviceTolerance: 1e-2,
      serviceMaxIterations: 80,
    },
    verificationStations: {
      mode: "critical",
    },
  }).verify({
    beamId: "rc-alpha",
    section,
    concreteMaterial,
    reinforcementMaterial,
    analysisResult,
  });
  const sleStress = verification.checks.find(
    (check) => check.id === "rc-sle-concrete-stress",
  );
  const crackCheck = verification.checks.find((check) =>
    check.id.startsWith("rc-sle-crack"),
  );
  const biaxialBendingCheck = verification.checks.find(
    (check) => check.id === "rc-uls-biaxial-bending",
  );

  assert.equal(verification.status, "ok");
  assert.equal(
    biaxialBendingCheck.metadata.method,
    "sampled-biaxial-domain-ray-intersection",
  );
  assert.ok(Number.isFinite(biaxialBendingCheck.metadata.intersection.mxRd));
  assert.ok(Number.isFinite(biaxialBendingCheck.metadata.intersection.myRd));
  assert.equal(sleStress.metadata.biaxialStress, true);
  assert.ok(sleStress.metadata.mxEd > 0);
  assert.ok(sleStress.metadata.myEd > 0);
  assert.equal(crackCheck.metadata.weakAxisMomentNeglected, true);
  assert.ok(
    verification.warnings.some((warning) =>
      warning.includes("vZ from section rotation"),
    ),
  );
  assert.ok(
    verification.warnings.some((warning) =>
      warning.includes("indirect crack control uses only the primary mY"),
    ),
  );
});
