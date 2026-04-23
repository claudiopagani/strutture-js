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

function criteriaRows(report) {
  const criteria = report.comparison?.criteria ?? {};
  const checks = report.comparison?.checks ?? [];

  return [
    [
      "Rigidezza ks",
      `variazione entro +/-${formatNumber(criteria.stiffnessTolerancePercent, 2)}%`,
      checks.find((check) => check.id === "stiffness-variation")?.ok ? "si" : "no",
    ],
    [
      "Resistenza Vy",
      "il progetto non deve ridurre Vy",
      checks.find((check) => check.id === "strength-non-decreasing")?.ok ? "si" : "no",
    ],
    [
      "Deformabilita du",
      "il progetto non deve ridurre du",
      checks.find((check) => check.id === "deformability-non-decreasing")?.ok ? "si" : "no",
    ],
  ];
}

function stageRows(report) {
  const stateOfFact = report.comparison?.stageSummaries?.stateOfFact ?? {};
  const design = report.comparison?.stageSummaries?.design ?? {};

  return [
    [
      "Stato di fatto",
      stateOfFact.status ?? "-",
      formatNumber(stateOfFact.ks),
      formatNumber(stateOfFact.Vy),
      formatNumber(stateOfFact.du),
      formatNumber(stateOfFact.maxBaseShear),
      stateOfFact.pierCount ?? "-",
      stateOfFact.ringFrameCount ?? "-",
    ],
    [
      "Progetto",
      design.status ?? "-",
      formatNumber(design.ks),
      formatNumber(design.Vy),
      formatNumber(design.du),
      formatNumber(design.maxBaseShear),
      design.pierCount ?? "-",
      design.ringFrameCount ?? "-",
    ],
  ];
}

function checkRows(report) {
  return (report.comparison?.checks ?? []).map((check) => [
    check.id,
    check.description,
    formatNumber(check.stateOfFactValue),
    formatNumber(check.designValue),
    formatNumber(check.delta),
    formatPercent(check.variationPercent),
    check.criterion?.type === "variation-band"
      ? `+/-${formatNumber((check.criterion?.toleranceRatio ?? 0) * 100, 2)}%`
      : ">= stato di fatto",
    check.ok ? "si" : "no",
  ]);
}

export class AlignmentStateComparisonMarkdownRenderer {
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
      report.description ?? "Report di confronto ante/post sull'analisi sismica aggregata dell'allineamento murario.",
      "",
      "## Modello",
      "",
      `* ID: ${report.model?.id ?? "-"}`,
      `* Etichetta: ${report.model?.label ?? "-"}`,
      `* Unita: ${formatUnits(report.units)}`,
      `* Muri: ${report.model?.wallCount ?? "-"}`,
      `* Aperture: ${report.model?.openingCount ?? "-"}`,
      `* Lunghezza totale: ${formatNumber(report.model?.totalLength)} ${report.units?.length ?? ""}`.trim(),
      `* Altezza massima: ${formatNumber(report.model?.maxHeight)} ${report.units?.length ?? ""}`.trim(),
      `* Preset normativo: ${report.model?.settings?.normativePreset ?? "-"}`,
      "",
      "## Criteri di Accettazione",
      "",
      markdownTable(["Grandezza", "Regola", "OK"], criteriaRows(report)),
      "",
      "## Sintesi Stati",
      "",
      markdownTable(
        ["Stato", "Esito", "ks", "Vy", "du", "Vmax", "Maschi", "Cerchiature"],
        stageRows(report),
      ),
      "",
      "## Confronto",
      "",
      markdownTable(
        ["Grandezza", "Descrizione", "Stato di fatto", "Progetto", "Delta", "Delta %", "Regola", "OK"],
        checkRows(report),
      ),
      "",
      "## Lettura del Confronto",
      "",
      `* Esito sintetico: ${reading.headline ?? "-"}`,
      `* Outcome: ${reading.outcome ?? "-"}`,
      `* Criterio governante: ${reading.governingCheckId ?? "-"}`,
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
