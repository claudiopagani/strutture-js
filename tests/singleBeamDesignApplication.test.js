import test from "node:test";
import assert from "node:assert/strict";

import {
  SingleBeamDesignApplication,
  createBeamReportArtifacts,
} from "../src/index.js";
import {
  createBeamReportExampleModels,
  createRcElasticBeamReportModel,
  createSteelIpeBeamReportModel,
  createTimberC24BeamReportModel,
} from "../examples/beam-report-fixtures.js";

test("single beam design application generates JSON and Markdown reports for timber", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createTimberC24BeamReportModel(),
  });
  const report = result.outputs.report;

  assert.equal(result.applicationId, "single-beam-design");
  assert.equal(result.status, "ok");
  assert.equal(report.json.id, "timber-c24-report");
  assert.ok(report.json.analysis.combinationIds.includes("timber-c24-report-ULS-LIVE"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "timber-bending"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "timber-final-deflection"));
  assert.ok(report.json.analysis.envelopes.uls.maxAbsVerticalReaction);
  assert.ok(report.markdown.includes("# Trave in legno C24"));
  assert.ok(report.markdown.includes("## Rigidezze adottate"));
  assert.ok(report.markdown.includes("## Reazioni governanti"));
  assert.doesNotThrow(() => JSON.stringify(report.json));
});

test("single beam design reports expose frontend-ready file artifacts", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createTimberC24BeamReportModel(),
  });
  const artifacts = createBeamReportArtifacts(result.outputs.report);
  const jsonArtifact = artifacts.find((artifact) => artifact.format === "json");
  const markdownArtifact = artifacts.find((artifact) => artifact.format === "markdown");

  assert.equal(artifacts.length, 2);
  assert.equal(jsonArtifact.fileName, "timber-c24-report.json");
  assert.equal(markdownArtifact.fileName, "timber-c24-report.md");
  assert.equal(JSON.parse(jsonArtifact.content).id, "timber-c24-report");
  assert.ok(markdownArtifact.content.includes("# Trave in legno C24"));
  assert.equal(jsonArtifact.mediaType, "application/json");
  assert.equal(markdownArtifact.mediaType, "text/markdown");
});

test("single beam design application supports steel verification reports", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createSteelIpeBeamReportModel(),
  });
  const report = result.outputs.report;

  assert.equal(result.status, "ok");
  assert.equal(report.json.id, "steel-ipe200-report");
  assert.ok(report.json.verification.checks.some((check) => check.id === "steel-bending"));
  assert.ok(report.json.warnings.some((warning) => warning.includes("Lateral-torsional")));
  assert.ok(report.markdown.includes("# Trave in acciaio IPE200"));
  assert.doesNotThrow(() => JSON.stringify(report.json));
});

test("single beam design application can report RC elastic analysis with ULS section verification", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createRcElasticBeamReportModel(),
  });
  const report = result.outputs.report;

  assert.equal(result.status, "ok");
  assert.equal(report.json.verification.applicationId, "reinforced-concrete-beams");
  assert.ok(report.json.verification.checks.some((check) => check.id === "rc-uls-uniaxial-bending"));
  assert.ok(report.json.warnings.some((warning) => warning.includes("Shear resistance")));
  assert.ok(report.markdown.includes("# Trave in c.a. elastica C25/30"));
  assert.doesNotThrow(() => JSON.stringify(report.json));
});

test("single beam design application runs all report example models", () => {
  const application = new SingleBeamDesignApplication();
  const results = createBeamReportExampleModels().map((model) =>
    application.run({ model }),
  );

  assert.equal(results.length, 7);

  for (const result of results) {
    assert.ok(["ok", "not-verified"].includes(result.status));
    assert.ok(result.outputs.report.json.analysis.combinationIds.length >= 2);
    assert.ok(result.outputs.report.markdown.includes("## Esito"));
    assert.doesNotThrow(() => JSON.stringify(result.outputs.report.json));
  }
});
