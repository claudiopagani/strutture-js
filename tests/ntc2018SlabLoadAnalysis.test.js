import test from "node:test";
import assert from "node:assert/strict";

import {
  FloorSlab,
  LayerLoad,
  LinearLoadFromLineWeight,
  NTC2018SlabLoadAnalysis,
  SurfaceLoad,
  VariableLoad,
  WallLoad,
  createNTC2018SlabVariableLoad,
  getNTC2018SlabVariableAction,
  getNTC2018SlabWeightValue,
  listNTC2018SlabWeightCategories,
} from "../src/index.js";

test("floor slab remains immutable when adding loads", () => {
  const slab = new FloorSlab({
    description: "Solaio campione",
  });

  const nextSlab = slab.addLoad(new SurfaceLoad({
    description: "Massetto",
    loadGroup: "G2",
    surfaceWeight: 1.5,
  }));

  assert.equal(slab.loads.length, 0);
  assert.equal(nextSlab.loads.length, 1);
  assert.equal(nextSlab.g2UnfavourableTotal, 1.5);
});

test("slab load analysis picks the most severe leading variable load", () => {
  let slab = new FloorSlab({
    description: "Solaio ufficio",
  });

  slab = slab
    .addLoad(new SurfaceLoad({
      description: "Stratigrafia",
      loadGroup: "G1",
      surfaceWeight: 2,
    }))
    .addLoad(new SurfaceLoad({
      description: "Impianti",
      loadGroup: "G2",
      surfaceWeight: 1,
    }))
    .addLoad(new VariableLoad({
      description: "Ufficio",
      value: 3,
      psi0: 0.7,
      psi1: 0.5,
      psi2: 0.3,
    }))
    .addLoad(new VariableLoad({
      description: "Archivio",
      value: 4,
      psi0: 0.8,
      psi1: 0.7,
      psi2: 0.6,
    }));

  const analysis = new NTC2018SlabLoadAnalysis(slab);
  const result = analysis.calculateULS();

  assert.equal(result.noVariableLoad, false);
  assert.equal(result.values.length, 2);
  assert.equal(result.maximum.note.includes("Ufficio"), true);
  assert.equal(result.maximum.value, 13.4);
});

test("service combinations fall back to permanent loads only when variable loads are absent", () => {
  let slab = new FloorSlab({
    description: "Solaio archivio",
  });

  slab = slab
    .addLoad(new SurfaceLoad({
      description: "Finiture",
      loadGroup: "G1",
      surfaceWeight: 2,
    }))
    .addLoad(new SurfaceLoad({
      description: "Controsoffitto",
      loadGroup: "G2",
      effect: "favourable",
      surfaceWeight: 0.5,
    }));

  const analysis = new NTC2018SlabLoadAnalysis(slab);
  const result = analysis.calculateSLE();

  assert.equal(result.rare.noVariableLoad, true);
  assert.equal(result.rare.maximum.value, 2.5);
  assert.equal(result.frequent.maximum.value, 2.5);
  assert.equal(result.quasiPermanent.value, 2.5);
});

test("derived slab loads compute equivalent surface values", () => {
  const layerLoad = new LayerLoad({
    description: "Sottofondo alleggerito",
    loadGroup: "G2",
    density: 16,
    thickness: 0.08,
  });
  const wallLoad = new WallLoad({
    description: "Tramezza",
    loadGroup: "G2",
    density: 8,
    height: 3,
    thickness: 0.1,
    spacing: 4,
  });
  const joistLoad = new LinearLoadFromLineWeight({
    description: "Travetto prefabbricato",
    loadGroup: "G1",
    lineWeight: 0.25,
    spacing: 0.5,
  });

  assert.equal(layerLoad.value, 1.28);
  assert.equal(Number(wallLoad.value.toFixed(6)), 0.6);
  assert.equal(joistLoad.value, 0.5);
});

test("ntc slab catalogs expose weight lookup and variable action presets", () => {
  assert.equal(listNTC2018SlabWeightCategories("surfaceWeights").includes("Roofing"), true);
  assert.equal(
    getNTC2018SlabWeightValue({
      weightType: "lineWeights",
      category: "IPE",
      description: "IPE 300",
    }),
    0.415,
  );

  const action = getNTC2018SlabVariableAction(4);
  assert.equal(action.category, "B");
  assert.equal(action.qk, 3.0);

  const load = createNTC2018SlabVariableLoad({ actionId: 4 });
  assert.equal(load.description, "Uffici aperti al pubblico");
  assert.equal(load.psi0, 0.7);
  assert.equal(load.value, 3.0);
});
