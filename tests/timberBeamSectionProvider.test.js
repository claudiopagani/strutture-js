import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  SingleBeamAnalysis,
  TimberBeamVerification,
  TimberBeamSectionProvider,
  calculateTimberLateralBucklingReduction,
  createNTC2018BeamCombinations,
  createNTC2018PermanentAction,
  createNTC2018TimberMaterial,
  createNTC2018VariableAction,
  createTimberBeamSectionProvider,
  getNTC2018TimberKmod,
} from "../src/index.js";

const units = { force: "N", length: "mm" };
const beamUnits = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createTimberFixture() {
  const section = new RectangularSection({
    width: 120,
    height: 240,
    units,
  });
  const material = createNTC2018TimberMaterial({
    strengthClass: "C24",
    serviceClass: 1,
    units,
  });

  return { section, material };
}

test("timber lateral buckling reduction follows the EC5 piecewise curve", () => {
  approx(calculateTimberLateralBucklingReduction(0.5), 1);
  approx(calculateTimberLateralBucklingReduction(1), 0.81);
  approx(calculateTimberLateralBucklingReduction(2), 0.25);
});

test("timber beam provider returns elastic stiffness and kmod metadata", () => {
  const { section, material } = createTimberFixture();
  const provider = new TimberBeamSectionProvider({
    section,
    material,
    gammaM: 1.5,
    kdef: 0.6,
    kmodResolver: ({ loadDurationClass, serviceClass, materialType }) =>
      getNTC2018TimberKmod({
        materialType,
        serviceClass,
        loadDurationClass,
      }),
  });
  const properties = provider.getElasticBeamProperties({
    governingLoadDurationClass: "medium",
  });

  approx(properties.axialRigidity, material.elasticModulus * section.area);
  approx(properties.flexuralRigidity, material.elasticModulus * section.inertiaY);
  approx(properties.metadata.kmod, 0.8);
  approx(properties.metadata.fmD, (0.8 * material.fmK) / 1.5);
  assert.equal(properties.metadata.materialType, "solid_timber");
  assert.equal(properties.metadata.finalStiffness, false);
});

test("timber beam provider can reduce stiffness for final deformation states", () => {
  const { section, material } = createTimberFixture();
  const provider = createTimberBeamSectionProvider({
    section,
    material,
    kdef: 0.6,
    kmodByDuration: {
      permanent: 0.6,
      medium: 0.8,
    },
  });
  const properties = provider.getElasticBeamProperties({
    governingLoadDurationClass: "permanent",
    deformationState: "final",
  });

  approx(
    properties.flexuralRigidity,
    (material.elasticModulus * section.inertiaY) / 1.6,
  );
  approx(properties.metadata.kmod, 0.6);
  approx(properties.metadata.stiffnessReduction, 1.6);
});

test("timber provider receives NTC combination duration through SingleBeamAnalysis", () => {
  const { section, material } = createTimberFixture();
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -1.2,
      action: createNTC2018PermanentAction({
        id: "ACT-G1",
        permanentClass: "G1",
      }),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -2,
      action: createNTC2018VariableAction({
        id: "ACT-LIVE",
        category: "B",
      }),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_QUASI_PERMANENT"],
    idPrefix: "timber",
  });
  const provider = createTimberBeamSectionProvider({
    section,
    material,
    gammaM: 1.5,
    kdef: 0.6,
    kmodResolver: ({ loadDurationClass, serviceClass, materialType }) =>
      getNTC2018TimberKmod({
        materialType,
        serviceClass,
        loadDurationClass,
      }),
  });
  const result = new SingleBeamAnalysis().analyze({
    id: "timber",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    },
    sectionProvider: provider,
    analysisModel: "timoshenko",
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads,
    combinations,
    discretization: {
      elementCount: 2,
    },
  });
  const uls = result.combinations["timber-ULS-LIVE"];
  const quasiPermanent = result.combinations["timber-SLE_QUASI_PERMANENT-all"];

  assert.equal(uls.context.governingLoadDurationClass, "medium");
  approx(uls.sectionProperties.metadata.kmod, 0.8);
  assert.equal(quasiPermanent.context.governingLoadDurationClass, "medium");
  approx(quasiPermanent.sectionProperties.metadata.kmod, 0.8);
});

