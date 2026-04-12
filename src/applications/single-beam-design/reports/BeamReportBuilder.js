function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function toPlain(value, seen = new WeakSet()) {
  if (value == null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "function") {
    return {
      type: "function",
      name: value.name || null,
    };
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return {
      type: "circular-reference",
    };
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item, seen));
  }

  if (typeof value.toJSON === "function" && !isPlainObject(value)) {
    return toPlain(value.toJSON(), seen);
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    output[key] = toPlain(item, seen);
  }

  return output;
}

function unique(items) {
  return [...new Set(items.filter((item) => item != null && item !== ""))];
}

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

function summarizeResult(result) {
  const maxMoment = result.internalForces?.maxAbsBendingMoment;
  const maxShear = [result.internalForces?.maxShearForce, result.internalForces?.minShearForce]
    .filter(Boolean)
    .reduce((selected, sample) =>
      !selected || Math.abs(sample.v) > Math.abs(selected.v) ? sample : selected,
    null);
  const maxDeflection = result.displacements?.maxAbsVerticalDisplacement;

  return {
    id: result.id,
    resultType: result.resultType,
    limitState: result.context?.limitState ?? null,
    combinationType: result.context?.combinationType ?? null,
    maxAbsBendingMoment: maxMoment
      ? {
          value: maxMoment.m,
          station: maxMoment.station,
        }
      : null,
    maxAbsShearForce: maxShear
      ? {
          value: maxShear.v,
          station: maxShear.station,
        }
      : null,
    maxAbsVerticalDisplacement: maxDeflection
      ? {
          value: maxDeflection.uy,
          station: maxDeflection.station,
        }
      : null,
    sectionProperties: toPlain(result.sectionProperties),
  };
}

