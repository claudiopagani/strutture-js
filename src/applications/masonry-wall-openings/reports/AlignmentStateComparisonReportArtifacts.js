function sanitizeFileToken(value) {
  return String(value ?? "alignment-state-comparison-report")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "alignment-state-comparison-report";
}

export function createAlignmentStateComparisonReportArtifacts(report, {
  baseName = null,
  includeJson = true,
  includeMarkdown = true,
  jsonSpacing = 2,
} = {}) {
  if (!report?.json) {
    throw new Error(
      "createAlignmentStateComparisonReportArtifacts requires report.json.",
    );
  }

  if (includeMarkdown && typeof report.markdown !== "string") {
    throw new Error(
      "createAlignmentStateComparisonReportArtifacts requires report.markdown.",
    );
  }

  const normalizedBaseName = sanitizeFileToken(baseName ?? report.json.id);
  const artifacts = [];

  if (includeJson) {
    artifacts.push({
      kind: "alignment-state-comparison-report",
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
      kind: "alignment-state-comparison-report",
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
