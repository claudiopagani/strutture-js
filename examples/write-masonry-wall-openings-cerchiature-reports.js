import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AlignmentEquivalentFramePushoverAnalysis,
  AlignmentSeismicAggregatedAnalysis,
  AlignmentStaticAnalysis,
  MasonryWallOpeningsModel,
  round,
  uniqueStrings,
} from "../src/index.js";

const REPORT_SCHEMA_VERSION = "masonry-wall-openings-cerchiature-report/v1";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputDir = path.join(rootDir, "examples", "masonry-wall-openings");
const outputDir = path.join(rootDir, "results", "masonry-wall-openings-cerchiature");
const stateLabels = {
  stateOfFact: "Stato di fatto",
  design: "Progetto",
};

function formatNumber(value, decimals = 3) {
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

function formatReferenceValue(metricId, value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  if (metricId === "ks") {
    return `${formatNumber(value, 2)} kN/mm`;
  }

  if (metricId === "Vy") {
    return `${formatNumber(value, 2)} kN`;
  }

  if (metricId === "du") {
    return `${formatNumber(value, 2)} mm`;
  }

  return formatNumber(value);
}

function absFinite(value) {
  return Number.isFinite(value) ? Math.abs(value) : null;
}

function markdownTable(headers, rows) {
  const header = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${row.map((cell) => String(cell ?? "-")).join(" | ")} |`)
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

function deltaRatio(afterValue, beforeValue) {
  if (!Number.isFinite(afterValue) || !Number.isFinite(beforeValue)) {
    return null;
  }

  if (Math.abs(beforeValue) <= 1e-9) {
    return null;
  }

  return (afterValue - beforeValue) / beforeValue;
}

function collectWarnings(...results) {
  return uniqueStrings(results.flatMap((result) => result?.warnings ?? []));
}

function collectAssumptions(...results) {
  return uniqueStrings(results.flatMap((result) => result?.assumptions ?? []));
}

function summarizeGoverningVerification(verification) {
  const checks = verification?.checks ?? [];
  const compressionChecks = checks.filter((check) =>
    String(check.id ?? "").startsWith("masonry-pier-compression"),
  );
  const governingFrom = (items) =>
    items.reduce((selected, check) => {
      if (!Number.isFinite(check.utilizationRatio)) {
        return selected;
      }

      if (!selected || check.utilizationRatio > selected.utilizationRatio) {
        return check;
      }

      return selected;
    }, null);
  const governing =
    governingFrom(compressionChecks) ??
    verification?.outputs?.governing ??
    governingFrom(checks) ??
    null;

  return {
    status: verification?.status ?? "not-analyzed",
    utilizationRatio:
      governing?.utilizationRatio ?? verification?.utilizationRatio ?? null,
    demand: governing?.demand ?? verification?.demand ?? null,
    capacity: governing?.capacity ?? verification?.capacity ?? null,
    checkId: governing?.id ?? null,
  };
}

function summarizeStaticResult(result) {
  return {
    status: result.status,
    summary: result.summary,
    combinationType: result.outputs.combinationType,
    piers: result.outputs.piers.map((pier) => ({
      id: pier.id,
      wallId: pier.wallId,
      x: pier.x,
      length: pier.length,
      effectiveLength: pier.effectiveLength,
      axialForce: pier.axialForce,
      selfWeight: pier.selfWeight,
      baseReaction: pier.baseReaction,
      verification: summarizeGoverningVerification(pier.verification),
    })),
    ringFrames: result.outputs.ringFrames.map((ringFrame) => ({
      id: ringFrame.id,
      openingId: ringFrame.openingId,
      topLoad: ringFrame.topLoad,
      openingBandLoad: ringFrame.openingBandLoad,
      totalInterceptedLoad: ringFrame.totalInterceptedLoad,
      leftReaction: ringFrame.leftReaction,
      rightReaction: ringFrame.rightReaction,
    })),
    lintels: result.outputs.lintels.map((lintel) => ({
      id: lintel.id,
      openingId: lintel.openingId,
      status: lintel.status,
      providerKind: lintel.providerKind,
      span: lintel.span,
      totalAppliedLoad: lintel.totalAppliedLoad,
      maxAbsBendingMoment: absFinite(lintel.analysis?.maxAbsBendingMoment),
      maxAbsShearForce: absFinite(lintel.analysis?.maxAbsShearForce),
      maxAbsVerticalDisplacement: absFinite(
        lintel.analysis?.maxAbsVerticalDisplacement,
      ),
      verification: summarizeGoverningVerification(lintel.verification),
    })),
    equilibrium: result.outputs.equilibrium,
  };
}

function performanceFromAggregated(result) {
  return {
    status: result.status,
    ks: result.outputs.bilinearization?.ks ?? null,
    Vy: result.outputs.bilinearization?.Vy ?? null,
    du: result.outputs.bilinearization?.du ?? null,
    peakBaseShear:
      result.outputs.capacityCurve?.maxBaseShear ??
      result.outputs.capacityCurve?.points?.reduce(
        (maxValue, point) => Math.max(maxValue, point.baseShear ?? 0),
        0,
      ) ??
      null,
    contributorCount: result.metadata?.contributorCount ?? null,
    pierCount: result.metadata?.pierCount ?? null,
    ringFrameCount: result.metadata?.ringFrameCount ?? null,
    spandrelCount: result.metadata?.spandrelCount ?? null,
  };
}

function performanceFromFrame(result, pathName) {
  const source = pathName
    .split(".")
    .reduce((value, key) => value?.[key], result.outputs);

  return {
    status: result.status,
    ks: source?.ks ?? null,
    Vy: source?.Vy ?? null,
    du: source?.du ?? null,
    peakBaseShear: source?.peakBaseShear ?? null,
    contributorCount: source?.contributorCount ?? null,
    activePierCount: source?.activePierCount ?? null,
    activeRingFrameCount: source?.activeRingFrameCount ?? null,
    directMasonryPierCount: source?.directMasonryPierCount ?? null,
    hingeCount: source?.hingeCount ?? null,
  };
}

function buildPrePostComparison({ stateOfFact, design, criteria }) {
  const stiffnessVariation = deltaRatio(design.ks, stateOfFact.ks);
  const strengthVariation = deltaRatio(design.Vy, stateOfFact.Vy);
  const displacementVariation = deltaRatio(design.du, stateOfFact.du);
  const stiffnessToleranceRatio = criteria?.stiffnessToleranceRatio ?? 0.15;

  return {
    checks: {
      stiffnessWithinTolerance:
        Number.isFinite(stiffnessVariation) &&
        Math.abs(stiffnessVariation) <= stiffnessToleranceRatio,
      strengthNotReduced:
        Number.isFinite(design.Vy) &&
        Number.isFinite(stateOfFact.Vy) &&
        design.Vy >= stateOfFact.Vy,
      displacementNotReduced:
        Number.isFinite(design.du) &&
        Number.isFinite(stateOfFact.du) &&
        design.du >= stateOfFact.du,
    },
    deltas: {
      ks: round((design.ks ?? 0) - (stateOfFact.ks ?? 0)),
      Vy: round((design.Vy ?? 0) - (stateOfFact.Vy ?? 0)),
      du: round((design.du ?? 0) - (stateOfFact.du ?? 0)),
      peakBaseShear: round(
        (design.peakBaseShear ?? 0) - (stateOfFact.peakBaseShear ?? 0),
      ),
    },
    variations: {
      ks: round(stiffnessVariation * 100),
      Vy: round(strengthVariation * 100),
      du: round(displacementVariation * 100),
    },
    criteria: {
      stiffnessToleranceRatio,
    },
  };
}

function currentMetricInReferenceUnits(metricId, performance) {
  if (metricId === "ks") {
    return Number.isFinite(performance.ks) ? performance.ks / 1e6 : null;
  }

  if (metricId === "Vy") {
    return Number.isFinite(performance.Vy) ? performance.Vy / 1000 : null;
  }

  if (metricId === "du") {
    return Number.isFinite(performance.du) ? performance.du * 1000 : null;
  }

  return null;
}

function referenceMetricValue(metricId, referenceState) {
  if (metricId === "ks") {
    return referenceState?.keKNPerMm ?? null;
  }

  if (metricId === "Vy") {
    return referenceState?.VyKN ?? null;
  }

  if (metricId === "du") {
    return referenceState?.duMm ?? null;
  }

  return null;
}

function buildReferenceComparison({ referenceResults, reportStates }) {
  if (!referenceResults?.lateral) {
    return null;
  }

  const metricLabels = {
    ks: "Rigidezza ke",
    Vy: "Resistenza Vy",
    du: "Spostamento du",
  };

  return {
    source: referenceResults.source ?? null,
    rows: ["stateOfFact", "design"].flatMap((stateKey) =>
      ["ks", "Vy", "du"].map((metricId) => {
        const referenceValue = referenceMetricValue(
          metricId,
          referenceResults.lateral[stateKey],
        );
        const currentValue = currentMetricInReferenceUnits(
          metricId,
          reportStates[stateKey].lateralAggregated,
        );
        const delta =
          Number.isFinite(referenceValue) && Number.isFinite(currentValue)
            ? currentValue - referenceValue
            : null;
        const variationPercent =
          Number.isFinite(delta) && Math.abs(referenceValue) > 1e-9
            ? (delta / referenceValue) * 100
            : null;

        return {
          state: stateLabels[stateKey],
          metricId,
          metricLabel: metricLabels[metricId],
          referenceValue: round(referenceValue),
          currentValue: round(currentValue),
          delta: round(delta),
          variationPercent: round(variationPercent),
        };
      }),
    ),
    ringFrames: referenceResults.ringFrames ?? [],
  };
}

function summarizeFemComparison(result) {
  return {
    status: result.status,
    frameType: result.outputs.equivalentFrame?.metadata?.frameType ?? null,
    controlStrategy: result.outputs.controlModel?.strategy ?? null,
    aggregated: performanceFromFrame(result, "aggregated.performanceSummary"),
    fem: performanceFromFrame(result, "fem.performanceSummary"),
    metrics: result.outputs.comparison?.metrics ?? [],
    sampledCurvePoints: result.outputs.comparison?.sampledCurvePoints ?? [],
    reading: result.outputs.reading ?? null,
  };
}

function buildReport({ spec, sourceInputFile, analyses }) {
  const stateOfFactLateral = performanceFromAggregated(analyses.stateOfFact.aggregated);
  const designLateral = performanceFromAggregated(analyses.design.aggregated);
  const prePostComparison = buildPrePostComparison({
    stateOfFact: stateOfFactLateral,
    design: designLateral,
    criteria: spec.analyses?.comparisonCriteria,
  });
  const states = {
    stateOfFact: {
      label: stateLabels.stateOfFact,
      modelId: analyses.stateOfFact.model.id,
      static: summarizeStaticResult(analyses.stateOfFact.static),
      lateralAggregated: stateOfFactLateral,
      femComparison: summarizeFemComparison(analyses.stateOfFact.fem),
    },
    design: {
      label: stateLabels.design,
      modelId: analyses.design.model.id,
      static: summarizeStaticResult(analyses.design.static),
      lateralAggregated: designLateral,
      femComparison: summarizeFemComparison(analyses.design.fem),
    },
  };

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    id: `${spec.id}-cerchiature-report`,
    title: spec.title,
    description: spec.description,
    sourceInputFile,
    notes: spec.notes ?? [],
    units: {
      force: "N",
      length: "m",
    },
    states,
    prePostComparison,
    referenceComparison: buildReferenceComparison({
      referenceResults: spec.referenceResults,
      reportStates: states,
    }),
    warnings: collectWarnings(
      analyses.stateOfFact.static,
      analyses.stateOfFact.aggregated,
      analyses.stateOfFact.fem,
      analyses.design.static,
      analyses.design.aggregated,
      analyses.design.fem,
    ),
    assumptions: collectAssumptions(
      analyses.stateOfFact.static,
      analyses.stateOfFact.aggregated,
      analyses.stateOfFact.fem,
      analyses.design.static,
      analyses.design.aggregated,
      analyses.design.fem,
    ),
  };
}

function staticPierRows(reportState) {
  return reportState.static.piers.map((pier) => [
    pier.id,
    formatNumber(pier.x),
    formatNumber(pier.length),
    formatNumber(pier.axialForce),
    formatNumber(pier.selfWeight),
    formatNumber(pier.baseReaction),
    pier.verification.status,
    formatNumber(pier.verification.utilizationRatio, 3),
  ]);
}

function staticLintelRows(reportState) {
  if (reportState.static.lintels.length === 0) {
    return [["-", "-", "-", "-", "-", "-", "-"]];
  }

  return reportState.static.lintels.map((lintel) => [
    lintel.openingId,
    lintel.status,
    lintel.providerKind ?? "-",
    formatNumber(lintel.span),
    formatNumber(lintel.maxAbsBendingMoment),
    formatNumber(lintel.maxAbsShearForce),
    formatNumber(lintel.verification.utilizationRatio, 3),
  ]);
}

function staticRingFrameRows(reportState) {
  if (reportState.static.ringFrames.length === 0) {
    return [["-", "-", "-", "-", "-"]];
  }

  return reportState.static.ringFrames.map((ringFrame) => [
    ringFrame.openingId,
    formatNumber(ringFrame.topLoad),
    formatNumber(ringFrame.openingBandLoad),
    formatNumber(ringFrame.leftReaction),
    formatNumber(ringFrame.rightReaction),
  ]);
}

function lateralRows(report) {
  return [
    [
      stateLabels.stateOfFact,
      report.states.stateOfFact.lateralAggregated.status,
      formatNumber(report.states.stateOfFact.lateralAggregated.ks),
      formatNumber(report.states.stateOfFact.lateralAggregated.Vy),
      formatNumber(report.states.stateOfFact.lateralAggregated.peakBaseShear),
      formatNumber(report.states.stateOfFact.lateralAggregated.du, 5),
      report.states.stateOfFact.lateralAggregated.contributorCount,
      report.states.stateOfFact.lateralAggregated.ringFrameCount,
    ],
    [
      stateLabels.design,
      report.states.design.lateralAggregated.status,
      formatNumber(report.states.design.lateralAggregated.ks),
      formatNumber(report.states.design.lateralAggregated.Vy),
      formatNumber(report.states.design.lateralAggregated.peakBaseShear),
      formatNumber(report.states.design.lateralAggregated.du, 5),
      report.states.design.lateralAggregated.contributorCount,
      report.states.design.lateralAggregated.ringFrameCount,
    ],
  ];
}

function prePostDeltaRows(report) {
  const { deltas, variations, checks } = report.prePostComparison;

  return [
    [
      "Rigidezza ks",
      formatNumber(deltas.ks),
      formatPercent(variations.ks),
      checks.stiffnessWithinTolerance ? "ok" : "attenzione",
    ],
    [
      "Taglio equivalente Vy",
      formatNumber(deltas.Vy),
      formatPercent(variations.Vy),
      checks.strengthNotReduced ? "ok" : "attenzione",
    ],
    [
      "Spostamento ultimo du",
      formatNumber(deltas.du, 5),
      formatPercent(variations.du),
      checks.displacementNotReduced ? "ok" : "attenzione",
    ],
    [
      "Taglio massimo",
      formatNumber(deltas.peakBaseShear),
      "-",
      "-",
    ],
  ];
}

function referenceComparisonRows(report) {
  return (report.referenceComparison?.rows ?? []).map((row) => [
    row.state,
    row.metricLabel,
    formatReferenceValue(row.metricId, row.referenceValue),
    formatReferenceValue(row.metricId, row.currentValue),
    formatReferenceValue(row.metricId, row.delta),
    formatPercent(row.variationPercent),
  ]);
}

function femRows(reportState) {
  return reportState.femComparison.metrics.map((metric) => [
    metric.label,
    formatNumber(metric.aggregatedValue),
    formatNumber(metric.femValue),
    formatNumber(metric.delta),
    formatPercent(metric.variationPercent),
  ]);
}

function renderStaticSection(label, reportState) {
  const equilibrium = reportState.static.equilibrium;

  return [
    `### ${label}`,
    "",
    `Esito: ${reportState.static.status}. Combinazione: ${reportState.static.combinationType}. Equilibrio: ${equilibrium.ok ? "ok" : "attenzione"} (scarto ${formatNumber(equilibrium.difference)} N).`,
    "",
    markdownTable(
      [
        "Maschio",
        "x [m]",
        "L [m]",
        "N [N]",
        "Peso [N]",
        "Reazione [N]",
        "Esito",
        "Util.",
      ],
      staticPierRows(reportState),
    ),
    "",
    markdownTable(
      [
        "Apertura",
        "Carico sup. [N]",
        "Carico fascia [N]",
        "Reaz. sx [N]",
        "Reaz. dx [N]",
      ],
      staticRingFrameRows(reportState),
    ),
    "",
    markdownTable(
      [
        "Apertura",
        "Esito",
        "Tipo",
        "L [m]",
        "Mmax [Nm]",
        "Vmax [N]",
        "Util.",
      ],
      staticLintelRows(reportState),
    ),
  ].join("\n");
}

