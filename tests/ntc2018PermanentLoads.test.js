import test from "node:test";
import assert from "node:assert/strict";

import {
  CalculationResult,
  NTC2018_UNIT_WEIGHT_CATALOG,
  calculateNTC2018AreaSelfWeight,
  calculateNTC2018EquivalentPartitionAreaLoad,
  calculateNTC2018LineSelfWeight,
  calculateNTC2018PermanentAreaLoads,
  calculateNTC2018SelfWeight,
  getNTC2018UnitWeightDefinition,
  listNTC2018UnitWeightDefinitions,
  resolveNTC2018UnitWeight,
} from "../src/index.js";

const units = { force: "kN", length: "m" };

test("NTC 2018 unit-weight catalog separates fixed values from explicit ranges", () => {
  assert.equal(Object.isFrozen(NTC2018_UNIT_WEIGHT_CATALOG), true);
  assert.equal(Object.isFrozen(NTC2018_UNIT_WEIGHT_CATALOG[0]), true);

  assert.deepEqual(resolveNTC2018UnitWeight({ materialId: "steel" }), {
    id: "steel",
    category: "metals",
    description: "Acciaio",
    kind: "fixed",
    value: 78.5,
    unit: "kN/m^3",
    reference: "D.M. 17/01/2018, NTC 2018, section 3.1.2, Table 3.1.I",
    selectedValue: 78.5,
    selection: "tabulated-fixed",
  });

  const lightweight = resolveNTC2018UnitWeight({
    materialId: "lightweight-concrete",
    value: 18,
  });
  assert.equal(lightweight.selectedValue, 18);
  assert.equal(lightweight.selection, "explicit-within-tabulated-range");
  assert.throws(
    () => resolveNTC2018UnitWeight({ materialId: "lightweight-concrete", value: 21 }),
    /between 14 and 20/,
  );
  assert.throws(
    () => resolveNTC2018UnitWeight({ materialId: "steel", value: 78.5 }),
    /fixed NTC 2018 unit weight/,
  );

  const metals = listNTC2018UnitWeightDefinitions({ category: "metals" });
  assert.deepEqual(metals.map(({ id }) => id), ["steel", "cast-iron", "aluminium"]);
  metals[0].value = 0;
  assert.equal(getNTC2018UnitWeightDefinition("steel").value, 78.5);
});

test("NTC 2018 self-weight primitives normalize explicit units", () => {
  const slab = calculateNTC2018AreaSelfWeight({
    unitWeight: 2.5e-5,
    thickness: 200,
    units: { force: "N", length: "mm" },
  });
  const steelMember = calculateNTC2018LineSelfWeight({
    unitWeight: 78.5,
    crossSectionArea: 0.01,
    units,
  });
  const concreteBlock = calculateNTC2018SelfWeight({
    unitWeight: 24,
    volume: 0.75,
    units,
  });

  assert.equal(slab.value, 5);
  assert.deepEqual(slab.operands, { unitWeight: 25, thickness: 0.2 });
  assert.deepEqual(slab.units, units);
  assert.equal(steelMember.value, 0.785);
  assert.equal(steelMember.quantity, "line-load");
  assert.equal(concreteBlock.value, 18);
  assert.equal(concreteBlock.quantity, "force");
  assert.throws(
    () => calculateNTC2018AreaSelfWeight({ unitWeight: 25, thickness: 0.2 }),
    /requires explicit units/,
  );
});

test("NTC 2018 equivalent partition loads follow section 3.1.3 thresholds", () => {
  const expected = [
    [1, 0.4],
    [1.01, 0.8],
    [2, 0.8],
    [2.01, 1.2],
    [3, 1.2],
    [3.01, 1.6],
    [4, 1.6],
    [4.01, 2.0],
    [5, 2.0],
  ];

  for (const [partitionLineLoad, areaLoad] of expected) {
    const result = calculateNTC2018EquivalentPartitionAreaLoad({
      partitionLineLoad,
      units,
    });
    assert.equal(result.equivalentUniformLoadApplicable, true);
    assert.equal(result.areaLoad, areaLoad);
    assert.equal(result.requiresActualPositioning, false);
  }

  const heavyPartition = calculateNTC2018EquivalentPartitionAreaLoad({
    partitionLineLoad: 5.01,
    units,
  });
  assert.equal(heavyPartition.equivalentUniformLoadApplicable, false);
  assert.equal(heavyPartition.areaLoad, null);
  assert.equal(heavyPartition.requiresActualPositioning, true);
});

test("NTC 2018 permanent area-load workflow preserves operands, actions and totals", () => {
  const result = calculateNTC2018PermanentAreaLoads({
    units,
    items: [
      {
        id: "structural-slab",
        description: "Soletta in calcestruzzo armato",
        model: "layer",
        permanentClass: "G1",
        unitWeight: 25,
        thickness: 0.2,
      },
      {
        id: "finishes",
        model: "surface",
        permanentClass: "G2",
        areaLoad: 1.5,
      },
      {
        id: "suspended-services",
        model: "repeated-line",
        permanentClass: "G2",
        effect: "favourable",
        lineLoad: 0.2,
        spacing: 0.5,
      },
      {
        id: "steel-joists",
        model: "repeated-section",
        permanentClass: "G1",
        unitWeight: 78.5,
        crossSectionArea: 0.001,
        spacing: 0.5,
      },
      {
        id: "distributed-wall",
        model: "distributed-wall",
        permanentClass: "G2",
        unitWeight: 8,
        height: 3,
        thickness: 0.1,
        spacing: 4,
      },
    ],
  });

  assert.equal(result instanceof CalculationResult, true);
  assert.equal(result.status, "ok");
  assert.equal(result.outputs.schemaVersion, "ntc2018-permanent-area-loads/v1");
  assert.deepEqual(result.outputs.units, units);
  assert.equal(result.outputs.items[0].value, 5);
  assert.equal(result.outputs.items[3].value, 0.157);
  assert.equal(Number(result.outputs.items[4].value.toFixed(6)), 0.6);
  assert.equal(result.outputs.loads[0].actionId, "NTC2018-G1");
  assert.deepEqual(result.outputs.actions.map(({ permanentClass }) => permanentClass), ["G1", "G2"]);
  assert.deepEqual(result.outputs.totals, {
    G1: 5.157,
    G2: 2.5,
    total: 7.657,
    byClassAndEffect: {
      G1: { favourable: 0, unfavourable: 5.157 },
      G2: { favourable: 0.4, unfavourable: 2.1 },
    },
  });
  assert.equal(result.outputs.loads[0].metadata.formula, "areaLoad = unitWeight * thickness");
  assert.deepEqual(result.metadata.sourceUnitSystem, units);
});

test("NTC 2018 permanent area-load workflow rejects ambiguous contracts", () => {
  assert.throws(
    () => calculateNTC2018PermanentAreaLoads({
      units,
      items: [
        { id: "duplicate", model: "surface", permanentClass: "G1", areaLoad: 1 },
        { id: "duplicate", model: "surface", permanentClass: "G2", areaLoad: 1 },
      ],
    }),
    /ids must be unique/,
  );
  assert.throws(
    () => calculateNTC2018PermanentAreaLoads({
      units,
      items: [{ id: "missing-class", model: "surface", areaLoad: 1 }],
    }),
    /permanentClass must be G1 or G2/,
  );
  assert.throws(
    () => calculateNTC2018PermanentAreaLoads({
      units,
      items: [{ id: "zero-spacing", model: "repeated-line", permanentClass: "G1", lineLoad: 1, spacing: 0 }],
    }),
    /spacing must be a finite positive number/,
  );
});
