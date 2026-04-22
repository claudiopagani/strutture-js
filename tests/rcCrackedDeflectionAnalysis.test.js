import test from "node:test";
import assert from "node:assert/strict";

import {
  CrackedSectionDeflectionAnalysis,
  SingleBeamAnalysis,
} from "../src/index.js";
import { createRcElasticBeamReportModel } from "../examples/beam-report-fixtures.js";

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
