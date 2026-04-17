import test from "node:test";
import assert from "node:assert/strict";

import {
  CompositeSection,
  CompositeSectionComponent,
  BeamSectionActionVerifier,
  ElasticBeamSectionProvider,
  RectangularSection,
  SingleBeamAnalysis,
  SteelMaterial,
  createElasticBeamSectionProvider,
} from "../src/index.js";

const femUnits = { force: "kN", length: "m" };
const sectionUnits = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createSteelMaterial() {
  return new SteelMaterial({
    name: "S275",
    grade: "S275",
    elasticModulus: 210000,
    shearModulus: 80769.23076923077,
    fyk: 275,
    units: sectionUnits,
  });
}

function createDemoSection() {
  return new RectangularSection({
    width: 100,
    height: 200,
    units: sectionUnits,
  });
}

function createSimpleBeamInput(overrides = {}) {
  return {
    id: "beam",
    units: femUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    },
    section: createDemoSection(),
    material: createSteelMaterial(),
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "self-weight",
        actionType: "G1",
        type: "uniform",
        value: -2,
      },
    ],
    discretization: {
      elementCount: 4,
    },
    combinations: false,
    ...overrides,
  };
}

test("single beam analysis solves a simply supported elastic beam from section and material", () => {
  const result = new SingleBeamAnalysis().analyze(createSimpleBeamInput());
  const loadCase = result.loadCases.G1;
  const midspanDisplacement = loadCase.displacements.samples.find(
    (sample) => sample.station === 2,
  );
  const qAbs = 2;
  const span = 4;
  const ei = 14000;

  approx(loadCase.reactionByNode["beam-beam-node-1"].uy, 4);
  approx(loadCase.reactionByNode["beam-beam-node-5"].uy, 4);
  approx(loadCase.internalForces.maxAbsBendingMoment.m, 4);
  approx(midspanDisplacement.uy, (-5 * qAbs * span ** 4) / (384 * ei));
  approx(loadCase.sectionProperties.flexuralRigidity, ei);
});

test("vertical loads on an inclined beam use horizontal projection by default", () => {
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      geometry: {
        start: { x: 0, y: 0 },
        end: { x: 3, y: 4 },
      },
      loads: [
        {
          id: "g1",
          actionType: "G1",
          type: "uniform",
          value: -10,
        },
      ],
      discretization: {
        elementCount: 5,
      },
    }),
  );
  const loadCase = result.loadCases.G1;

  approx(loadCase.geometry.length, 5);
  approx(loadCase.geometry.horizontalSpan, 3);
  approx(loadCase.reactionByNode["beam-beam-node-1"].uy, 15, 1e-8);
  approx(loadCase.reactionByNode["beam-beam-node-6"].uy, 15, 1e-8);
});

test("section rotation projects vertical bending on principal section axes", () => {
  const alpha = Math.PI / 6;
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      sectionRotation: {
        alpha: 30,
        units: "deg",
      },
      discretization: {
        elementCount: 4,
      },
    }),
  );
  const loadCase = result.loadCases.G1;
  const midspan = loadCase.internalForces.samples.find(
    (sample) => sample.station === 2,
  );
  const eiY = 14000;
  const eiZ = 3500;
  const eiVertical =
    1 / (Math.cos(alpha) ** 2 / eiY + Math.sin(alpha) ** 2 / eiZ);
  const midspanDisplacement = loadCase.displacements.samples.find(
    (sample) => sample.station === 2,
  );

  approx(loadCase.reactionByNode["beam-beam-node-1"].uy, 4);
  approx(loadCase.reactionByNode["beam-beam-node-5"].uy, 4);
  approx(loadCase.sectionProperties.flexuralRigidityY, eiY);
  approx(loadCase.sectionProperties.flexuralRigidityZ, eiZ);
  approx(loadCase.sectionProperties.flexuralRigidity, eiVertical);
  approx(midspan.m, 4);
  approx(midspan.mY, 4 * Math.cos(alpha));
  approx(midspan.mZ, 4 * Math.sin(alpha));
  approx(midspanDisplacement.uy, (-5 * 2 * 4 ** 4) / (384 * eiVertical));
  assert.ok(
    result.warnings.some((warning) => warning.includes("2D FEM model")),
  );
  assert.ok(
    loadCase.warnings.some((warning) => warning.includes("2D FEM model")),
  );
  approx(result.envelopes.loadCases.maxAbsBendingMomentY.value, 4 * Math.cos(alpha));
  approx(result.envelopes.loadCases.maxAbsBendingMomentZ.value, 4 * Math.sin(alpha));
});

test("single beam analysis combines G1, G2 and multiple Qk load cases", () => {
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      loads: [
        { id: "g1", actionType: "G1", type: "uniform", value: -2 },
        { id: "g2", actionType: "G2", type: "uniform", value: -1 },
        { id: "live", actionType: "Qk", type: "uniform", value: -3 },
        { id: "snow", actionType: "Qk", type: "uniform", value: -0.5 },
      ],
      combinations: [
        {
          id: "uls-live-leading",
          factors: {
            G1: 1.3,
            G2: 1.5,
            live: 1.5,
            snow: 0,
          },
        },
      ],
    }),
  );
  const combination = result.combinations["uls-live-leading"];

  assert.ok(result.loadCases.G1);
  assert.ok(result.loadCases.G2);
  assert.ok(result.loadCases.live);
  assert.ok(result.loadCases.snow);
  approx(combination.reactionByNode["beam-beam-node-1"].uy, 17.2);
  approx(combination.reactionByNode["beam-beam-node-5"].uy, 17.2);
});