function renderFemComparisonSection(label, reportState) {
  return [
    `### ${label}`,
    "",
    `Telaio: ${reportState.femComparison.frameType ?? "-"}. Strategia: ${reportState.femComparison.controlStrategy ?? "-"}.`,
    "",
    markdownTable(
      ["Indicatore", "Aggregato", "FEM fasce", "Delta", "Delta %"],
      femRows(reportState),
    ),
  ].join("\n");
}

function renderReferenceComparisonSection(report) {
  if (!report.referenceComparison) {
    return "";
  }

  const source = report.referenceComparison.source
    ? `Fonte DOCX: ${report.referenceComparison.source}.`
    : "Fonte DOCX dichiarata nel file esempio.";
  const ringFrameRows = report.referenceComparison.ringFrames.map((ringFrame) => [
    ringFrame.state ?? "-",
    ringFrame.profile ?? "-",
    ringFrame.frameCount ?? "-",
    formatReferenceValue("ks", ringFrame.keKNPerMm),
    formatReferenceValue("Vy", ringFrame.VyKN),
  ]);

  return [
    "## Confronto con report DOCX",
    "",
    source,
    "",
    markdownTable(
      ["Stato", "Indicatore", "DOCX", "Nostro aggregato", "Delta", "Delta %"],
      referenceComparisonRows(report),
    ),
    "",
    ...(ringFrameRows.length > 0
      ? [
          "### Cerchiature riportate nel DOCX",
          "",
          markdownTable(
            ["Stato", "Profilo", "Telai", "ke DOCX", "Vy DOCX"],
            ringFrameRows,
          ),
          "",
        ]
      : []),
  ].join("\n");
}

