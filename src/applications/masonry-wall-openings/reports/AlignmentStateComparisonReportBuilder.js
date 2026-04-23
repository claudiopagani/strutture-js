import { AlignmentStateComparisonMarkdownRenderer } from "./AlignmentStateComparisonMarkdownRenderer.js";

export const ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION =
  "masonry-wall-openings-state-comparison-report/v1";

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function toPlain(value, seen = new WeakSet()) {
  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
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

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toPlain(item, seen)]),
  );
}

function unique(items) {
  return [...new Set(items.filter((item) => item != null && item !== ""))];
}

export class AlignmentStateComparisonReportBuilder {
  constructor({
    applicationId = "masonry-wall-openings",
    schemaVersion = ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION,
    metadata = {},
    markdownRenderer = new AlignmentStateComparisonMarkdownRenderer(),
  } = {}) {
    this.applicationId = applicationId;
    this.schemaVersion = schemaVersion;
    this.metadata = { ...metadata };
    this.markdownRenderer = markdownRenderer;
  }

  build({
    model,
    comparisonResult,
    metadata = {},
  } = {}) {
    if (!model) {
      throw new Error("AlignmentStateComparisonReportBuilder requires a model.");
    }

    if (!comparisonResult) {
      throw new Error(
        "AlignmentStateComparisonReportBuilder requires a comparisonResult.",
      );
    }

    const json = this.buildJson({
      model,
      comparisonResult,
      metadata,
    });

    return {
      json,
      markdown: this.renderMarkdown(json),
    };
  }

  buildJson({
    model,
    comparisonResult,
    metadata = {},
  }) {
    const resultJson =
      typeof comparisonResult.toJSON === "function"
        ? comparisonResult.toJSON()
        : toPlain(comparisonResult);
    const outputs = resultJson.outputs ?? {};
    const reportId = `${model.id}-state-comparison-report`;

    return {
      schemaVersion: this.schemaVersion,
      applicationId: this.applicationId,
      id: reportId,
      title: `Confronto ante/post ${model.label ?? model.id}`,
      description:
        "Report sintetico del confronto tra stato di fatto e progetto basato sull'analisi sismica aggregata dell'allineamento murario.",
      units: toPlain(model.units ?? null),
      model: {
        id: model.id,
        label: model.label ?? model.id,
        wallCount: model.walls?.length ?? 0,
        openingCount: model.openings?.length ?? 0,
        totalLength:
          typeof model.totalLength === "function"
            ? model.totalLength()
            : null,
        maxHeight:
          typeof model.maxHeight === "function" ? model.maxHeight() : null,
        settings: toPlain(model.settings ?? {}),
      },
      comparison: {
        criteria: toPlain(outputs.criteria ?? {}),
        stageSummaries: {
          stateOfFact: toPlain(outputs.stateOfFact?.performanceSummary ?? {}),
          design: toPlain(outputs.design?.performanceSummary ?? {}),
        },
        checks: toPlain(outputs.comparison?.checks ?? []),
        overall: toPlain(outputs.comparison?.overall ?? {}),
      },
      reading: toPlain(outputs.reading ?? {}),
      warnings: unique(resultJson.warnings ?? []),
      assumptions: unique(resultJson.assumptions ?? []),
      metadata: {
        ...this.metadata,
        ...metadata,
        comparisonType: resultJson.metadata?.comparisonType ?? null,
        resultStatus: resultJson.status,
        generatedBy: "AlignmentStateComparisonReportBuilder",
      },
    };
  }

  renderMarkdown(report) {
    if (typeof this.markdownRenderer === "function") {
      return this.markdownRenderer(report);
    }

    if (typeof this.markdownRenderer?.render === "function") {
      return this.markdownRenderer.render(report);
    }

    throw new Error(
      "AlignmentStateComparisonReportBuilder requires a markdown renderer with a render() method.",
    );
  }

  buildMarkdown(report) {
    return this.renderMarkdown(report);
  }
}
