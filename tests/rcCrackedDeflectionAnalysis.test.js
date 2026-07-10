import test from "node:test";
import assert from "node:assert/strict";

import {
  createNTC2018BeamCombinations,
  CrackedSectionDeflectionAnalysis,
  runScaRcDeflectionAnalysis,
  SingleBeamAnalysis,
} from "../src/index.js";
import { createRcElasticBeamReportModel } from "../examples/beam-report-fixtures.js";
import { createFixedFixedRcDeflectionExample } from "../examples/rc-deflection-report-common.js";

test("RC cracked deflection analysis integrates SLE curvatures with default creep", () => {
  const model = createRcElasticBeamReportModel();
  const analysisResult = new SingleBeamAnalysis().analyze(model.beamInput);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
  });

  assert.equal(result.applicationId, "rc-cracked-deflection");
  assert.equal(result.status, "ok");
  assert.ok(result.checks.some((check) => check.id === "rc-sle-deflection-curvature"));
  assert.ok(result.checks.some((check) => check.id === "rc-sle-deflection-slenderness"));
  assert.equal(result.outputs.creepCoefficient, 2);
  assert.equal(result.outputs.includeShrinkage, false);
  assert.equal(result.outputs.simplifiedSlenderness.metadata.system, "simple_span");
  assert.ok(
    result.outputs.combinations.some(
      (combination) =>
        combination.combinationType === "SLE_QUASI_PERMANENT" &&
        combination.creepCoefficient === 2 &&
        combination.baseModularRatio === 15,
    ),
  );
});

test("RC cracked deflection validation applies configurable creep and excludes shrinkage", () => {
  const model = createRcElasticBeamReportModel();
  const analysisResult = new SingleBeamAnalysis().analyze(model.beamInput);
  const immediateResult = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
    serviceability: {
      deflection: {
        creepCoefficient: 0,
      },
    },
  });
  const longTermResult = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
    serviceability: {
      deflection: {
        creepCoefficient: 3,
        includeShrinkage: true,
      },
    },
  });
  const immediateQuasiPermanent =
    immediateResult.outputs.combinations.find(
      (combination) => combination.combinationType === "SLE_QUASI_PERMANENT",
    );
  const longTermQuasiPermanent =
    longTermResult.outputs.combinations.find(
      (combination) => combination.combinationType === "SLE_QUASI_PERMANENT",
    );

  assert.equal(immediateResult.status, "ok");
  assert.equal(longTermResult.status, "ok");
  assert.equal(immediateQuasiPermanent.creepCoefficient, 0);
  assert.equal(longTermQuasiPermanent.creepCoefficient, 3);
  assert.ok(
    longTermQuasiPermanent.maxAbsDeflection >
      immediateQuasiPermanent.maxAbsDeflection,
  );
  assert.equal(longTermResult.outputs.includeShrinkage, false);
  assert.ok(
    longTermResult.warnings.some((warning) =>
      warning.includes("Shrinkage curvature is intentionally excluded"),
    ),
  );
});

test("RC cracked deflection production profile limits station solves and output payload", () => {
  const model = createRcElasticBeamReportModel();
  const analysisResult = new SingleBeamAnalysis().analyze(model.beamInput);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.section.concreteMaterial,
    reinforcementMaterial: model.section.reinforcementMaterial,
    performanceProfile: "production",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.performance.profile, "production");
  assert.equal(result.outputs.performance.maxStationsPerCombination, 33);
  assert.ok(result.outputs.performance.inputStationCount >= result.outputs.performance.analyzedStationCount);
  assert.ok(result.outputs.performance.returnedPointCount >= result.outputs.combinations.length);

  for (const combination of result.outputs.combinations) {
    assert.ok(combination.analyzedPointCount <= 33);
    assert.ok(combination.returnedPointCount <= 65);
    assert.equal(combination.points.length, combination.returnedPointCount);
  }
});