function renderMarkdown(report) {
  return [
    `# ${report.title}`,
    "",
    report.description,
    "",
    `Input: \`${path.basename(report.sourceInputFile)}\``,
    "",
    "## Verifica carichi verticali",
    "",
    renderStaticSection(stateLabels.stateOfFact, report.states.stateOfFact),
    "",
    renderStaticSection(stateLabels.design, report.states.design),
    "",
    "## Comportamento laterale pre/post - maschi aggregati",
    "",
    markdownTable(
      [
        "Stato",
        "Esito",
        "ks [N/m]",
        "Vy [N]",
        "Vmax [N]",
        "du [m]",
        "Contrib.",
        "Cerch.",
      ],
      lateralRows(report),
    ),
    "",
    markdownTable(
      ["Indicatore", "Delta", "Delta %", "Lettura"],
      prePostDeltaRows(report),
    ),
    "",
    renderReferenceComparisonSection(report),
    "",
    "## Differenza maschi aggregati vs FEM con fasce",
    "",
    renderFemComparisonSection(stateLabels.stateOfFact, report.states.stateOfFact),
    "",
    renderFemComparisonSection(stateLabels.design, report.states.design),
    "",
    "## Note",
    "",
    ...(report.notes.length > 0 ? report.notes.map((note) => `- ${note}`) : ["- -"]),
    "",
    "## Warning",
    "",
    ...(report.warnings.length > 0
      ? report.warnings.map((warning) => `- ${warning}`)
      : ["- Nessun warning."]),
    "",
    "## Assunzioni principali",
    "",
    ...report.assumptions.slice(0, 8).map((assumption) => `- ${assumption}`),
    report.assumptions.length > 8
      ? `- ... altre ${report.assumptions.length - 8} assunzioni nel JSON.`
      : "",
    "",
  ].join("\n");
}

