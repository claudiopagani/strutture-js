import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_CAPACITY_DESIGN_REFERENCES,
  computeBeamCapacityShear,
  computeColumnCapacityShear,
  computeJointCapacityShear,
  createCapacityDesignAssessment,
  verifyBeamColumnHierarchy,
} from "../src/index.js";

test("capacity-design references are immutable and point to Eqs. 7.4.4-7", () => {
  assert.equal(Object.isFrozen(NTC2018_CAPACITY_DESIGN_REFERENCES), true);
  assert.match(NTC2018_CAPACITY_DESIGN_REFERENCES[0].citation, /7\.4\.4/);
});

test("beam-column hierarchy uses the column-bending gammaRd = 1.30", () => {
  const result = verifyBeamColumnHierarchy({
    beamMomentResistances: [100, -100],
    columnMomentResistances: [200, 220],
    behavior: "cd-a",
  });
  assert.equal(result.gammaRd, 1.3);
  assert.equal(result.demand, 260);
  assert.equal(result.capacity, 420);
  assert.equal(result.ok, true);
});

test("CD B beam-column hierarchy also uses gammaRd = 1.30", () => {
  const result = verifyBeamColumnHierarchy({
    beamMomentResistances: [100],
    columnMomentResistances: [130],
    behavior: "cd-b",
  });
  assert.equal(result.gammaRd, 1.3);
  assert.equal(result.ok, true);
});

test("discordant column moments move the smaller capacity to the beam side", () => {
  const result = verifyBeamColumnHierarchy({
    beamMomentResistances: [100],
    columnMomentResistances: [300, -100],
    behavior: "cd-a",
  });
  assert.equal(result.discordantColumns, true);
  assert.equal(result.transferredColumnMoment, 100);
  assert.equal(result.demand, 230);
  assert.equal(result.capacity, 300);
});

test("top-storey column joints are excluded by § 7.4.4.2.1", () => {
  const result = verifyBeamColumnHierarchy({
    behavior: "cd-a",
    isTopStoreyColumnJoint: true,
  });
  assert.equal(result.applicable, false);
  assert.equal(result.ok, true);
});

test("beam shear uses signed end capacities and both gravity end shears", () => {
  const result = computeBeamCapacityShear({
    momentResistanceLeft: -100,
    momentResistanceRight: 80,
    clearLength: 4,
    gravityShearLeft: 20,
    gravityShearRight: -20,
    behavior: "cd-a",
  });
  assert.ok(Math.abs(result.shearFromEndMoments - 54) < 1e-12);
  assert.ok(Math.abs(result.shearDemandLeft - 74) < 1e-12);
  assert.ok(Math.abs(result.shearDemandRight - 34) < 1e-12);
  assert.equal(result.shearDemand, 74);
  assert.match(result.reference, /7\.4\.4\.1\.1/);
});

test("beam shear rejects hidden zero gravity defaults", () => {
  assert.throws(
    () => computeBeamCapacityShear({
      momentResistanceLeft: -100,
      momentResistanceRight: 80,
      clearLength: 4,
      behavior: "cd-a",
    }),
    /gravityShearLeft/,
  );
});

test("column shear applies Eq. 7.4.5 end hierarchy factors before gammaRd", () => {
  const result = computeColumnCapacityShear({
    top: {
      columnMomentResistance: 200,
      beamMomentResistanceSum: 300,
      columnMomentResistanceSum: 400,
    },
    bottom: {
      columnMomentResistance: 250,
      beamMomentResistanceSum: 500,
      columnMomentResistanceSum: 400,
    },
    clearLength: 4,
    behavior: "cd-a",
  });
  assert.equal(result.designMomentTop, 150);
  assert.equal(result.designMomentBottom, 250);
  assert.equal(result.gammaRd, 1.3);
  assert.equal(result.shearDemand, 130);
  assert.match(result.reference, /7\.4\.5/);
});

test("joint shear demand implements internal and external equations", () => {
  const internal = computeJointCapacityShear({
    behavior: "cd-a",
    topReinforcementArea: 10,
    bottomReinforcementArea: 8,
    reinforcementDesignStrength: 400,
    columnShearAbove: 1000,
    jointType: "internal",
  });
  const external = computeJointCapacityShear({
    behavior: "cd-a",
    topReinforcementArea: 10,
    bottomReinforcementArea: 8,
    reinforcementDesignStrength: 400,
    columnShearAbove: 1000,
    jointType: "external",
  });
  assert.equal(internal.shearDemand, Math.abs(1.2 * 18 * 400 - 1000));
  assert.equal(external.shearDemand, Math.abs(1.2 * 10 * 400 - 1000));
  assert.match(internal.reference, /7\.4\.7/);
  assert.match(external.reference, /7\.4\.6/);
});

test("non-dissipative RC joints use the CD B joint rule required by § 7.4.1", () => {
  const result = computeJointCapacityShear({
    behavior: "non-dissipative",
    topReinforcementArea: 10,
    bottomReinforcementArea: 0,
    reinforcementDesignStrength: 400,
    columnShearAbove: 0,
    jointType: "external",
  });
  assert.equal(result.gammaRd, 1.1);
});

test("an empty dissipative assessment is explicitly not implemented", () => {
  const result = createCapacityDesignAssessment({
    jointId: "J1",
    behavior: "cd-a",
  });
  assert.equal(result.complete, false);
  assert.equal(result.status, "not-implemented");
  assert.equal(result.allChecksOk, false);
});

test("assessment compares complete shear demands with supplied local capacities", () => {
  const result = createCapacityDesignAssessment({
    jointId: "J1",
    behavior: "cd-a",
    hierarchy: {
      beamMomentResistances: [100],
      columnMomentResistances: [200],
    },
    beamShear: {
      momentResistanceLeft: -100,
      momentResistanceRight: 80,
      clearLength: 4,
      gravityShearLeft: 20,
      gravityShearRight: -20,
      shearResistance: 80,
    },
  });
  assert.equal(result.complete, true);
  assert.equal(result.status, "ok");
  assert.equal(result.allChecksOk, true);
});