test("RC hyperstatic cracked deflection iterates fixed-fixed stiffness redistribution", () => {
  const model = createFixedFixedRcDeflectionExample();
  const heavyLoads = model.loads.map((load) => ({
    ...load,
    value: load.value * 5,
  }));
  const beamInput = {
    ...model.beamInput,
    loads: heavyLoads,
  };
  const analysisResult = new SingleBeamAnalysis().analyze(beamInput);
  const commonInput = {
    beamId: model.id,
    analysisResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    serviceability: model.serviceability,
    mesh: { targetFiberCount: 80 },
    solver: { tolerance: 1e-2, maxIterations: 50 },
  };
  const linearMomentResult = new CrackedSectionDeflectionAnalysis().analyze(
    commonInput,
  );
  const hyperstaticResult = new CrackedSectionDeflectionAnalysis().analyze({
    ...commonInput,
    beamModel: beamInput,
  });
  const rareLinear = linearMomentResult.outputs.combinations.find(
    (combination) => combination.combinationType === "SLE_RARE",
  );
  const rareHyperstatic = hyperstaticResult.outputs.combinations.find(
    (combination) => combination.combinationType === "SLE_RARE",
  );

  assert.equal(hyperstaticResult.status, "ok");
  assert.equal(rareHyperstatic.hyperstatic.active, true);
  assert.equal(rareHyperstatic.hyperstatic.converged, true);
  assert.ok(rareHyperstatic.hyperstatic.iterations > 0);
  assert.ok(rareHyperstatic.crackedPointCount > 0);
  assert.ok(
    hyperstaticResult.assumptions.some((assumption) =>
      assumption.includes("Hyperstatic beams use iterative"),
    ),
  );
  assert.equal(hyperstaticResult.outputs.performance.serviceSolveCount, 0);
  assert.ok(rareHyperstatic.maxAbsDeflection > rareLinear.maxAbsDeflection);
});

test("RC hyperstatic cracked deflection keeps continuous beam support deflections compatible", () => {
  const model = createFixedFixedRcDeflectionExample();
  const loads = model.loads.map((load) => ({
    ...load,
    value: load.value * 4,
  }));
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: ["SLE_QUASI_PERMANENT"],
    idPrefix: "rc-continuous-deflection",
  });
  const beamInput = {
    ...model.beamInput,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    },
    supports: [
      { id: "left", position: 0, type: "hinge" },
      { id: "middle", position: 5, type: "roller" },
      { id: "right", position: 10, type: "roller" },
    ],
    loads,
    combinations,
    discretization: {
      elementCount: 40,
      stations: [2.5, 5, 7.5],
    },
  };
  const analysisResult = new SingleBeamAnalysis().analyze(beamInput);
  const result = new CrackedSectionDeflectionAnalysis().analyze({
    beamId: "rc-continuous-deflection",
    analysisResult,
    section: model.section,
    concreteMaterial: model.concreteMaterial,
    reinforcementMaterial: model.reinforcementMaterial,
    serviceability: model.serviceability,
    mesh: { targetFiberCount: 80 },
    beamModel: beamInput,
    output: { includePointDetails: true },
  });
  const combination = result.outputs.combinations.find(
    (item) => item.combinationType === "SLE_QUASI_PERMANENT",
  );
  const middleSupport = combination.points.find(
    (point) => Math.abs(point.station - 5) <= 1e-9,
  );

  assert.equal(result.status, "ok");
  assert.ok(middleSupport);
  assert.ok(Math.abs(middleSupport.deflection) <= 1e-9);
});

test("SCA deflection adapter builds a UI DTO from span and service moment", () => {
  const model = createRcElasticBeamReportModel();
  const result = runScaRcDeflectionAnalysis({
    sectionBuild: {
      section: model.section,
      materials: {
        concreteMaterial: model.section.concreteMaterial,
        reinforcementMaterial: model.section.reinforcementMaterial,
      },
    },
    analysisState: {
      serviceCombination: "quasiPermanent",
      deflectionSpanM: "5",
      deflectionMEdKnm: "120",
      deflectionStructuralSystem: "simpleBeam",
      deflectionLimitRatio: "250",
      modularRatio: "15",
    },
  });

  assert.equal(result.kind, "serviceDeflection");
  assert.equal(result.applicationId, "rc-cracked-deflection");
  assert.ok(["ok", "not-verified"].includes(result.status));
  assert.equal(result.outputs.source, "synthetic-service-moment-profile");
  assert.equal(result.outputs.performance.profile, "interactive");
  assert.equal(result.outputs.performance.maxStationsPerCombination, 17);
  assert.ok(result.outputs.maxAbsDeflection > 0);
  assert.ok(result.outputs.deflectionLimit > 0);
  assert.ok(result.outputs.points.length > 2);
  assert.ok(result.outputs.points.length <= 33);
  assert.equal(result.outputs.combination.combinationType, "SLE_QUASI_PERMANENT");
  assert.equal(result.outputs.hyperstatic.active, false);
});
