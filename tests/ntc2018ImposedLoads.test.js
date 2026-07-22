import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_IMPOSED_LOAD_CATALOG,
  SLAB_MATERIAL_WEIGHT_PRESET_METADATA,
  calculateNTC2018ImposedLoadAreaReduction,
  calculateNTC2018ImposedLoadMultiStoreyReduction,
  createNTC2018SlabVariableLoad,
  getNTC2018ImposedLoadDefinition,
  getNTC2018SlabVariableAction,
  resolveNTC2018ImposedLoadDefinition,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const documentation = { reference: "Project load specification LOAD-001" };

test("NTC 2018 imposed-load catalog exposes qk, Qk, Hk and local application rules", () => {
  assert.equal(NTC2018_IMPOSED_LOAD_CATALOG.length, 21);

  const office = resolveNTC2018ImposedLoadDefinition({
    definitionId: "B2-public-offices",
    units,
  });
  const lightVehicles = getNTC2018ImposedLoadDefinition("F-light-vehicles");

  assert.equal(office.status, "ok");
  assert.equal(office.qk, 3);
  assert.equal(office.Qk, 2);
  assert.equal(office.Hk, 1);
  assert.equal(office.application.Qk.footprint.sideM, 0.05);
  assert.equal(office.application.Qk.simultaneousWithGlobalDistributedLoad, false);
  assert.equal(lightVehicles.loads.Qk.value, 10);
  assert.equal(lightVehicles.loads.Qk.count, 2);
  assert.equal(lightVehicles.application.Qk.count, 2);
  assert.equal(lightVehicles.application.Qk.footprint.sideM, 0.1);
  assert.equal(lightVehicles.application.Qk.centreSpacingM, 1.8);
});

test("served-category definitions inherit values and enforce the C stair minima", () => {
  const stairs = resolveNTC2018ImposedLoadDefinition({
    definitionId: "C-stairs-balconies",
    servedDefinitionId: "C1-table-areas",
    units,
  });

  assert.equal(stairs.qk, 4);
  assert.equal(stairs.Qk, 4);
  assert.equal(stairs.Hk, 2);
  assert.equal(stairs.resolution.qk.inheritedValue, 3);
  assert.equal(stairs.resolution.qk.appliedMinimum, 4);
  assert.equal(stairs.combinationFactors.psi1, 0.7);
});

test("case-by-case and minimum definitions require complete documented values", () => {
  assert.throws(
    () => resolveNTC2018ImposedLoadDefinition({
      definitionId: "E2-industrial",
      units,
    }),
    /documentation\.reference/,
  );
  assert.throws(
    () => resolveNTC2018ImposedLoadDefinition({
      definitionId: "G-medium-vehicles",
      documentedValues: { qk: 5, Qk: 49, Hk: 1 },
      documentation,
      units,
    }),
    /must not be lower than 50 kN/,
  );

  const industrial = resolveNTC2018ImposedLoadDefinition({
    definitionId: "E2-industrial",
    documentedValues: { qk: 8, Qk: 9, Hk: 2 },
    documentation,
    units,
  });
  const mediumVehicles = resolveNTC2018ImposedLoadDefinition({
    definitionId: "G-medium-vehicles",
    documentedValues: { qk: 6, Qk: 60, Hk: 1.2 },
    documentation,
    units,
  });

  assert.deepEqual(
    { qk: industrial.qk, Qk: industrial.Qk, Hk: industrial.Hk },
    { qk: 8, Qk: 9, Hk: 2 },
  );
  assert.equal(mediumVehicles.qk, 6);
  assert.equal(mediumVehicles.Qk, 60);
  assert.equal(mediumVehicles.application.Qk.footprint.sideM, 0.2);
});

test("documented imposed loads are normalized from an explicit source unit system", () => {
  const result = resolveNTC2018ImposedLoadDefinition({
    definitionId: "E2-industrial",
    documentedValues: { qk: 0.008, Qk: 9000, Hk: 2 },
    documentation,
    units: { force: "N", length: "mm" },
  });

  assert.equal(result.qk, 8);
  assert.equal(result.Qk, 9);
  assert.equal(result.Hk, 2);
  assert.deepEqual(result.units, units);
  assert.deepEqual(result.metadata.sourceUnitSystem, { force: "N", length: "mm" });
});

test("categories I and K require documented case-by-case combination factors", () => {
  assert.throws(
    () => resolveNTC2018ImposedLoadDefinition({
      definitionId: "I-occupied-roofs",
      servedDefinitionId: "A-residential",
      units,
    }),
    /documentedCombinationFactors/,
  );

  const roof = resolveNTC2018ImposedLoadDefinition({
    definitionId: "I-occupied-roofs",
    servedDefinitionId: "A-residential",
    documentedCombinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
    documentation,
    units,
  });

  assert.deepEqual(
    { qk: roof.qk, Qk: roof.Qk, Hk: roof.Hk },
    { qk: 2, Qk: 2, Hk: 1 },
  );
  assert.deepEqual(roof.combinationFactors, { psi0: 0.7, psi1: 0.5, psi2: 0.3 });
});

test("area and multi-storey reduction factors implement NTC equations 3.1.1 and 3.1.2", () => {
  const area = calculateNTC2018ImposedLoadAreaReduction({
    category: "A",
    influenceArea: 50,
    units,
  });
  const categoryCMinimum = calculateNTC2018ImposedLoadAreaReduction({
    category: "C",
    influenceArea: 1000,
    units,
  });
  const occupiedRoof = calculateNTC2018ImposedLoadAreaReduction({
    category: "I",
    influenceArea: 50,
    psi0: 0.7,
    documentation,
    units,
  });
  const multiStorey = calculateNTC2018ImposedLoadMultiStoreyReduction({
    category: "B",
    loadedStoreys: 5,
  });

  assert.equal(area.alphaA, 0.7);
  assert.equal(categoryCMinimum.alphaA, 0.6);
  assert.equal(occupiedRoof.alphaA, 0.7);
  assert.equal(multiStorey.alphaN, 0.82);
  assert.equal(area.cannotCombineWith, "alphaN");
  assert.equal(multiStorey.cannotCombineWith, "alphaA");
  assert.throws(
    () => calculateNTC2018ImposedLoadAreaReduction({
      category: "E",
      influenceArea: 50,
      units,
    }),
    /only applicable/,
  );
});

test("legacy slab catalogs defer unresolved cases to the generic contract", () => {
  const industrial = getNTC2018SlabVariableAction(15);
  assert.equal(industrial.definitionId, "E2-industrial");
  assert.equal(industrial.qk, null);
  assert.equal(industrial.requiresGenericResolution, true);
  assert.throws(
    () => createNTC2018SlabVariableLoad({ actionId: 15, qk: 8, units }),
    /documentation\.reference/,
  );

  const load = createNTC2018SlabVariableLoad({
    actionId: 15,
    qk: 8,
    documentation,
    units,
  });
  assert.equal(load.value, 8);
  assert.equal(load.metadata.imposedLoadDefinitionId, "E2-industrial");
  assert.equal(SLAB_MATERIAL_WEIGHT_PRESET_METADATA.normative, false);
});