test("timber beam verification checks bending, shear, LTB and deflection from FEM results", () => {
  const { section, material } = createTimberFixture();
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -0.5,
      action: createNTC2018PermanentAction({
        id: "ACT-G1",
        permanentClass: "G1",
      }),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -1,
      action: createNTC2018VariableAction({
        id: "ACT-LIVE",
        category: "B",
      }),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE"],
    idPrefix: "timber-check",
  });
  const sectionProvider = createTimberBeamSectionProvider({
    section,
    material,
    gammaM: 1.5,
    kdef: 0.6,
    kmodResolver: ({ loadDurationClass, serviceClass, materialType }) =>
      getNTC2018TimberKmod({
        materialType,
        serviceClass,
        loadDurationClass,
      }),
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "timber-check",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    },
    sectionProvider,
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads,
    combinations,
    discretization: {
      elementCount: 4,
    },
  });
  const verification = new TimberBeamVerification({
    deflectionLimitDenominator: 300,
  }).verify({
    beamId: "timber-check",
    section,
    material,
    analysisResult,
  });

  assert.equal(verification.applicationId, "timber-beams");
  assert.equal(verification.status, "ok");
  assert.equal(verification.checks.length, 4);
  assert.ok(verification.checks.some((check) => check.id === "timber-bending"));
  assert.ok(
    verification.checks.some(
      (check) => check.id === "timber-lateral-torsional-stability",
    ),
  );
  assert.ok(verification.utilizationRatio < 1);
});

test("timber LTB verification includes weak-axis moment from section rotation", () => {
  const { section, material } = createTimberFixture();
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -0.5,
      action: createNTC2018PermanentAction({
        id: "ACT-G1",
        permanentClass: "G1",
      }),
    },
    {
      id: "snow",
      loadCaseId: "SNOW",
      value: -1,
      action: createNTC2018VariableAction({
        id: "ACT-SNOW",
        category: "H",
      }),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE"],
    idPrefix: "timber-rotated",
  });
  const sectionProvider = createTimberBeamSectionProvider({
    section,
    material,
    gammaM: 1.5,
    kdef: 0.6,
    kmodResolver: ({ loadDurationClass, serviceClass, materialType }) =>
      getNTC2018TimberKmod({
        materialType,
        serviceClass,
        loadDurationClass,
      }),
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "timber-rotated",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    },
    sectionRotation: {
      alpha: 30,
      units: "deg",
    },
    sectionProvider,
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads,
    combinations,
    discretization: {
      elementCount: 4,
    },
  });
  const verification = new TimberBeamVerification({
    deflectionLimitDenominator: 300,
    stability: {
      lateralTorsionalBuckling: {
        unbracedLength: 4,
      },
    },
  }).verify({
    beamId: "timber-rotated",
    section,
    material,
    analysisResult,
  });
  const ltbCheck = verification.checks.find(
    (check) => check.id === "timber-lateral-torsional-stability",
  );

  assert.equal(verification.status, "ok");
  assert.ok(ltbCheck);
  assert.ok(Math.abs(ltbCheck.metadata.myEd) > 0);
  assert.ok(Math.abs(ltbCheck.metadata.mzEd) > 0);
  assert.equal(ltbCheck.metadata.weakAxisMomentIncluded, true);
  assert.ok(Number.isFinite(ltbCheck.metadata.kcrit));
  assert.ok(
    verification.assumptions.some((assumption) =>
      assumption.includes("weak-axis moment Mz"),
    ),
  );
});

test("timber LTB can be disabled when the beam is declared laterally restrained", () => {
  const { section, material } = createTimberFixture();
  const loads = [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -0.5,
      action: createNTC2018PermanentAction({
        id: "ACT-G1",
        permanentClass: "G1",
      }),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -1,
      action: createNTC2018VariableAction({
        id: "ACT-LIVE",
        category: "B",
      }),
    },
  ];
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_RARE"],
    idPrefix: "timber-restrained",
  });
  const sectionProvider = createTimberBeamSectionProvider({
    section,
    material,
    gammaM: 1.5,
    kdef: 0.6,
    kmodResolver: ({ loadDurationClass, serviceClass, materialType }) =>
      getNTC2018TimberKmod({
        materialType,
        serviceClass,
        loadDurationClass,
      }),
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "timber-restrained",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    },
    sectionProvider,
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads,
    combinations,
    discretization: {
      elementCount: 4,
    },
  });
  const verification = new TimberBeamVerification({
    stability: {
      lateralTorsionalBuckling: {
        restrained: true,
      },
    },
  }).verify({
    beamId: "timber-restrained",
    section,
    material,
    analysisResult,
  });

  assert.equal(verification.status, "ok");
  assert.equal(
    verification.checks.some(
      (check) => check.id === "timber-lateral-torsional-stability",
    ),
    false,
  );
  assert.ok(
    verification.assumptions.some((assumption) =>
      assumption.includes("declared restrained"),
    ),
  );
});
