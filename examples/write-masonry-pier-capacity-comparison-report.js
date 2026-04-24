import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MasonryPierCapacityCurveComparisonAnalysis,
  MasonryPierCapacityCurveComparisonReportBuilder,
  MasonryWallOpeningsModel,
  createMasonryPierCapacityCurveComparisonReportArtifacts,
} from "../src/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "results", "masonry-pier-capacity-comparison");
const units = { force: "N", length: "m" };

function formatNumber(value, decimals = 4) {
  if (!Number.isFinite(value)) {
    return value == null ? "-" : String(value);
  }

  return String(Number(value.toFixed(decimals)));
}

function formatPercent(value, decimals = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const rounded = Number(value.toFixed(decimals));

  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function markdownTable(headers, rows) {
  const header = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");

  return `${header}\n${separator}\n${body}`;
}

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

const scenarioDefinitions = [
  {
    id: "alignment-p-005",
    label: "Maschio p=0.05",
    p: 0.05,
    expectedFamily: "flexural",
    expectedMode: "rocking-toe-crushing",
  },
  {
    id: "alignment-p-035",
    label: "Maschio p=0.35",
    p: 0.35,
    expectedFamily: "shear",
    expectedMode: "diagonal-cracking",
  },
  {
    id: "alignment-p-060",
    label: "Maschio p=0.60",
    p: 0.6,
    expectedFamily: "flexural",
    expectedMode: "rocking-toe-crushing",
  },
];

const analysis = new MasonryPierCapacityCurveComparisonAnalysis();
const reportBuilder = new MasonryPierCapacityCurveComparisonReportBuilder();
const scenarioResults = scenarioDefinitions.map((scenario) => {
  const alignment = createAxialCommitmentAlignment(scenario);
  const analysisResult = analysis.analyze({
    alignment,
    options: {
      topRotation: "free",
      controlPointCount: 80,
      shearDriftCapacity: 0.006,
    },
  });
  const report = reportBuilder.build({
    model: alignment,
    analysisResult,
  });

  return {
    ...scenario,
    alignment,
    analysisResult,
    report,
  };
});

await mkdir(outputDir, { recursive: true });

for (const scenario of scenarioResults) {
  const artifacts = createMasonryPierCapacityCurveComparisonReportArtifacts(
    scenario.report,
  );

  for (const artifact of artifacts) {
    const outputPath = path.join(outputDir, artifact.fileName);

    await writeFile(outputPath, artifact.content, "utf8");
  }
}

const combinedJson = {
  id: "masonry-pier-capacity-comparison-axial-commitment-scenarios",
  title: "Confronto maschio singolo a tre livelli di impegno normale",
  units,
  scenarios: scenarioResults.map((scenario) => ({
    id: scenario.id,
    label: scenario.label,
    p: scenario.p,
    expectedFamily: scenario.expectedFamily,
    expectedMode: scenario.expectedMode,
    status: scenario.analysisResult.status,
    actualFamily: scenario.analysisResult.outputs.pier.governingFamily,
    actualMode: scenario.analysisResult.outputs.pier.governingMode,
    reading: scenario.analysisResult.outputs.reading,
    aggregated: scenario.analysisResult.outputs.aggregated.performanceSummary,
    fem: scenario.analysisResult.outputs.fem.performanceSummary,
    metrics: scenario.analysisResult.outputs.comparison.metrics,
  })),
};
const combinedMarkdown = [
  "# Confronto maschio singolo a tre livelli di impegno normale",
  "",
  "Report combinato dei tre scenari richiesti con impegno a compressione `p = P / (fc * t * L)`.",
  "",
  "## Sintesi scenari",
  "",
  markdownTable(
    ["Scenario", "p", "Famiglia attesa", "Famiglia trovata", "Modo trovato", "du agg.", "du FEM", "Outcome"],
    scenarioResults.map((scenario) => [
      scenario.label,
      formatNumber(scenario.p, 2),
      scenario.expectedFamily,
      scenario.analysisResult.outputs.pier.governingFamily,
      scenario.analysisResult.outputs.pier.governingMode,
      formatNumber(scenario.analysisResult.outputs.aggregated.performanceSummary.du),
      formatNumber(scenario.analysisResult.outputs.fem.performanceSummary.du),
      scenario.analysisResult.outputs.reading.outcome,
    ]),
  ),
  "",
  "## Indicatori",
  "",
  ...scenarioResults.flatMap((scenario) => [
    `### ${scenario.label}`,
    "",
    markdownTable(
      ["Indicatore", "Aggregato", "FEM", "Delta", "Delta %"],
      scenario.analysisResult.outputs.comparison.metrics.map((metric) => [
        metric.label,
        formatNumber(metric.aggregatedValue),
        formatNumber(metric.femValue),
        formatNumber(metric.delta),
        formatPercent(metric.variationPercent),
      ]),
    ),
    "",
  ]),
].join("\n");

await writeFile(
  path.join(outputDir, `${combinedJson.id}.json`),
  JSON.stringify(combinedJson, null, 2),
  "utf8",
);
await writeFile(
  path.join(outputDir, `${combinedJson.id}.md`),
  combinedMarkdown,
  "utf8",
);

for (const scenario of scenarioResults) {
  const artifacts = createMasonryPierCapacityCurveComparisonReportArtifacts(
    scenario.report,
  );
  console.log(
    `${scenario.report.json.id}: ${artifacts.map((artifact) => artifact.fileName).join(", ")}`,
  );
}

console.log(
  `combined: ${combinedJson.id}.json, ${combinedJson.id}.md`,
);
console.log(`Report written to ${outputDir}`);
