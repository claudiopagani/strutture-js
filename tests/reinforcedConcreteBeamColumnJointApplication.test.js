import test from "node:test";
import assert from "node:assert/strict";

import {
  ReinforcedConcreteBeamColumnJointApplication,
  ReinforcedConcreteBeamColumnJointModel,
  calculateNTC2018EffectiveJointWidth,
  calculateNTC2018JointCompressionCapacity,
  calculateNTC2018JointShearDemand,
  calculateNTC2018JointTensionReinforcement,
  classifyNTC2018JointConfinement,
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
    id: "joint-01-x-positive",
    directionId: "x-positive",
    jointType: "internal",
    ductilityClass: "CDB",
    tensionMethod: "diagonal-tension",
    geometry: {
      columnWidth: 400,
      columnDepth: 400,
      beamWidth: 300,
      beamHeight: 500,
      columnLongitudinalLayerDistance: 320,
      beamLongitudinalLayerDistance: 420,
    },
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    actions: {
      columnAxialForce: 200000,
      columnShearAbove: 50000,
    },
    beamReinforcement: {
      topArea: 500,
      bottomArea: 500,
    },
    jointHoops: {
      diameter: 8,
      totalArea: 1000,
      areaPerSet: 220,
      spacing: 100,
    },
    confinement: {
      faceCoverageRatios: {
        positiveX: 1,
        negativeX: 1,
        positiveZ: 0,
        negativeZ: 0,
      },
      oppositeBeamOverlapRatios: { x: 1, z: 0 },
      adjacentColumnHoops: {
        controllingAreaPerSet: 200,
        controllingSpacing: 100,
      },
    },
    capacityHierarchy: {
      beamMomentResistanceSum: 200e6,
      effectiveColumnMomentResistance: 250e6,
      preReducedForMomentSigns: true,
    },
    units,
  };

  return new ReinforcedConcreteBeamColumnJointModel({
    ...source,
    ...overrides,
    geometry: { ...source.geometry, ...(overrides.geometry ?? {}) },
    materials: { ...source.materials, ...(overrides.materials ?? {}) },
    actions: { ...source.actions, ...(overrides.actions ?? {}) },
    beamReinforcement: {
      ...source.beamReinforcement,
      ...(overrides.beamReinforcement ?? {}),
    },
    jointHoops: { ...source.jointHoops, ...(overrides.jointHoops ?? {}) },
    confinement: { ...source.confinement, ...(overrides.confinement ?? {}) },
    capacityHierarchy: {
      ...source.capacityHierarchy,
      ...(overrides.capacityHierarchy ?? {}),
    },
  });
}

test("NTC joint helpers reproduce independent internal-joint arithmetic", () => {
  const width = calculateNTC2018EffectiveJointWidth({
    columnWidth: 350,
    beamWidth: 300,
    columnDepth: 350,
  });
  const demand = calculateNTC2018JointShearDemand({
    jointType: "internal",
    gammaRd: 1.2,
    topReinforcementArea: 509,
    bottomReinforcementArea: 509,
    reinforcementDesignStrength: 391.3,
    columnShearAbove: 8380,
  });
  const compression = calculateNTC2018JointCompressionCapacity({
    jointType: "internal",
    fck: 29.05,
    fcd: 16.46,
    normalizedAxialForce: 0.044,
    effectiveJointWidth: width,
    columnLongitudinalLayerDistance: 262,
  });
  const tension = calculateNTC2018JointTensionReinforcement({
    method: "diagonal-tension",
    jointType: "internal",
    jointShearDemand: demand.demand,
    effectiveJointWidth: width,
    columnLongitudinalLayerDistance: 262,
    beamLongitudinalLayerDistance: 266,
    normalizedAxialForce: 0.044,
    fcd: 16.46,
    fctd: 1.32,
    gammaRd: 1.2,
    topReinforcementArea: 509,
    bottomReinforcementArea: 509,
    reinforcementDesignStrength: 391.3,
  });

  assert.equal(width, 350);
  assert.ok(Math.abs(demand.demand - 469632.08) < 0.01);
  assert.ok(Math.abs(compression.capacity - 766470) < 2);
  assert.ok(Math.abs(tension.requiredConfiningStress - 11.51) < 0.02);
  assert.ok(Math.abs(tension.requiredHorizontalTieForce - 1071600) < 3000);
});