function stiffnessRow(result) {
  const metadata = result.sectionProperties?.metadata ?? {};

  return [
    result.id,
    result.context?.limitState ?? "-",
    result.context?.combinationType ?? "-",
    formatNumber(result.sectionProperties?.axialRigidity),
    formatNumber(result.sectionProperties?.flexuralRigidity),
    formatNumber(result.sectionProperties?.shearRigidity),
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

function governingCheckFromVerification(verification) {
  const checks = verification?.checks ?? [];

  return checks.reduce((selected, check) => {
    if (!Number.isFinite(check.utilizationRatio)) {
      return selected;
    }

    if (!selected || check.utilizationRatio > selected.utilizationRatio) {
      return check;
    }

    return selected;
  }, null);
}

function collectWarnings(...sources) {
  return unique(
    sources.flatMap((source) => {
      if (!source) {
        return [];
      }

      if (Array.isArray(source)) {
        return source;
      }

      return source.warnings ?? [];
    }),
  );
}

function collectAssumptions(...sources) {
  return unique(
    sources.flatMap((source) => {
      if (!source) {
        return [];
      }

      if (Array.isArray(source)) {
        return source;
      }

      return source.assumptions ?? [];
    }),
  );
}

export class BeamReportBuilder {
  constructor({
    applicationId = "single-beam-design",
    metadata = {},
  } = {}) {
    this.applicationId = applicationId;
    this.metadata = { ...metadata };
  }

  build({
    model,
    analysisResult,
    verificationResult = null,
    metadata = {},
  } = {}) {
    if (!model) {
      throw new Error("BeamReportBuilder requires a model.");
    }

    if (!analysisResult) {
      throw new Error("BeamReportBuilder requires an analysisResult.");
    }

    const json = this.buildJson({
      model,
      analysisResult,
      verificationResult,
      metadata,
    });

    return {
      json,
      markdown: this.buildMarkdown(json),
    };
  }

  buildJson({
    model,
    analysisResult,
    verificationResult = null,
    metadata = {},
  }) {
    const loadCaseSummaries = Object.fromEntries(
      Object.entries(analysisResult.loadCases ?? {}).map(([id, result]) => [
        id,
        summarizeResult(result),
      ]),
    );
    const combinationSummaries = Object.fromEntries(
      Object.entries(analysisResult.combinations ?? {}).map(([id, result]) => [
        id,
        summarizeResult(result),
      ]),
    );
    const verification = verificationResult
      ? toPlain(verificationResult)
      : null;
    const governingCheck = governingCheckFromVerification(verification);
    const warnings = collectWarnings(
      analysisResult,
      verification,
      verification ? [] : ["No structural verification result was provided."],
    );
    const assumptions = collectAssumptions(analysisResult, verification);

    return {
      applicationId: this.applicationId,
      id: model.id,
      title: model.title,
      description: model.description,
      units: toPlain(analysisResult.units ?? model.units),
      model: typeof model.toJSON === "function" ? model.toJSON() : toPlain(model),
      analysis: {
        id: analysisResult.id,
        units: toPlain(analysisResult.units),
        analysisModel: analysisResult.analysisModel,
        loadCaseIds: Object.keys(analysisResult.loadCases ?? {}),
        combinationIds: Object.keys(analysisResult.combinations ?? {}),
        loadCases: loadCaseSummaries,
        combinations: combinationSummaries,
        envelopes: toPlain(analysisResult.envelopes),
        raw: toPlain(analysisResult),
      },
      verification,
      governing: {
        verification: verification?.outputs?.governing ?? null,
        utilizationRatio: verification?.utilizationRatio ?? null,
        checkId: verification?.metadata?.governingCheckId ?? governingCheck?.id ?? null,
        ulsMoment: toPlain(analysisResult.envelopes?.uls?.maxAbsBendingMoment),
        sleDeflection: toPlain(
          analysisResult.envelopes?.sle?.maxAbsVerticalDisplacement,
        ),
      },
      warnings,
      assumptions,
      metadata: {
        ...this.metadata,
        ...metadata,
        generatedBy: "BeamReportBuilder",
      },
    };
  }

  buildMarkdown(report) {
    const analysis = report.analysis;
    const raw = analysis.raw;
    const geometry = resultEntries(raw.combinations)[0]?.geometry ??
      resultEntries(raw.loadCases)[0]?.geometry ??
      null;
    const supportRows = resultEntries(raw.combinations)[0]?.supports ??
      resultEntries(raw.loadCases)[0]?.supports ??
      [];
    const stiffnessRows = resultEntries(raw.combinations).map(stiffnessRow);
    const envelope = raw.envelopes?.combinations ?? raw.envelopes?.all ?? {};
    const ulsEnvelope = raw.envelopes?.uls ?? envelope;
    const sleEnvelope = raw.envelopes?.sle ?? envelope;
    const warningLines = report.warnings.length > 0
      ? report.warnings.map((warning) => `* ${warning}`).join("\n")
      : "* Nessun warning.";
    const assumptionLines = report.assumptions.length > 0
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
      markdownTable(
        ["ID", "Caso", "Tipo", "Durata", "Fattore"],
        loadRows(raw),
      ),
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
        ["ID", "SL", "Tipo", "EA", "EI", "GA", "k/gamma", "finale/kdef"],
        stiffnessRows,
      ),
      "",
      "## Inviluppi governanti",
      "",
      markdownTable(
        ["Grandezza", "Risultato", "SL", "Valore", "Stazione"],
        [
          envelopeRow("M max assoluto", ulsEnvelope.maxAbsBendingMoment),
          envelopeRow("V max", ulsEnvelope.maxShearForce),
          envelopeRow("V min", ulsEnvelope.minShearForce),
          envelopeRow("Freccia SLE max assoluta", sleEnvelope.maxAbsVerticalDisplacement),
        ],
      ),
      "",
      "## Reazioni governanti",
      "",
      markdownTable(
        ["Grandezza", "Risultato", "SL", "Supporto", "Valore", "Stazione"],
        [
          reactionEnvelopeRow("Rx max assoluto", envelope.maxAbsHorizontalReaction),
          reactionEnvelopeRow("Ry max assoluto", envelope.maxAbsVerticalReaction),
          reactionEnvelopeRow("Mrz max assoluto", envelope.maxAbsSupportMomentReaction),
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