test("single beam analysis returns governing envelopes across combinations", () => {
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      loads: [
        { id: "g1", actionType: "G1", type: "uniform", value: -2 },
        { id: "live", actionType: "Qk", type: "uniform", value: -3 },
        { id: "wind", actionType: "Qk", type: "uniform", value: 1 },
      ],
      combinations: [
        {
          id: "uls-live",
          limitState: "ULS",
          factors: { G1: 1.3, live: 1.5, wind: 0 },
        },
        {
          id: "sle-wind",
          limitState: "SLE",
          factors: { G1: 1, live: 0, wind: 1 },
        },
      ],
    }),
  );

  assert.equal(result.envelopes.combinations.maxAbsBendingMoment.resultId, "uls-live");
  approx(result.envelopes.combinations.maxAbsBendingMoment.value, 14.2);
  assert.equal(result.envelopes.uls.maxAbsBendingMoment.resultId, "uls-live");
  assert.equal(result.envelopes.sle.maxAbsBendingMoment.resultId, "sle-wind");
  assert.equal(result.envelopes.all.maxAbsVerticalDisplacement.resultId, "uls-live");
  assert.equal(result.envelopes.uls.maxAbsVerticalReaction.resultId, "uls-live");
  approx(result.envelopes.uls.maxAbsVerticalReaction.value, 14.2);
  assert.ok(
    ["start-support", "end-support"].includes(
      result.envelopes.uls.maxAbsVerticalReaction.sample.supportId,
    ),
  );
});

test("single beam analysis inserts user discretization stations", () => {
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      discretization: {
        elementCount: 2,
        stations: [1.25],
      },
    }),
  );
  const loadCase = result.loadCases.G1;

  assert.ok(loadCase.displacements.samples.some((sample) => sample.station === 1.25));
  assert.ok(loadCase.internalForces.samples.some((sample) => sample.station === 1.25));
});

test("single beam analysis inserts dedicated verification stations", () => {
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      discretization: {
        elementCount: 2,
      },
      verificationStations: {
        mode: "combined",
        count: 5,
        userStations: [1.25],
      },
    }),
  );
  const loadCase = result.loadCases.G1;

  assert.ok(loadCase.displacements.samples.some((sample) => sample.station === 1));
  assert.ok(loadCase.displacements.samples.some((sample) => sample.station === 3));
  assert.ok(loadCase.internalForces.samples.some((sample) => sample.station === 1.25));
});

test("verification station mode all leaves the FEM mesh unchanged", () => {
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      discretization: {
        elementCount: 2,
      },
      verificationStations: {
        mode: "all",
        count: 5,
      },
    }),
  );
  const loadCase = result.loadCases.G1;

  assert.deepEqual(
    loadCase.displacements.samples.map((sample) => sample.station),
    [0, 2, 4],
  );
});

test("beam section action verifier checks FEM samples through a common contract", () => {
  const analysisResult = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      loads: [{ id: "g1", actionType: "G1", type: "uniform", value: -2 }],
      combinations: [
        {
          id: "uls",
          limitState: "ULS",
          factors: { G1: 1.5 },
        },
      ],
    }),
  );
  const verification = new BeamSectionActionVerifier({
    sectionVerifier: {
      verifySectionActions: ({ vEd, mEd }) => ({
        utilizationRatio: Math.max(Math.abs(mEd) / 5, Math.abs(vEd) / 20),
        checks: [
          {
            id: "bending",
            demand: Math.abs(mEd),
            capacity: 5,
            utilizationRatio: Math.abs(mEd) / 5,
            ok: Math.abs(mEd) <= 5,
          },
          {
            id: "shear",
            demand: Math.abs(vEd),
            capacity: 20,
            utilizationRatio: Math.abs(vEd) / 20,
            ok: Math.abs(vEd) <= 20,
          },
        ],
      }),
    },
    limitStates: "ULS",
  }).verify({ analysisResult });

  assert.equal(verification.status, "not-verified");
  assert.equal(verification.metadata.resultCount, 1);
  assert.ok(verification.outputs.stationResultCount > 0);
  assert.ok(
    verification.checks.some(
      (check) => check.id === "bending" && check.metadata.resultId === "uls",
    ),
  );
  assert.ok(verification.utilizationRatio > 1);
});

