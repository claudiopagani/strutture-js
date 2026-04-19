function resultEntries(resultMap = {}) {
  return Object.values(resultMap ?? {});
}

function formatNumber(value, decimals = 4) {
  if (!Number.isFinite(value)) {
    return value == null ? "-" : String(value);
  }

  const rounded = Number(value.toFixed(decimals));

  return String(rounded);
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
  if (rows.length === 0) {
    return "_Nessun dato disponibile._";
  }

  const header = `| ${headers.map(formatText).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${row.map((item) => formatText(item)).join(" | ")} |`)
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

function stiffnessRow(result) {
  const metadata = result.sectionProperties?.metadata ?? {};

  return [
    result.id,
    result.context?.limitState ?? "-",
    result.context?.combinationType ?? "-",
    formatNumber(result.sectionProperties?.axialRigidity),
    formatNumber(result.sectionProperties?.flexuralRigidity),
    formatNumber(result.sectionProperties?.flexuralRigidityY),
    formatNumber(result.sectionProperties?.flexuralRigidityZ),
    formatNumber(result.sectionProperties?.shearRigidity),
    formatNumber(result.sectionProperties?.shearRigidityY),
    formatNumber(result.sectionProperties?.shearRigidityZ),
    metadata.kmod ?? metadata.gamma ?? metadata.gamma1 ?? "-",
    metadata.kdef ?? metadata.finalStiffness ?? "-",
  ];
}

function combinationRows(analysisResult) {
  return resultEntries(analysisResult.combinations).map((result) => [
    result.id,
    result.context?.limitState ?? "-",
    result.context?.combinationType ?? "-",
    Object.entries(result.factors ?? result.context?.loadCaseFactors ?? {})
      .map(([id, factor]) => `${id}: ${formatNumber(factor, 3)}`)
      .join(", "),
  ]);
}

function loadRows(analysisResult) {
  const loadsById = new Map();

  for (const result of [
    ...resultEntries(analysisResult.loadCases),
    ...resultEntries(analysisResult.combinations),
  ]) {
    for (const load of result.loads ?? []) {
      if (!loadsById.has(load.id)) {
        loadsById.set(load.id, load);
      }
    }
  }

  return [...loadsById.values()].map((load) => [
    load.id,
    load.loadCaseId,
    load.actionType,
    load.loadDurationClass ?? "-",
    formatNumber(load.factor, 3),
  ]);
}

function envelopeRow(label, item) {
  if (!item) {
    return [label, "-", "-", "-", "-"];
  }

  return [
    label,
    item.resultId,
    item.limitState ?? "-",
    formatNumber(item.value),
    formatNumber(item.sample?.station),
  ];
}

function reactionEnvelopeRow(label, item) {
  if (!item) {
    return [label, "-", "-", "-", "-", "-"];
  }

  return [
    label,
    item.resultId,
    item.limitState ?? "-",
    item.sample?.supportId ?? item.sample?.nodeId ?? "-",
    formatNumber(item.value),
    formatNumber(item.sample?.station),
  ];
}

function sectionRotationRows(report) {
  const rotation = report.analysis?.sectionRotation ?? {};
  const axes = report.analysis?.principalAxes ?? {};
  const rigidity = report.analysis?.sectionRigidity ?? {};

  return [
    ["Alpha", formatNumber(rotation.alpha), "rad"],
    [
      "Alpha input",
      rotation.inputAlpha == null
        ? "-"
        : `${formatNumber(rotation.inputAlpha)} ${rotation.inputUnits ?? rotation.units ?? ""}`.trim(),
      "-",
    ],
    ["Convenzione", rotation.convention ?? axes.convention ?? "-", "-"],
    ["Asse principale", rotation.primaryAxis ?? axes.primaryAxis ?? "-", "-"],
    [
      "Fonte EI verticale",
      rigidity.verticalFlexuralRigiditySource ?? "-",
      "-",
    ],
    [
      "Fonte GA verticale",
      rigidity.verticalShearRigiditySource ?? "-",
      "-",
    ],
  ];
}

function principalActionEnvelopeRows(report) {
  const envelopes = report.analysis?.principalActionEnvelopes ?? {};
  const scopes = [
    ["Tutti", envelopes.all],
    ["Combinazioni", envelopes.combinations],
    ["SLU", envelopes.uls],
    ["SLE", envelopes.sle],
  ];
  const quantities = [
    ["MY max assoluto", "maxAbsBendingMomentY"],
    ["MZ max assoluto", "maxAbsBendingMomentZ"],
    ["VY max assoluto", "maxAbsShearForceY"],
    ["VZ max assoluto", "maxAbsShearForceZ"],
  ];

  return scopes.flatMap(([scope, group]) =>
    quantities.map(([label, key]) => {
      const item = group?.[key];

      return [
        scope,
        label,
        item?.resultId ?? "-",
        item?.limitState ?? "-",
        formatNumber(item?.value),
        formatNumber(item?.station),
      ];
    }),
  );
}

function verificationRows(verificationResult) {
  return (verificationResult?.checks ?? []).map((check) => [
    check.id,
    check.description ?? "-",
    formatNumber(check.demand),
    formatNumber(check.capacity),
    formatNumber(check.utilizationRatio, 3),
    check.ok === false ? "no" : "si",
  ]);
}

