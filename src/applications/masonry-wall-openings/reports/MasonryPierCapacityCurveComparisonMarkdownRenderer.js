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

function formatText(value) {
  if (value == null || value === "") {
    return "-";
  }

  return String(value).replaceAll("|", "\\|");
}

function formatUnits(units) {
  if (!units) {
    return "-";
  }

  return `${units.force ?? "-"}, ${units.length ?? "-"}`;
}

function markdownTable(headers, rows) {
  if (!rows.length) {
    return "_Nessun dato disponibile._";
  }

  const header = `| ${headers.map(formatText).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${row.map((value) => formatText(value)).join(" | ")} |`)
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

function summaryRows(report) {
  const aggregated = report.aggregated?.performance ?? {};
  const fem = report.fem?.performance ?? {};
  const femTermination = report.fem?.finalState?.termination?.reason ?? "-";

  return [
    [
      "Metodo aggregato",
      formatNumber(aggregated.ks),
      formatNumber(aggregated.Vy),
      formatNumber(aggregated.du),
      formatNumber(aggregated.peakBaseShear),
      aggregated.governingMode ?? "-",
      "-",
    ],
    [
      "FEM non lineare",
      formatNumber(fem.ks),
      formatNumber(fem.Vy),
      formatNumber(fem.du),
      formatNumber(fem.peakBaseShear),
      `${fem.hingeCount ?? 0} cerniere`,
      femTermination,
    ],
  ];
}

function metricRows(report) {
  return (report.comparison?.metrics ?? []).map((metric) => [
    metric.label ?? metric.id,
    formatNumber(metric.aggregatedValue),
    formatNumber(metric.femValue),
    formatNumber(metric.delta),
    formatPercent(metric.variationPercent),
  ]);
}

function sampleRows(report) {
  return (report.comparison?.sampledCurvePoints ?? []).map((point) => [
    formatNumber(point.displacement),
    formatNumber(point.aggregatedBaseShear),
    formatNumber(point.femBaseShear),
    formatNumber(point.delta),
    formatPercent(point.variationPercent),
  ]);
}

export class MasonryPierCapacityCurveComparisonMarkdownRenderer {
  render(report) {
    const reading = report.reading ?? {};
    const warningLines =
      report.warnings?.length > 0
        ? report.warnings.map((warning) => `* ${warning}`).join("\n")
        : "* Nessun warning.";
    const assumptionLines =
      report.assumptions?.length > 0
        ? report.assumptions.map((assumption) => `* ${assumption}`).join("\n")
        : "* Nessuna assunzione aggiuntiva.";
    const readingLines =
      reading.messages?.length > 0
        ? reading.messages.map((message) => `* ${message}`).join("\n")
        : "* Nessuna lettura sintetica disponibile.";

    return [
      `# ${report.title}`,
      "",
      report.description ??
        "Report di confronto tra curva di capacita aggregata del maschio e pushover FEM non lineare del corrispondente macroelemento.",
      "",
      "## Modello",
      "",
      `* Allineamento: ${report.model?.label ?? report.model?.id ?? "-"}`,
      `* ID allineamento: ${report.model?.id ?? "-"}`,
      `* Unita: ${formatUnits(report.units)}`,
      `* Maschio: ${report.pier?.id ?? "-"}`,
      `* Muro: ${report.pier?.wallId ?? "-"}`,
      `* Vincolo in sommita: ${report.pier?.topRotation ?? "-"}`,
      `* Meccanismo aggregato governante: ${report.pier?.governingMode ?? "-"}`,
      "",
      "## Sintesi Curve",
      "",
      markdownTable(
        ["Modello", "ks", "Vy", "du", "Vmax", "Note", "Terminazione"],
        summaryRows(report),
      ),
      "",
      "## Confronto Indicatori",
      "",
      markdownTable(
        ["Indicatore", "Aggregato", "FEM", "Delta", "Delta %"],
        metricRows(report),
      ),
      "",
      "## Punti Campionati",
      "",
      markdownTable(
        ["Spostamento", "V aggregato", "V FEM", "Delta", "Delta %"],
        sampleRows(report),
      ),
      "",
      "## Lettura",
      "",
      `* Outcome: ${reading.outcome ?? "-"}`,
      `* Esito sintetico: ${reading.headline ?? "-"}`,
      `* Indicatore governante: ${reading.governingMetricId ?? "-"}`,
      "",
      readingLines,
      "",
      "## Warning",
      "",
      warningLines,
      "",
      "## Assunzioni",
      "",
      assumptionLines,
      "",
    ].join("\n");
  }
}
