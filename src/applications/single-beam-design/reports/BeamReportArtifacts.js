function sanitizeFileToken(value) {
  return String(value ?? "beam-report")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "beam-report";
}

export function createBeamReportArtifacts(report, {
  baseName = null,
  includeJson = true,
  includeMarkdown = true,
  jsonSpacing = 2,
} = {}) {
  if (!report?.json) {
    throw new Error("createBeamReportArtifacts requires report.json.");
  }

  if (includeMarkdown && typeof report.markdown !== "string") {
    throw new Error("createBeamReportArtifacts requires report.markdown.");
  }

  const normalizedBaseName = sanitizeFileToken(baseName ?? report.json.id);
  const artifacts = [];

  if (includeJson) {
    artifacts.push({
      kind: "beam-report",
      format: "json",
      fileName: `${normalizedBaseName}.json`,
      mediaType: "application/json",
      content: JSON.stringify(report.json, null, jsonSpacing),
      metadata: {
        reportId: report.json.id,
        title: report.json.title,
      },
    });
  }

  if (includeMarkdown) {
    artifacts.push({
      kind: "beam-report",
      format: "markdown",
      fileName: `${normalizedBaseName}.md`,
      mediaType: "text/markdown",
      content: report.markdown,
      metadata: {
        reportId: report.json.id,
        title: report.json.title,
      },
    });
  }

  return artifacts;
}
