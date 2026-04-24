import { MasonryPierCapacityCurveComparisonMarkdownRenderer } from "./MasonryPierCapacityCurveComparisonMarkdownRenderer.js";

export const MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION =
  "masonry-wall-openings-pier-capacity-comparison-report/v1";

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

export class MasonryPierCapacityCurveComparisonReportBuilder {
  constructor({
    applicationId = "masonry-wall-openings",
    schemaVersion = MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION,
    metadata = {},
    markdownRenderer = new MasonryPierCapacityCurveComparisonMarkdownRenderer(),
  } = {}) {
    this.applicationId = applicationId;
    this.schemaVersion = schemaVersion;
    this.metadata = { ...metadata };
    this.markdownRenderer = markdownRenderer;
  }

  build({
    model,
    analysisResult,
    metadata = {},
  } = {}) {
    if (!model) {
      throw new Error(
        "MasonryPierCapacityCurveComparisonReportBuilder requires a model.",
      );
    }

    if (!analysisResult) {
      throw new Error(
        "MasonryPierCapacityCurveComparisonReportBuilder requires an analysisResult.",
      );
    }

    const json = this.buildJson({
      model,
      analysisResult,
      metadata,
    });

    return {
      json,
      markdown: this.renderMarkdown(json),
    };
  }

  buildJson({
    model,
    analysisResult,
    metadata = {},
  }) {
    const resultJson =
      typeof analysisResult.toJSON === "function"
        ? analysisResult.toJSON()
        : toPlain(analysisResult);
    const outputs = resultJson.outputs ?? {};
    const reportId = `${model.id}-${outputs.pier?.id ?? "pier"}-capacity-comparison-report`;

    return {
      schemaVersion: this.schemaVersion,
      applicationId: this.applicationId,
      id: reportId,
      title: `Confronto curva di capacita ${outputs.pier?.id ?? model.id}`,
      description:
        "Report sintetico di confronto tra curva di capacita aggregata del maschio e pushover FEM non lineare del corrispondente macroelemento.",
      units: toPlain(model.units ?? null),
      model: {
        id: model.id,
        label: model.label ?? model.id,
        wallCount: model.walls?.length ?? 0,
        openingCount: model.openings?.length ?? 0,
      },
      pier: toPlain(outputs.pier ?? {}),
      aggregated: {
        performance: toPlain(outputs.aggregated?.performanceSummary ?? {}),
        capacityCurve: toPlain(outputs.aggregated?.capacityCurve ?? {}),
      },
      fem: {
        performance: toPlain(outputs.fem?.performanceSummary ?? {}),
        capacityCurve: toPlain(outputs.fem?.capacityCurve ?? {}),
        hingeEvents: toPlain(outputs.fem?.hingeEvents ?? []),
        finalState: toPlain(outputs.fem?.finalState ?? {}),
      },
      comparison: toPlain(outputs.comparison ?? {}),
      reading: toPlain(outputs.reading ?? {}),
      warnings: unique(resultJson.warnings ?? []),
      assumptions: unique(resultJson.assumptions ?? []),
      metadata: {
        ...this.metadata,
        ...metadata,
        resultStatus: resultJson.status,
        comparisonType: resultJson.metadata?.comparisonType ?? null,
        generatedBy: "MasonryPierCapacityCurveComparisonReportBuilder",
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
      "MasonryPierCapacityCurveComparisonReportBuilder requires a markdown renderer with a render() method.",
    );
  }
}
