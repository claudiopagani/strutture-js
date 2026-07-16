import test from "node:test";
import assert from "node:assert/strict";

import { ElasticBeamSectionProvider } from "../src/domain/beams/ElasticBeamSectionProvider.js";
import { FoundationBeamAnalysis } from "../src/domain/foundations/FoundationBeamAnalysis.js";

const units = { force: "kN", length: "m" };

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function input(overrides = {}) {
  return {
    id: "foundation-beam",
    units,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    },
    sectionProvider: new ElasticBeamSectionProvider({
      units,
      propertyResolver: () => ({
        axialRigidity: 1e7,
        flexuralRigidity: 2e4,
        units,
      }),
    }),
    foundation: {
      contactWidth: 1,
      subgradeModulus: 10000,
    },
    loads: [{
      id: "g1",
      actionType: "G1",
      type: "uniform",
      value: -10,
    }],
    combinations: false,
    discretization: { elementCount: 100 },
    ...overrides,
  };
}

test("foundation beam reproduces uniform Winkler compression and vertical equilibrium", () => {
  const result = new FoundationBeamAnalysis().analyze(input());
  const loadCase = result.loadCases.G1;

  approx(loadCase.foundation.totalReaction, 100, 1e-7);
  approx(loadCase.foundation.minPressure.pressure, 10, 0.006);
  approx(loadCase.foundation.maxPressure.pressure, 10, 0.002);
  approx(loadCase.displacements.maxAbsVerticalDisplacement.uy, -0.001, 2e-7);
  assert.equal(loadCase.foundation.contactAssumptionViolated, false);
  assert.ok(Math.abs(loadCase.internalForces.maxAbsBendingMoment.m) < 0.013);
});

test("uniform imposed soil settlement is a rigid translation without soil reaction", () => {
  const result = new FoundationBeamAnalysis().analyze(input({
    loads: [{
      id: "settlement",
      actionType: "SETTLEMENT",
      type: "soil-settlement",
      value: -0.02,
    }],
  }));
  const loadCase = result.loadCases.settlement;

  approx(loadCase.displacements.samples[0].uy, -0.02, 1e-10);
  approx(loadCase.displacements.samples.at(-1).uy, -0.02, 1e-10);
  approx(loadCase.foundation.totalReaction, 0, 1e-7);
  assert.ok(Math.abs(loadCase.internalForces.maxAbsBendingMoment.m) < 1e-7);
});

test("foundation model validates complete non-overlapping soil coverage", () => {
  assert.throws(
    () => new FoundationBeamAnalysis().analyze(input({
      foundation: {
        contactWidth: 1,
        segments: [{ from: 0, to: 4, subgradeModulus: 10000 }],
      },
    })),
    /cover the complete beam span/,
  );
});
