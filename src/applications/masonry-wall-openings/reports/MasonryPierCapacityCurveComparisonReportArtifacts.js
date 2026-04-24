function sanitizeFileToken(value) {
  return String(value ?? "masonry-pier-capacity-comparison-report")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "masonry-pier-capacity-comparison-report";
}

export function createMasonryPierCapacityCurveComparisonReportArtifacts(report, {
  baseName = null,
  includeJson = true,
  includeMarkdown = true,
  jsonSpacing = 2,
} = {}) {
  if (!report?.json) {
    throw new Error(
      "createMasonryPierCapacityCurveComparisonReportArtifacts requires report.json.",
    );
  }

  if (includeMarkdown && typeof report.markdown !== "string") {
    throw new Error(
      "createMasonryPierCapacityCurveComparisonReportArtifacts requires report.markdown.",
    );
  }

  const normalizedBaseName = sanitizeFileToken(baseName ?? report.json.id);
  const artifacts = [];

  if (includeJson) {
    artifacts.push({
      kind: "masonry-pier-capacity-comparison-report",
      format: "json",
      fileName: `${normalizedBaseName}.json`,
      mediaType: "application/json",
      content: JSON.stringify(report.json, null, jsonSpacing),
      metadata: {
        schemaVersion: report.json.schemaVersion ?? null,
        reportId: report.json.id,
        title: report.json.title,
      },
    });
  }

  if (includeMarkdown) {
    artifacts.push({
      kind: "masonry-pier-capacity-comparison-report",
      format: "markdown",
      fileName: `${normalizedBaseName}.md`,
      mediaType: "text/markdown",
      content: report.markdown,
      metadata: {
        schemaVersion: report.json.schemaVersion ?? null,
        reportId: report.json.id,
        title: report.json.title,
      },
    });
  }

  return artifacts;
}