async function analyzeSpecFile(fileName) {
  const sourceInputFile = path.join(inputDir, fileName);
  const spec = JSON.parse(await readFile(sourceInputFile, "utf8"));
  const staticAnalysis = new AlignmentStaticAnalysis();
  const aggregatedAnalysis = new AlignmentSeismicAggregatedAnalysis();
  const femAnalysis = new AlignmentEquivalentFramePushoverAnalysis();
  const staticOptions = spec.analyses?.staticOptions ?? {};
  const seismicOptions = spec.analyses?.seismicOptions ?? {};
  const femOptions = {
    ...seismicOptions,
    ...(spec.analyses?.femOptions ?? {}),
    includeSpandrels: true,
  };
  const stateOfFact = new MasonryWallOpeningsModel(spec.stateOfFact);
  const design = new MasonryWallOpeningsModel(spec.design);
  const analyses = {
    stateOfFact: {
      model: stateOfFact,
      static: staticAnalysis.analyze({
        alignment: stateOfFact,
        stage: "state-of-fact",
        options: staticOptions,
      }),
      aggregated: aggregatedAnalysis.analyze({
        alignment: stateOfFact,
        stage: "state-of-fact",
        options: seismicOptions,
      }),
      fem: femAnalysis.analyze({
        alignment: stateOfFact,
        stage: "state-of-fact",
        options: femOptions,
      }),
    },
    design: {
      model: design,
      static: staticAnalysis.analyze({
        alignment: design,
        stage: "design",
        options: staticOptions,
      }),
      aggregated: aggregatedAnalysis.analyze({
        alignment: design,
        stage: "design",
        options: seismicOptions,
      }),
      fem: femAnalysis.analyze({
        alignment: design,
        stage: "design",
        options: femOptions,
      }),
    },
  };
  const report = buildReport({
    spec,
    sourceInputFile: path.relative(rootDir, sourceInputFile).replaceAll("\\", "/"),
    analyses,
  });

  return {
    spec,
    report,
    markdown: renderMarkdown(report),
  };
}

await mkdir(outputDir, { recursive: true });

const inputFiles = (await readdir(inputDir))
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

for (const inputFile of inputFiles) {
  const { report, markdown } = await analyzeSpecFile(inputFile);
  const jsonFileName = `${report.id}.json`;
  const markdownFileName = `${report.id}.md`;

  await writeFile(
    path.join(outputDir, jsonFileName),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  await writeFile(path.join(outputDir, markdownFileName), markdown, "utf8");

  console.log(`${inputFile}: ${jsonFileName}, ${markdownFileName}`);
}

console.log(`Report written to ${outputDir}`);
