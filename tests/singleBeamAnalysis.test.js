import test from "node:test";
import assert from "node:assert/strict";

import {
  CompositeSection,
  CompositeSectionComponent,
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
