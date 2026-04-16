export const BEAM_REPORT_SCHEMA_VERSION = "beam-report/v1";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireField(value, path, errors) {
  if (value == null) {
    errors.push(`${path} is required.`);
  }
}

function requireArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
  }
}

function requireObject(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object.`);
  }
}

export function validateBeamReportDto(report) {
  const errors = [];

  requireObject(report, "report", errors);

  if (!isPlainObject(report)) {
    return {
      ok: false,
      schemaVersion: null,
      errors,
    };
  }

  if (report.schemaVersion !== BEAM_REPORT_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${BEAM_REPORT_SCHEMA_VERSION}.`,
    );
  }

  requireField(report.applicationId, "applicationId", errors);
  requireField(report.id, "id", errors);
  requireField(report.title, "title", errors);
  requireObject(report.units, "units", errors);
  requireObject(report.model, "model", errors);
  requireObject(report.analysis, "analysis", errors);
  requireObject(report.governing, "governing", errors);
  requireArray(report.warnings, "warnings", errors);
  requireArray(report.assumptions, "assumptions", errors);
  requireObject(report.metadata, "metadata", errors);

  if (isPlainObject(report.analysis)) {
    requireArray(report.analysis.loadCaseIds, "analysis.loadCaseIds", errors);
    requireArray(report.analysis.combinationIds, "analysis.combinationIds", errors);
    requireObject(report.analysis.loadCases, "analysis.loadCases", errors);
    requireObject(report.analysis.combinations, "analysis.combinations", errors);
    requireObject(report.analysis.envelopes, "analysis.envelopes", errors);
    requireObject(report.analysis.raw, "analysis.raw", errors);
  }

  if (report.verification != null) {
    requireObject(report.verification, "verification", errors);

    if (isPlainObject(report.verification)) {
      requireField(report.verification.applicationId, "verification.applicationId", errors);
      requireField(report.verification.status, "verification.status", errors);
      requireArray(report.verification.checks, "verification.checks", errors);
      requireObject(report.verification.outputs, "verification.outputs", errors);
      requireArray(report.verification.warnings, "verification.warnings", errors);
      requireArray(report.verification.assumptions, "verification.assumptions", errors);
      requireObject(report.verification.metadata, "verification.metadata", errors);
    }
  }

  return {
    ok: errors.length === 0,
    schemaVersion: report.schemaVersion ?? null,
    errors,
  };
}
