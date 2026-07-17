import test from "node:test";
import assert from "node:assert/strict";

import {
  ReinforcedConcreteIsolatedFootingApplication,
  ReinforcedConcreteIsolatedFootingModel,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

function createModel(overrides = {}) {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const source = {
    id: "isolated-footing-test",
    geometry: { widthX: 2000, widthY: 2000, thickness: 800 },
    column: { widthX: 500, widthY: 500 },
    actions: {
      columnVerticalForce: 5_672_180,
      uniformDownwardPressure: 0.027,
      horizontalX: 0,
      horizontalY: 0,
      momentX: 0,
      momentY: 0,
    },
    soil: {
      designBearingResistance: 2,
      bearingResistanceSource: "assigned-test-value",
    },
    materials: { concreteMaterial, reinforcementMaterial },
    reinforcement: {
      bottom: {
        x: { diameter: 16, spacing: 100, clearCover: 40 },
        y: { diameter: 16, spacing: 100, clearCover: 40, layerOffset: 16 },
      },
    },
    units,
  };

  return new ReinforcedConcreteIsolatedFootingModel({
    ...source,
    ...overrides,
    actions: { ...source.actions, ...(overrides.actions ?? {}) },
    soil: { ...source.soil, ...(overrides.soil ?? {}) },
  });
}

test("isolated footing application verifies centered full-contact structural strips", () => {
  const result = new ReinforcedConcreteIsolatedFootingApplication().run({
    model: createModel(),
  });

  assert.equal(result.applicationId, "reinforced-concrete-isolated-footings");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.contact.contactType, "full");
  assert.equal(result.outputs.contact.maximumPressure, 1.445045);
  assert.ok(result.checks.some((check) => check.id === "rc-footing-bending-x"));
  assert.ok(
    result.checks.some((check) => check.id === "rc-footing-one-way-shear-y"),
  );
  assert.equal(result.outputs.punching.basicPerimeterInsideFooting, false);
});

test("isolated footing application carries uniaxial contact loss into structural checks", () => {
  const result = new ReinforcedConcreteIsolatedFootingApplication().run({
    model: createModel({ actions: { momentY: 2_000_000_000 } }),
  });

  assert.notEqual(result.status, "not-supported");
  assert.equal(result.outputs.contact.contactType, "partial-uniaxial");
  assert.equal(result.outputs.contact.minimumPressure, 0);
  assert.ok(result.checks.some((check) => check.id === "rc-footing-bending-x"));
});

test("isolated footing solves biaxial partial contact, crushing and anchorages", () => {
  const result = new ReinforcedConcreteIsolatedFootingApplication().run({
    model: createModel({
      actions: {
        columnVerticalForce: 2_000_000,
        momentX: 650_000_000,
        momentY: 650_000_000,
      },
      localBearing: { distributionArea: 1_000_000 },
      anchorage: {
        columnBars: { diameter: 20, availableLength: 1200 },
        footingBars: {
          x: { diameter: 16, availableLength: 1000 },
          y: { diameter: 16, availableLength: 1000 },
        },
      },
    }),
  });

  assert.notEqual(result.status, "not-supported");
  assert.equal(result.outputs.contact.contactType, "partial-biaxial");
  assert.ok(
    result.outputs.contact.partialContact.equilibriumResidualNorm < 1e-6,
  );
  assert.equal(result.outputs.anchorage.checkedCount, 3);
  assert.ok(
    result.checks.some(
      (check) => check.id === "rc-footing-column-interface-crushing",
    ),
  );
  assert.ok(
    result.checks.some(
      (check) => check.id === "rc-footing-anchorage-column-bars",
    ),
  );
});

test("isolated footing application requires assigned sliding resistance for horizontal action", () => {
  const result = new ReinforcedConcreteIsolatedFootingApplication().run({
    model: createModel({ actions: { horizontalX: 100_000 } }),
  });

  assert.equal(result.status, "not-supported");
  assert.match(result.summary, /sliding resistance/i);
});

test("isolated footing application feeds the enclosed soil reaction to punching verification", () => {
  const result = new ReinforcedConcreteIsolatedFootingApplication().run({
    model: createModel({
      geometry: { widthX: 4000, widthY: 4000, thickness: 500 },
      column: { widthX: 500, widthY: 500 },
      actions: {
        columnVerticalForce: 2_000_000,
        uniformDownwardPressure: 0,
      },
      soil: { designBearingResistance: 1 },
      punching: {
        code: {
          id: "EN1992_1_1_2004_A1_2014",
          parameterProfile: "EN_RECOMMENDED",
        },
      },
    }),
  });

  assert.equal(result.outputs.punching.basicPerimeterInsideFooting, true);
  assert.ok(result.outputs.punching.punchingForce > 0);
  assert.ok(
    result.checks.some((check) => check.id.includes("punching")),
  );
  assert.notEqual(result.status, "not-supported");
});