test("NTC joint helpers cover external demand, compression and post-cracking truss", () => {
  const demand = calculateNTC2018JointShearDemand({
    jointType: "external",
    gammaRd: 1.2,
    topReinforcementArea: 400,
    bottomReinforcementArea: 300,
    reinforcementDesignStrength: 400,
    columnShearAbove: 20000,
  });
  const compression = calculateNTC2018JointCompressionCapacity({
    jointType: "external",
    fck: 25,
    fcd: 14.167,
    normalizedAxialForce: 0.1,
    effectiveJointWidth: 300,
    columnLongitudinalLayerDistance: 320,
  });
  const tension = calculateNTC2018JointTensionReinforcement({
    method: "post-cracking-truss",
    jointType: "external",
    jointShearDemand: demand.demand,
    effectiveJointWidth: 300,
    columnLongitudinalLayerDistance: 320,
    beamLongitudinalLayerDistance: 420,
    normalizedAxialForce: 0.1,
    fcd: 14.167,
    fctd: 1.2,
    gammaRd: 1.2,
    topReinforcementArea: 400,
    bottomReinforcementArea: 300,
    reinforcementDesignStrength: 400,
  });

  assert.equal(demand.beamForce, 192000);
  assert.equal(demand.demand, 172000);
  assert.ok(Math.abs(compression.eta - 0.432) < 1e-12);
  assert.ok(Math.abs(compression.capacity - 515062.6313) < 0.001);
  assert.equal(tension.reinforcementArea, 300);
  assert.ok(Math.abs(tension.requiredHorizontalTieForce - 132480) < 1e-9);
  assert.equal(tension.equation, "NTC2018-7.4.12");
});

test("RC beam-column joint application verifies the supported local state", () => {
  const result = new ReinforcedConcreteBeamColumnJointApplication().run({
    model: createModel(),
  });

  assert.equal(result.applicationId, "reinforced-concrete-beam-column-joints");
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.materials.fctdSource, "0.7-fctm/gammaC");
  assert.ok(result.outputs.materials.fctd > 1.19);
  assert.equal(result.outputs.confinement.classification, "not-fully-confined");
  assert.ok(result.checks.some(
    (check) => check.id === "rc-joint-diagonal-compression",
  ));
  assert.ok(result.checks.some(
    (check) => check.id === "rc-joint-strong-column-weak-beam",
  ));
});

test("fully confined classification permits doubled spacing up to 150 mm", () => {
  const result = new ReinforcedConcreteBeamColumnJointApplication().run({
    model: createModel({
      confinement: {
        faceCoverageRatios: {
          positiveX: 0.75,
          negativeX: 0.8,
          positiveZ: 0.9,
          negativeZ: 1,
        },
        oppositeBeamOverlapRatios: { x: 0.75, z: 0.8 },
        adjacentColumnHoops: {
          controllingAreaPerSet: 200,
          controllingSpacing: 80,
        },
      },
      jointHoops: { spacing: 150 },
    }),
  });

  assert.equal(result.outputs.confinement.fullyConfined, true);
  assert.equal(result.outputs.confinement.allowedJointHoopSpacing, 150);
  assert.equal(
    result.checks.find((check) => check.id === "rc-joint-hoop-spacing").ok,
    true,
  );
});

test("joint application rejects an insufficient hierarchy capacity", () => {
  const result = new ReinforcedConcreteBeamColumnJointApplication().run({
    model: createModel({
      capacityHierarchy: {
        effectiveColumnMomentResistance: 150e6,
      },
    }),
  });

  assert.equal(result.status, "not-verified");
  assert.equal(
    result.checks.find(
      (check) => check.id === "rc-joint-strong-column-weak-beam",
    ).ok,
    false,
  );
});

test("joint model requires capacity sums already resolved for member signs", () => {
  assert.throws(
    () => createModel({
      capacityHierarchy: { preReducedForMomentSigns: false },
    }),
    /does not infer member moment signs/,
  );
});

test("joint confinement classifier requires all four faces and both overlaps", () => {
  assert.throws(
    () => classifyNTC2018JointConfinement({
      faceCoverageRatios: { positiveX: 1 },
      oppositeBeamOverlapRatios: { x: 1 },
    }),
    /requires all face and overlap ratios/,
  );
});
