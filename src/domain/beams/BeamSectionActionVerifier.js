import { VerificationResult } from "../../core/results/VerificationResult.js";

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function entriesFromResults(analysisResult, includeLoadCases) {
  const combinations = Object.values(analysisResult?.combinations ?? {});

  if (combinations.length > 0) {
    return combinations;
  }

  return includeLoadCases ? Object.values(analysisResult?.loadCases ?? {}) : [];
}

function normalizeLimitStates(limitStates) {
  if (limitStates == null) {
    return null;
  }

  return new Set(
    (Array.isArray(limitStates) ? limitStates : [limitStates]).map((limitState) =>
      String(limitState).toUpperCase(),
    ),
  );
}

function normalizeActionVerification(raw, fallback = {}) {
  const checks = raw?.checks ?? [];
  const utilizationRatio =
    raw?.utilizationRatio ??
    checks.reduce(
      (max, check) =>
        isFiniteNumber(check.utilizationRatio) &&
        check.utilizationRatio > max
          ? check.utilizationRatio
          : max,
      null,
    );

  return {
    status:
      raw?.status ??
      (isFiniteNumber(utilizationRatio) && utilizationRatio <= 1
        ? "ok"
        : "not-verified"),
    utilizationRatio,
    demand: raw?.demand ?? null,
    capacity: raw?.capacity ?? null,
    checks,
    warnings: raw?.warnings ?? [],
    assumptions: raw?.assumptions ?? [],
    metadata: {
      ...fallback,
      ...raw?.metadata,
    },
  };
}

function governingResult(results) {
  return results.reduce((selected, current) => {
    if (!isFiniteNumber(current.utilizationRatio)) {
      return selected;
    }

    if (!selected || current.utilizationRatio > selected.utilizationRatio) {
      return current;
    }

    return selected;
  }, null);
}

export class BeamSectionActionVerifier {
  constructor({
    applicationId = "beam-section-actions",
    sectionVerifier = null,
    includeLoadCases = true,
    limitStates = null,
    metadata = {},
  } = {}) {
    this.applicationId = applicationId;
    this.sectionVerifier = sectionVerifier;
    this.includeLoadCases = includeLoadCases;
    this.limitStates = normalizeLimitStates(limitStates);
    this.metadata = { ...metadata };
  }

  verify({
    analysisResult,
    sectionVerifier = this.sectionVerifier,
    includeLoadCases = this.includeLoadCases,
    limitStates = this.limitStates,
    context = {},
  } = {}) {
    if (!analysisResult) {
      throw new Error("BeamSectionActionVerifier requires an analysisResult.");
    }

    if (!sectionVerifier) {
      throw new Error("BeamSectionActionVerifier requires a sectionVerifier.");
    }

    const verifySectionActions =
      typeof sectionVerifier === "function"
        ? sectionVerifier
        : sectionVerifier.verifySectionActions?.bind(sectionVerifier);

    if (typeof verifySectionActions !== "function") {
      throw new Error(
        "sectionVerifier must be a function or expose verifySectionActions().",
      );
    }

    const requestedLimitStates =
      limitStates instanceof Set ? limitStates : normalizeLimitStates(limitStates);
    const entries = entriesFromResults(analysisResult, includeLoadCases).filter(
      (entry) =>
        !requestedLimitStates ||
        requestedLimitStates.has(String(entry.context?.limitState ?? "").toUpperCase()),
    );
    const stationResults = [];
    const checks = [];
    const warnings = [];
    const assumptions = [];

    for (const entry of entries) {
      for (const sample of entry.internalForces?.samples ?? []) {
        const normalized = normalizeActionVerification(
          verifySectionActions({
            nEd: sample.n,
            vEd: sample.v,
            mEd: sample.m,
            x: sample.station,
            station: sample.station,
            sample,
            context: {
              ...context,
              analysisResult,
              result: entry,
              resultId: entry.id,
              resultType: entry.resultType,
              limitState: entry.context?.limitState ?? null,
              combinationType: entry.context?.combinationType ?? null,
              sectionProperties: entry.sectionProperties,
              units: entry.units ?? analysisResult.units,
            },
          }),
          {
            resultId: entry.id,
            resultType: entry.resultType,
            station: sample.station,
            limitState: entry.context?.limitState ?? null,
          },
        );

        stationResults.push(normalized);
        warnings.push(...normalized.warnings);
        assumptions.push(...normalized.assumptions);
        checks.push(
          ...normalized.checks.map((check) => ({
            ...check,
            metadata: {
              resultId: entry.id,
              resultType: entry.resultType,
              station: sample.station,
              limitState: entry.context?.limitState ?? null,
              ...check.metadata,
            },
          })),
        );
      }
    }

    const governing = governingResult(stationResults);

    return new VerificationResult({
      applicationId: this.applicationId,
      status:
        stationResults.length > 0 &&
        stationResults.every((result) => result.status === "ok")
          ? "ok"
          : "not-verified",
      summary: "Section action verification along beam FEM samples.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        stationResultCount: stationResults.length,
        checkCount: checks.length,
        governing: governing
          ? {
              utilizationRatio: governing.utilizationRatio,
              demand: governing.demand,
              capacity: governing.capacity,
              metadata: { ...governing.metadata },
            }
          : null,
      },
      warnings: [...new Set(warnings)],
      assumptions: [...new Set(assumptions)],
      metadata: {
        ...this.metadata,
        resultCount: entries.length,
        limitStates: requestedLimitStates ? [...requestedLimitStates] : null,
      },
    });
  }
}

export function verifyBeamSectionActions(options = {}) {
  return new BeamSectionActionVerifier(options).verify(options);
}
