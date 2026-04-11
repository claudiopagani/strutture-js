import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  SingleBeamAnalysis,
  SteelMaterial,
  createElasticBeamSectionProvider,
  createNTC2018BeamCombinations,
  createNTC2018PermanentAction,
  createNTC2018SnowAction,
  createNTC2018VariableAction,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const sectionUnits = { force: "N", length: "mm" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createBeamLoads() {
  return [
    {
      id: "g1",
      loadCaseId: "G1",
      value: -2,
      action: createNTC2018PermanentAction({
        id: "ACT-G1",
        permanentClass: "G1",
      }),
    },
    {
      id: "g2",
      loadCaseId: "G2",
      value: -1,
      action: createNTC2018PermanentAction({
        id: "ACT-G2",
        permanentClass: "G2",
      }),
    },
    {
      id: "live",
      loadCaseId: "LIVE",
      value: -3,
      action: createNTC2018VariableAction({
        id: "ACT-LIVE",
        category: "B",
      }),
    },
    {
      id: "snow",
      loadCaseId: "SNOW",
      value: -0.5,
      action: createNTC2018SnowAction({
        id: "ACT-SNOW",
      }),
    },
  ];
}

test("ntc2018 beam adapter generates annotated ULS and SLE combinations", () => {
  const combinations = createNTC2018BeamCombinations({
    loads: createBeamLoads(),
    idPrefix: "beam-01",
  });

  assert.equal(combinations.length, 7);

  const ulsLive = combinations.find((combination) => combination.id === "beam-01-ULS-LIVE");
  const sleRareSnow = combinations.find(
    (combination) => combination.id === "beam-01-SLE_RARE-SNOW",
  );
  const sleQuasi = combinations.find(
    (combination) => combination.id === "beam-01-SLE_QUASI_PERMANENT-all",
  );

  assert.equal(ulsLive.limitState, "ULS");
  assert.equal(ulsLive.combinationType, "ULS_STR_GEO");
  approx(ulsLive.factors.G1, 1.3);
  approx(ulsLive.factors.G2, 1.5);
  approx(ulsLive.factors.LIVE, 1.5);
  approx(ulsLive.factors.SNOW, 0.75);
  assert.equal(ulsLive.metadata.leadingLoadCaseId, "LIVE");
  assert.equal(ulsLive.metadata.leadingVariableCategory, "B");
  assert.deepEqual(ulsLive.metadata.accompanyingLoadCaseIds, ["SNOW"]);
  assert.equal(ulsLive.metadata.loadDurations.LIVE, "medium");
  assert.equal(ulsLive.metadata.loadDurations.SNOW, "short");

  assert.equal(sleRareSnow.limitState, "SLE");
  assert.equal(sleRareSnow.metadata.serviceCombination, "rare");
  approx(sleRareSnow.factors.G1, 1);
  approx(sleRareSnow.factors.G2, 1);
  approx(sleRareSnow.factors.LIVE, 0.7);
  approx(sleRareSnow.factors.SNOW, 1);

  assert.equal(sleQuasi.metadata.leadingLoadCaseId, null);
  approx(sleQuasi.factors.LIVE, 0.3);
  approx(sleQuasi.factors.SNOW, 0);
});

test("ntc2018 beam combinations feed SingleBeamAnalysis context for providers", () => {
  const loads = createBeamLoads();
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["ULS", "SLE_FREQUENT"],
    idPrefix: "beam-ctx",
  });
  const section = new RectangularSection({
    width: 100,
    height: 200,
    units: sectionUnits,
  });
  const material = new SteelMaterial({
    name: "S275",
    grade: "S275",
    elasticModulus: 210000,
    shearModulus: 80769.23076923077,
    fyk: 275,
    units: sectionUnits,
  });
  const provider = createElasticBeamSectionProvider({
    propertyResolver: ({ context }) => ({
      axialRigidity: material.elasticModulus * section.area,
      flexuralRigidity: material.elasticModulus * section.inertiaY,
      units: sectionUnits,
      metadata: {
        limitState: context.limitState,
        serviceCombination: context.serviceCombination ?? null,
        leadingLoadCaseId: context.leadingLoadCaseId ?? null,
        governingLoadDurationClass: context.governingLoadDurationClass,
      },
    }),
  });
  const result = new SingleBeamAnalysis().analyze({
    id: "beam-ctx",
    units,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
    },
    sectionProvider: provider,
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
  const ulsSnow = result.combinations["beam-ctx-ULS-SNOW"];
  const frequentLive = result.combinations["beam-ctx-SLE_FREQUENT-LIVE"];

  assert.equal(ulsSnow.context.limitState, "ULS");
  assert.equal(ulsSnow.context.leadingLoadCaseId, "SNOW");
  assert.equal(ulsSnow.sectionProperties.metadata.limitState, "ULS");
  assert.equal(ulsSnow.sectionProperties.metadata.leadingLoadCaseId, "SNOW");
  assert.equal(ulsSnow.context.governingLoadDurationClass, "short");
  assert.equal(frequentLive.context.limitState, "SLE");
  assert.equal(frequentLive.sectionProperties.metadata.serviceCombination, "frequent");
  assert.equal(frequentLive.sectionProperties.metadata.leadingLoadCaseId, "LIVE");
  assert.equal(frequentLive.context.governingLoadDurationClass, "medium");
});
