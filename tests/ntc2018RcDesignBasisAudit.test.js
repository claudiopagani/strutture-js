import assert from "node:assert/strict";
import test from "node:test";

import {
  auditNTC2018RcDesignBasis,
  getNTC2018RcBuildingCoverage,
} from "../src/index.js";

const DESIGN_BASIS = Object.freeze({
  behavior: "cd-b",
  structuralType: "frame",
  regularity: {
    plan: "regular",
    elevation: "regular",
  },
  analysisMethod: "linear-dynamic",
  analysisParameters: {
    t1: 0.6,
    tc: 0.4,
    td: 2,
  },
  frameStoreyCount: 3,
  frameBayCount: 2,
});

test("RC design-basis audit separates choice consistency from conformity", () => {
  const result = auditNTC2018RcDesignBasis(DESIGN_BASIS);

  assert.equal(result.status, "ok");
  assert.ok(Math.abs(result.outputs.behavior.q - 3.9) < 1e-12);
  assert.equal(result.outputs.normativeAssurance.conformityClaimed, false);
  assert.equal(result.outputs.normativeAssurance.traceabilityComplete, false);
  assert.equal(result.metadata.normativeConformityClaimed, false);
  assert.ok(result.metadata.normativeReferences.length >= 3);
});

test("RC design-basis audit rejects an inconsistent declared q", () => {
  const result = auditNTC2018RcDesignBasis({
    ...DESIGN_BASIS,
    q: 3,
  });

  assert.equal(result.status, "not-verified");
  assert.equal(
    result.checks.find((check) =>
      check.id === "rc-design-basis-behavior-factor").ok,
    false,
  );
});

test("RC coverage distinguishes implementation from normative traceability", () => {
  const coverage = getNTC2018RcBuildingCoverage();

  assert.equal(coverage.declaredScopeImplementationCoverageComplete, true);
  assert.equal(coverage.normativeTraceabilityComplete, false);
  assert.equal(coverage.normativeConformityClaimed, false);
  assert.ok(coverage.capabilities.every((item) =>
    item.normativeTraceability?.status));
});