test("beam section action verifier can restrict checks to requested stations", () => {
  const analysisResult = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      verificationStations: {
        mode: "combined",
        userStations: [1.25],
      },
      loads: [{ id: "g1", actionType: "G1", type: "uniform", value: -2 }],
      combinations: [
        {
          id: "uls",
          limitState: "ULS",
          factors: { G1: 1.5 },
        },
      ],
    }),
  );
  const verification = new BeamSectionActionVerifier({
    sectionVerifier: {
      verifySectionActions: ({ vEd, mEd }) => ({
        checks: [
          {
            id: "requested-station-check",
            demand: Math.abs(mEd) + Math.abs(vEd),
            capacity: 100,
            utilizationRatio: (Math.abs(mEd) + Math.abs(vEd)) / 100,
            ok: true,
          },
        ],
      }),
    },
    limitStates: "ULS",
    verificationStations: {
      mode: "user",
      userStations: [1.25],
    },
  }).verify({ analysisResult });

  assert.equal(verification.status, "ok");
  assert.ok(verification.outputs.stationResultCount > 0);
  assert.ok(
    verification.checks.every(
      (check) =>
        check.metadata.station === 1.25 &&
        check.metadata.isUserStation === true &&
        check.metadata.stationSource === "user",
    ),
  );
});

test("elastic beam provider evaluates rigid composite section stiffness from component materials", () => {
  const material = createSteelMaterial();
  const lower = new RectangularSection({ width: 100, height: 100, units: sectionUnits });
  const upper = new RectangularSection({ width: 100, height: 100, units: sectionUnits });
  const composite = new CompositeSection({
    name: "rigid-composite",
    units: sectionUnits,
    components: [
      new CompositeSectionComponent({
        name: "Lower",
        section: lower,
        material,
        centroidY: 50,
        role: "lower",
        units: sectionUnits,
      }),
      new CompositeSectionComponent({
        name: "Upper",
        section: upper,
        material,
        centroidY: 150,
        role: "upper",
        units: sectionUnits,
      }),
    ],
  });
  const properties = new ElasticBeamSectionProvider({ section: composite }).getElasticBeamProperties();
  const equivalentInertia = (100 * 200 ** 3) / 12;

  approx(properties.flexuralRigidity, material.elasticModulus * equivalentInertia, 1e-3);
  assert.equal(properties.metadata.source, "composite-section-rigid-collaboration");
});

test("custom section provider can expose gamma-based effective stiffness metadata", () => {
  const provider = createElasticBeamSectionProvider({
    propertyResolver: () => ({
      axialRigidity: 1e8,
      flexuralRigidity: 7e11,
      shearRigidity: 5e7,
      shearCorrectionFactor: 1,
      units: sectionUnits,
      metadata: {
        source: "timber-concrete-gamma-method",
        gamma: 0.42,
      },
    }),
  });
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      sectionProvider: provider,
      section: null,
      material: null,
      analysisModel: "timoshenko",
    }),
  );

  assert.equal(
    result.loadCases.G1.sectionProperties.metadata.source,
    "timber-concrete-gamma-method",
  );
  approx(result.loadCases.G1.sectionProperties.metadata.gamma, 0.42);
  approx(result.loadCases.G1.sectionProperties.flexuralRigidity, 700);
});

test("section provider receives limit state and governing load duration for kmod effects", () => {
  const kmodByDuration = {
    permanent: 0.6,
    medium: 0.8,
    instantaneous: 1.1,
  };
  const provider = createElasticBeamSectionProvider({
    propertyResolver: ({ context }) => {
      const kmod = kmodByDuration[context.governingLoadDurationClass];

      return {
        axialRigidity: 1e8,
        flexuralRigidity: kmod * 1e12,
        units: sectionUnits,
        metadata: {
          limitState: context.limitState,
          kmod,
          governingLoadDurationClass: context.governingLoadDurationClass,
          governingLoadId: context.governingLoad?.id ?? null,
        },
      };
    },
  });
  const result = new SingleBeamAnalysis().analyze(
    createSimpleBeamInput({
      sectionProvider: provider,
      section: null,
      material: null,
      loads: [
        {
          id: "g1",
          actionType: "G1",
          type: "uniform",
          value: -2,
          loadDurationClass: "permanent",
        },
        {
          id: "live",
          actionType: "Qk",
          type: "uniform",
          value: -3,
          loadDurationClass: "medium",
        },
        {
          id: "wind",
          actionType: "Qk",
          type: "uniform",
          value: -1,
          loadDurationClass: "instantaneous",
        },
      ],
      combinations: [
        {
          id: "sle-live",
          limitState: "SLE",
          factors: {
            G1: 1,
            live: 1,
            wind: 0,
          },
        },
        {
          id: "uls-wind",
          limitState: "ULS",
          factors: {
            G1: 1.3,
            live: 0,
            wind: 1.5,
          },
        },
      ],
    }),
  );
  const sle = result.combinations["sle-live"];
  const uls = result.combinations["uls-wind"];

  assert.equal(sle.context.limitState, "SLE");
  assert.equal(sle.context.governingLoadDurationClass, "medium");
  assert.equal(sle.sectionProperties.metadata.governingLoadId, "live");
  approx(sle.sectionProperties.metadata.kmod, 0.8);
  assert.equal(uls.context.limitState, "ULS");
  assert.equal(uls.context.governingLoadDurationClass, "instantaneous");
  assert.equal(uls.sectionProperties.metadata.governingLoadId, "wind");
  approx(uls.sectionProperties.metadata.kmod, 1.1);
});
