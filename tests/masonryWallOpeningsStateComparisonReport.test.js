import test from "node:test";
import assert from "node:assert/strict";

import {
  ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION,
  AlignmentStateComparisonAnalysis,
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
  createAlignmentStateComparisonReportArtifacts,
} from "../src/index.js";

const units = { force: "N", length: "m" };

function createReportMaterial() {
  return {
    category: "masonry",
    units,
    originalMechanicalProperties: {
      fm: 4.5e6,
      tau0: 8e4,
      fv0: 1.5e5,
      E: 1.6e9,
      G: 5.4e8,
      density: 18000,
    },
    stateOfFactProperties: {
      fm: 4e6,
      tau0: 7e4,
      fv0: 1.2e5,
      E: 1.4e9,
      G: 4.8e8,
      density: 18000,
    },
    improvedMechanicalProperties: {
      fm: 4e6,
      tau0: 7e4,
      fv0: 1.2e5,
      E: 1.4e9,
      G: 4.8e8,
      density: 18000,
    },
  };
}

function createReportAlignment(id = "alignment-state-comparison-report") {
  return new MasonryWallOpeningsModel({
    id,
    label: "Allineamento confronto",
    units,
    walls: [
      {
        id: "wall-a",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: createReportMaterial(),
        verticalLineLoad: {
          G1: 20000,
        },
      },
    ],
    openings: [
      {
        id: "window-a",
        x: 2,
        y: 1,
        width: 1,
        height: 1,
      },
    ],
  });
}

test("state comparison analysis exposes an interpretation block for ante/post reading", () => {
  const result = new AlignmentStateComparisonAnalysis().analyze({
    alignment: createReportAlignment("alignment-state-reading"),
  });

  assert.equal(result.outputs.reading.outcome, "accepted");
  assert.ok(
    result.outputs.reading.headline.includes("criteri ante/post configurati"),
  );
  assert.equal(result.outputs.reading.failedCheckIds.length, 0);
  assert.equal(result.outputs.reading.messages.length, 3);
});

test("masonry wall openings compare workflow generates JSON and Markdown reports", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    mode: "compare-state-of-fact-vs-design",
    model: createReportAlignment("alignment-state-report-app"),
  });
  const report = result.outputs.report;

  assert.equal(result.status, "ok");
  assert.deepEqual(result.metadata.reportFormats, ["json", "markdown"]);
  assert.equal(
    report.json.schemaVersion,
    ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION,
  );
  assert.equal(
    report.json.id,
    "alignment-state-report-app-state-comparison-report",
  );
  assert.equal(report.json.reading.outcome, "accepted");
  assert.ok(report.json.comparison.stageSummaries.stateOfFact.ks > 0);
  assert.ok(report.markdown.includes("# Confronto ante/post Allineamento confronto"));
  assert.ok(report.markdown.includes("## Criteri di Accettazione"));
  assert.ok(report.markdown.includes("## Lettura del Confronto"));
});

test("state comparison report artifacts expose frontend-ready files", () => {
  const application = new MasonryWallOpeningsApplication();
  const result = application.run({
    mode: "compare-state-of-fact-vs-design",
    model: createReportAlignment("alignment-state-report-artifacts"),
  });
  const artifacts = createAlignmentStateComparisonReportArtifacts(
    result.outputs.report,
  );
  const jsonArtifact = artifacts.find((artifact) => artifact.format === "json");
  const markdownArtifact = artifacts.find(
    (artifact) => artifact.format === "markdown",
  );

  assert.equal(artifacts.length, 2);
  assert.equal(
    jsonArtifact.fileName,
    "alignment-state-report-artifacts-state-comparison-report.json",
  );
  assert.equal(
    markdownArtifact.fileName,
    "alignment-state-report-artifacts-state-comparison-report.md",
  );
  assert.equal(
    JSON.parse(jsonArtifact.content).schemaVersion,
    ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION,
  );
  assert.ok(markdownArtifact.content.includes("## Confronto"));
  assert.equal(jsonArtifact.mediaType, "application/json");
  assert.equal(markdownArtifact.mediaType, "text/markdown");
});
