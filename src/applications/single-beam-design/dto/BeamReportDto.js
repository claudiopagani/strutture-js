// @ts-check

/**
 * @typedef {Object} BeamReportUnitSystem
 * @property {string} force
 * @property {string} length
 */

/**
 * Compact scalar summary used by result cards and tables.
 *
 * @typedef {Object} BeamReportScalarSummary
 * @property {number|null} value
 * @property {number|null} station
 */

/**
 * Single load case or combination summary in report units.
 *
 * @typedef {Object} BeamReportResultSummary
 * @property {string} id
 * @property {string|null} resultType
 * @property {string|null} limitState
 * @property {string|null} combinationType
 * @property {BeamReportScalarSummary|null} maxAbsBendingMoment
 * @property {BeamReportScalarSummary|null} maxAbsBendingMomentY
 * @property {BeamReportScalarSummary|null} maxAbsBendingMomentZ
 * @property {BeamReportScalarSummary|null} maxAbsShearForce
 * @property {BeamReportScalarSummary|null} maxAbsShearForceY
 * @property {BeamReportScalarSummary|null} maxAbsShearForceZ
 * @property {BeamReportScalarSummary|null} maxAbsVerticalDisplacement
 * @property {Record<string, unknown>} sectionProperties
 */

/**
 * FEM analysis block inside a beam report.
 *
 * Summaries are in report units. `raw` contains the complete serialized
 * `SingleBeamAnalysis` result for consumers that need diagrams or samples.
 *
 * @typedef {Object} BeamReportAnalysisDto
 * @property {string} id
 * @property {BeamReportUnitSystem} units
 * @property {string} analysisModel
 * @property {string[]} loadCaseIds
 * @property {string[]} combinationIds
 * @property {Record<string, BeamReportResultSummary>} loadCases
 * @property {Record<string, BeamReportResultSummary>} combinations
 * @property {Record<string, unknown>} envelopes
 * @property {Record<string, unknown>} sectionRotation
 * @property {Record<string, unknown>} principalAxes
 * @property {Record<string, unknown>} sectionRigidity
 * @property {Record<string, unknown>} principalActionEnvelopes
 * @property {Record<string, unknown>} raw
 */

/**
 * @typedef {Object} BeamReportVerificationCheckDto
 * @property {string} id
 * @property {string} [description]
 * @property {number|null} [demand]
 * @property {number|null} [capacity]
 * @property {number|null} [utilizationRatio]
 * @property {boolean} [ok]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * Serialized `VerificationResult` attached to a beam report.
 *
 * @typedef {Object} BeamReportVerificationDto
 * @property {string} applicationId
 * @property {string} status
 * @property {string} summary
 * @property {number|null} utilizationRatio
 * @property {unknown} demand
 * @property {unknown} capacity
 * @property {BeamReportVerificationCheckDto[]} checks
 * @property {Record<string, unknown>} outputs
 * @property {string[]} warnings
 * @property {string[]} assumptions
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef {Object} BeamReportGoverningDto
 * @property {unknown} verification
 * @property {number|null} utilizationRatio
 * @property {string|null} checkId
 * @property {unknown} ulsMoment
 * @property {unknown} ulsMomentY
 * @property {unknown} ulsMomentZ
 * @property {unknown} sleDeflection
 */

/**
 * Public JSON DTO produced by `BeamReportBuilder`.
 *
 * @typedef {Object} BeamReportDto
 * @property {string} schemaVersion
 * @property {string} applicationId
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {BeamReportUnitSystem} units
 * @property {Record<string, unknown>} model
 * @property {BeamReportAnalysisDto} analysis
 * @property {BeamReportVerificationDto|null} verification
 * @property {BeamReportGoverningDto} governing
 * @property {string[]} warnings
 * @property {string[]} assumptions
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef {Object} BeamReportValidationResult
 * @property {boolean} ok
 * @property {string|null} schemaVersion
 * @property {string[]} errors
 */

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

/**
 * Runtime guard for the minimal `beam-report/v1` contract.
 *
 * @param {any} report
 * @returns {BeamReportValidationResult}
 */
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
    requireObject(report.analysis.sectionRotation, "analysis.sectionRotation", errors);
    requireObject(report.analysis.principalAxes, "analysis.principalAxes", errors);
    requireObject(report.analysis.sectionRigidity, "analysis.sectionRigidity", errors);
    requireObject(
      report.analysis.principalActionEnvelopes,
      "analysis.principalActionEnvelopes",
      errors,
    );
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
