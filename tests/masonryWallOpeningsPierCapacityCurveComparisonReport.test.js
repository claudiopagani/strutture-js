import test from "node:test";
import assert from "node:assert/strict";

import {
  MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION,
  MasonryPierCapacityCurveComparisonAnalysis,
  MasonryPierCapacityCurveComparisonReportBuilder,
  MasonryWallOpeningsModel,
  createMasonryPierCapacityCurveComparisonReportArtifacts,
} from "../src/index.js";

const units = { force: "N", length: "m" };

function createAxialCommitmentAlignment({
  id,
  label,
  p,
  fm = 6e6,
  tau0 = 2e4,
  fv0 = 0,
  height = 3,
  length = 1.2,
  thickness = 0.3,
} = {}) {
  const axialForce = p * fm * thickness * length;

  return new MasonryWallOpeningsModel({
    id,
    label,
    units,
    walls: [
      {
        id: "wall-a",
        length,
        height,
        thickness,
        material: {
          fm,
          tau0,
          fv0,
          E: 1.8e9,
          G: 6e8,
          density: 0,
          units,
        },
        verticalLineLoad: {
          G1: axialForce / length,
        },
      },
    ],
  });
}

test("single-pier flexural pushover comparison generates a JSON and Markdown report against the aggregated method", () => {
  const alignment = new MasonryWallOpeningsModel({
    id: "alignment-single-pier-capacity",
    label: "Maschio singolo flessionale",
    units,
    walls: [
      {
        id: "wall-a",
        length: 1.2,
        height: 3,
        thickness: 0.3,
        material: {
          fm: 6e6,
          tau0: 4e5,
          fv0: 0,
          E: 1.8e9,
          G: 6e8,
          density: 18000,
          units,
        },
        verticalLineLoad: {
          G1: 5000,
        },
      },
    ],
  });
  const analysisResult = new MasonryPierCapacityCurveComparisonAnalysis().analyze({
    alignment,
    options: {
      topRotation: "free",
      controlPointCount: 120,
    },
  });
  const report = new MasonryPierCapacityCurveComparisonReportBuilder().build({
    model: alignment,
    analysisResult,
  });
  const ksMetric = analysisResult.outputs.comparison.metrics.find(
    (metric) => metric.id === "ks",
  );
  const vyMetric = analysisResult.outputs.comparison.metrics.find(
    (metric) => metric.id === "Vy",
  );
  const duMetric = analysisResult.outputs.comparison.metrics.find(
    (metric) => metric.id === "du",
  );

  assert.equal(analysisResult.status, "ok");
  assert.equal(analysisResult.outputs.pier.governingFamily, "flexural");
  assert.equal(analysisResult.outputs.reading.outcome, "attention");
  assert.ok(analysisResult.outputs.fem.capacityCurve.points.length > 50);
  assert.ok(analysisResult.outputs.fem.hingeEvents.length >= 1);
  assert.ok(Math.abs(ksMetric.variationPercent - 100) < 1);
  assert.ok(Math.abs(vyMetric.variationPercent) < 5);
  assert.ok(Math.abs(duMetric.variationPercent) < 5);
  assert.equal(
    report.json.schemaVersion,
    MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION,
  );
  assert.equal(
    report.json.id,
    "alignment-single-pier-capacity-alignment-single-pier-capacity-pier-1-capacity-comparison-report",
  );
  assert.equal(report.json.pier.id, "alignment-single-pier-capacity-pier-1");
  assert.equal(report.json.reading.outcome, "attention");
  assert.ok(report.json.comparison.metrics.length >= 4);
  assert.ok(report.json.comparison.sampledCurvePoints.length >= 5);
  assert.ok(report.markdown.includes("# Confronto curva di capacita"));
  assert.ok(report.markdown.includes("## Sintesi Curve"));
  assert.ok(report.markdown.includes("## Confronto Indicatori"));
  assert.ok(report.markdown.includes("## Punti Campionati"));

  const artifacts = createMasonryPierCapacityCurveComparisonReportArtifacts(report);
  const jsonArtifact = artifacts.find((artifact) => artifact.format === "json");
  const markdownArtifact = artifacts.find(
    (artifact) => artifact.format === "markdown",
  );

  assert.equal(artifacts.length, 2);
  assert.equal(
    jsonArtifact.fileName,
    "alignment-single-pier-capacity-alignment-single-pier-capacity-pier-1-capacity-comparison-report.json",
  );
  assert.equal(
    markdownArtifact.fileName,
    "alignment-single-pier-capacity-alignment-single-pier-capacity-pier-1-capacity-comparison-report.md",
  );
});

test("single-pier comparison captures flexural-shear-flexural regimes across three axial commitment levels", () => {
  const cases = [
    {
      id: "alignment-p-005",
      p: 0.05,
      expectedFamily: "flexural",
      expectedMode: "rocking-toe-crushing",
    },
    {
      id: "alignment-p-035",
      p: 0.35,
      expectedFamily: "shear",
      expectedMode: "diagonal-cracking",
    },
    {
      id: "alignment-p-060",
      p: 0.6,
      expectedFamily: "flexural",
      expectedMode: "rocking-toe-crushing",
    },
  ].map((definition) => {
    const alignment = createAxialCommitmentAlignment({
      id: definition.id,
      label: `Maschio p=${definition.p}`,
      p: definition.p,
    });
    const result = new MasonryPierCapacityCurveComparisonAnalysis().analyze({
      alignment,
      options: {
        topRotation: "free",
        controlPointCount: 80,
        crackedStiffnessFactor: 0.6,
      },
    });
    const baseAxialForce =
      result.outputs.aggregated.performanceSummary == null
        ? result.outputs.aggregated?.performanceSummary?.base
        : result.outputs.pier.mechanics?.flexural?.compressionRatio;

    return {
      ...definition,
      result,
    };
  });

  const [low, medium, high] = cases;

  for (const testCase of cases) {
    const { result, expectedFamily, expectedMode, p } = testCase;

    assert.equal(result.status, "ok");
    assert.equal(result.outputs.pier.governingFamily, expectedFamily);
    assert.equal(result.outputs.pier.governingMode, expectedMode);
    assert.ok(result.outputs.fem.capacityCurve.points.length > 20);
    assert.ok(result.outputs.comparison.metrics.length >= 4);
    assert.ok(
      result.outputs.reading.outcome === "consistent" ||
        result.outputs.reading.outcome === "attention",
    );
    assert.ok(
      Math.abs(
        result.outputs.pier.mechanics.flexural.compressionRatio - p,
      ) < 1e-9,
    );
  }

  assert.ok(
    low.result.outputs.aggregated.performanceSummary.du >
      medium.result.outputs.aggregated.performanceSummary.du,
  );
  assert.ok(
    Math.abs(
      low.result.outputs.aggregated.performanceSummary.du -
        high.result.outputs.aggregated.performanceSummary.du,
    ) < 1e-9,
  );
  assert.ok(
    low.result.outputs.fem.performanceSummary.du >
      medium.result.outputs.fem.performanceSummary.du,
  );
  assert.ok(
    Math.abs(
      low.result.outputs.fem.performanceSummary.du -
        high.result.outputs.fem.performanceSummary.du,
    ) < 1e-6,
  );
});
