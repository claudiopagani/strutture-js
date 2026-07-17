import test from "node:test";
import assert from "node:assert/strict";

import {
  RectangularSection,
  ReinforcedConcreteFoundationBeamApplication,
  ReinforcedConcreteFoundationBeamModel,
  ReinforcedConcreteSection,
  ReinforcementBar,
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
  const concreteSection = new RectangularSection({
    width: 400,
    height: 600,
    units,
  });
  const section = new ReinforcedConcreteSection({
    id: "foundation-beam-section",
    concreteSection,
    concreteMaterial,
    reinforcementMaterial,
    reinforcementBars: [
      [50, 50], [50, 350], [550, 50], [550, 350],
    ].map(([y, z], index) => new ReinforcementBar({
      id: `bar-${index + 1}`,
      diameter: 20,
      y,
      z,
      material: reinforcementMaterial,
      units,
    })),
    units,
  });
  const source = {
    id: "rc-foundation-beam",
    units,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 6000, y: 0 },
    },
    section,
    concreteMaterial,
    reinforcementMaterial,
    foundation: {
      contactWidth: 400,
      subgradeModulus: 0.02,
    },
    loads: [{
      id: "g1",
      actionType: "G1",
      type: "uniform",
      value: -10,
    }],
    combinations: [{
      id: "uls",
      limitState: "ULS",
      factors: { G1: 1.3 },
    }],
    discretization: { elementCount: 20 },
    verification: {
      serviceability: false,
      verificationStations: { mode: "all" },
    },
  };

  return new ReinforcedConcreteFoundationBeamModel({
    ...source,
    ...overrides,
    foundation: { ...source.foundation, ...(overrides.foundation ?? {}) },
    verification: { ...source.verification, ...(overrides.verification ?? {}) },
  });
}

test("RC foundation-beam application analyzes soil response and reuses section checks", () => {
  const result = new ReinforcedConcreteFoundationBeamApplication().run({
    model: createModel(),
  });
  const combination = result.outputs.analysis.combinations.uls;

  assert.equal(result.applicationId, "reinforced-concrete-foundation-beams");
  assert.equal(result.status, "ok");
  assert.equal(combination.foundation.contactAssumptionViolated, false);
  assert.ok(Math.abs(combination.foundation.totalReaction - 78000) < 1e-4);
  assert.ok(result.outputs.verification.outputs.stationResultCount > 0);
  assert.ok(result.checks.length > 0);
  assert.equal(
    result.utilizationRatio,
    result.outputs.verification.utilizationRatio,
  );
  assert.equal(result.demand, result.outputs.verification.demand);
  assert.equal(result.capacity, result.outputs.verification.capacity);
  assert.equal(combination.foundationIteration.contactModel, "compression-only");
  assert.equal(combination.foundationIteration.stiffnessIteration, true);
  assert.equal(combination.foundationIteration.converged, true);
  assert.ok(combination.foundationIteration.iterations >= 1);
});

test("RC foundation-beam application guards tensile Winkler reactions", () => {
  const result = new ReinforcedConcreteFoundationBeamApplication().run({
    model: createModel({
      loads: [{
        id: "uplift",
        actionType: "Qk",
        type: "point",
        position: 3000,
        value: 100000,
      }],
      combinations: [{
        id: "uls-uplift",
        limitState: "ULS",
        factors: { uplift: 1 },
      }],
    }),
  });

  assert.equal(result.status, "not-supported");
  assert.equal(
    result.outputs.analysis.combinations["uls-uplift"].foundation
      .contactAssumptionViolated,
    false,
  );
  assert.equal(
    result.outputs.analysis.combinations["uls-uplift"].foundationIteration
      .converged,
    false,
  );
});