function isReportScalar(value) {
  return (
    value == null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

function verificationDetailRows(verificationResult) {
  return (verificationResult?.checks ?? []).flatMap((check) =>
    Object.entries(check.metadata ?? {})
      .filter(([, value]) => isReportScalar(value))
      .map(([key, value]) => [
        check.id,
        key,
        typeof value === "number" ? formatNumber(value) : value,
      ]),
  );
}

export class BeamReportMarkdownRenderer {
  render(report) {
    const analysis = report.analysis;
    const raw = analysis.raw;
    const geometry =
      resultEntries(raw.combinations)[0]?.geometry ??
      resultEntries(raw.loadCases)[0]?.geometry ??
      null;
    const supportRows =
      resultEntries(raw.combinations)[0]?.supports ??
      resultEntries(raw.loadCases)[0]?.supports ??
      [];
    const stiffnessRows = resultEntries(raw.combinations).map(stiffnessRow);
    const envelope = raw.envelopes?.combinations ?? raw.envelopes?.all ?? {};
    const ulsEnvelope = raw.envelopes?.uls ?? envelope;
    const sleEnvelope = raw.envelopes?.sle ?? envelope;
    const warningLines =
      report.warnings.length > 0
        ? report.warnings.map((warning) => `* ${warning}`).join("\n")
        : "* Nessun warning.";
    const assumptionLines =
      report.assumptions.length > 0
        ? report.assumptions.map((assumption) => `* ${assumption}`).join("\n")
        : "* Nessuna assunzione aggiuntiva.";

    return [
      `# ${report.title}`,
      "",
      report.description || "Report di analisi e verifica di trave semplice.",
      "",
      "## Modello",
      "",
      `* ID: ${report.id}`,
      `* Unita: ${formatUnits(report.units)}`,
      `* Modello di analisi: ${raw.analysisModel ?? "-"}`,
      `* Lunghezza: ${formatNumber(geometry?.length)} ${report.units?.length ?? ""}`.trim(),
      `* Luce orizzontale: ${formatNumber(geometry?.horizontalSpan)} ${report.units?.length ?? ""}`.trim(),
      "",
      "## Assi principali",
      "",
      markdownTable(["Parametro", "Valore", "Unita"], sectionRotationRows(report)),
      "",
      "## Vincoli",
      "",
      markdownTable(
        ["ID", "Nodo", "Stazione", "Tipo", "ux", "uy", "rz"],
        supportRows.map((support) => [
          support.id,
          support.nodeId,
          formatNumber(support.station),
          support.type ?? "-",
          support.restraints?.ux ? "si" : "no",
          support.restraints?.uy ? "si" : "no",
          support.restraints?.rz ? "si" : "no",
        ]),
      ),
      "",
      "## Carichi",
      "",
      markdownTable(["ID", "Caso", "Tipo", "Durata", "Fattore"], loadRows(raw)),
      "",
      "## Combinazioni",
      "",
      markdownTable(
        ["ID", "Stato limite", "Tipo", "Fattori"],
        combinationRows(raw),
      ),
      "",
      "## Rigidezze adottate",
      "",
      markdownTable(
        [
          "ID",
          "SL",
          "Tipo",
          "EA",
          "EI vert.",
          "EI Y",
          "EI Z",
          "GA vert.",
          "GA Y",
          "GA Z",
          "k/gamma",
          "finale/kdef",
        ],
        stiffnessRows,
      ),
      "",
      "## Inviluppi governanti",
      "",
      markdownTable(
        ["Grandezza", "Risultato", "SL", "Valore", "Stazione"],
        [
          envelopeRow("M max assoluto", ulsEnvelope.maxAbsBendingMoment),
          envelopeRow("MY max assoluto", ulsEnvelope.maxAbsBendingMomentY),
          envelopeRow("MZ max assoluto", ulsEnvelope.maxAbsBendingMomentZ),
          envelopeRow("V max", ulsEnvelope.maxShearForce),
          envelopeRow("V min", ulsEnvelope.minShearForce),
          envelopeRow("VY max assoluto", ulsEnvelope.maxAbsShearForceY),
          envelopeRow("VZ max assoluto", ulsEnvelope.maxAbsShearForceZ),
          envelopeRow(
            "Freccia SLE max assoluta",
            sleEnvelope.maxAbsVerticalDisplacement,
          ),
        ],
      ),
      "",
      "## Azioni principali",
      "",
      markdownTable(
        ["Dominio", "Grandezza", "Risultato", "SL", "Valore", "Stazione"],
        principalActionEnvelopeRows(report),
      ),
      "",
      "## Reazioni governanti",
      "",
      markdownTable(
        ["Grandezza", "Risultato", "SL", "Supporto", "Valore", "Stazione"],
        [
          reactionEnvelopeRow("Rx max assoluto", envelope.maxAbsHorizontalReaction),
          reactionEnvelopeRow("Ry max assoluto", envelope.maxAbsVerticalReaction),
          reactionEnvelopeRow(
            "Mrz max assoluto",
            envelope.maxAbsSupportMomentReaction,
          ),
        ],
      ),
      "",
      "## Verifiche",
      "",
      markdownTable(
        ["ID", "Descrizione", "Domanda", "Capacita", "Utilizzo", "OK"],
        verificationRows(report.verification),
      ),
      "",
      "## Dettagli verifiche",
      "",
      markdownTable(
        ["Verifica", "Parametro", "Valore"],
        verificationDetailRows(report.verification),
      ),
      "",
      "## Esito",
      "",
      `* Stato: ${report.verification?.status ?? "non verificato"}`,
      `* Utilizzo governante: ${formatNumber(report.governing.utilizationRatio, 3)}`,
      `* Verifica governante: ${report.governing.checkId ?? "-"}`,
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
