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

function copyVerificationStations(verificationStations) {
  if (Array.isArray(verificationStations)) {
    return [...verificationStations];
  }

  if (!verificationStations || typeof verificationStations !== "object") {
    return verificationStations ?? null;
  }

  return {
    ...verificationStations,
    userStations: Array.isArray(verificationStations.userStations)
      ? [...verificationStations.userStations]
      : verificationStations.userStations,
    stations: Array.isArray(verificationStations.stations)
      ? [...verificationStations.stations]
      : verificationStations.stations,
    checkStations: Array.isArray(verificationStations.checkStations)
      ? [...verificationStations.checkStations]
      : verificationStations.checkStations,
  };
}

function normalizeStationMode(mode) {
  const normalized = String(mode ?? "all").trim().toLowerCase();
  const aliases = {
    automatic: "auto",
    declared: "combined",
    grid: "auto",
    selected: "combined",
    fem: "all",
    samples: "all",
  };

  return aliases[normalized] ?? normalized;
}

function rawStationValues(options = {}) {
  const raw =
    options.userStations ??
    options.stations ??
    options.checkStations ??
    [];

  if (raw == null) {
    return [];
  }

  return Array.isArray(raw) ? raw : [raw];
}

function stationValue(station) {
  if (station && typeof station === "object") {
    return (
      station.station ??
      station.position ??
      station.x ??
      station.value ??
      station.at ??
      null
    );
  }

  return station;
}

function stationLabel(station, source, index) {
  if (station && typeof station === "object") {
    return station.id ?? station.label ?? `${source}-${index + 1}`;
  }

  return `${source}-${index + 1}`;
}

function entrySpan(entry) {
  return entry.geometry?.length ?? entry.geometry?.horizontalSpan ?? null;
}

function resolveRequestedStation(station, entry, source, index) {
  const span = entrySpan(entry);
  const raw = stationValue(station);
  const label = stationLabel(station, source, index);

  if (raw === "start") {
    return { station: 0, source, label, raw: station };
  }

  if (["end", "span", "length"].includes(raw)) {
    return { station: span, source, label, raw: station };
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return {
      station: null,
      source,
      label,
      raw: station,
      warning: `Verification station ${label} is not numeric and was ignored.`,
    };
  }

  if (Number.isFinite(span) && (value < -1e-12 || value > span + 1e-12)) {
    return {
      station: null,
      source,
      label,
      raw: station,
      warning: `Verification station ${label} at x=${value} lies outside the beam span and was ignored.`,
    };
  }

  return {
    station: Number.isFinite(span) ? Math.min(span, Math.max(0, value)) : value,
    source,
    label,
    raw: station,
  };
}

function stationTolerance(entry, options = {}) {
  const tolerance = Number(options.tolerance ?? options.stationTolerance);

  if (Number.isFinite(tolerance) && tolerance > 0) {
    return tolerance;
  }

  const span = entrySpan(entry);

  return Math.max(Math.abs(span ?? 0) * 1e-8, 1e-9);
}

function sameStation(a, b, tolerance) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function normalizeVerificationStationSettings(verificationStations, entry) {
  if (!verificationStations || verificationStations.enabled === false) {
    return {
      enabled: false,
      mode: "all",
      tolerance: stationTolerance(entry),
      requestedStations: [],
      warnings: [],
      raw: null,
    };
  }

  const options = Array.isArray(verificationStations)
    ? { mode: "user", userStations: verificationStations }
    : verificationStations;
  const explicitStations = rawStationValues(options);
  const hasDeclaredStations =
    explicitStations.length > 0 ||
    options.count != null ||
    options.stationCount != null;
  const mode = normalizeStationMode(
    options.mode ?? (hasDeclaredStations ? "combined" : "all"),
  );
  const tolerance = stationTolerance(entry, options);
  const requestedStations = [];
  const warnings = [];
  const count = options.count ?? options.stationCount ?? null;
  const span = entrySpan(entry);

  if (count != null && ["auto", "combined"].includes(mode)) {
    if (!Number.isInteger(count) || count < 2) {
      warnings.push(
        "verificationStations.count must be an integer greater than or equal to 2.",
      );
    } else if (!Number.isFinite(span)) {
      warnings.push(
        "verificationStations.count was ignored because the beam span is not available.",
      );
    } else {
      for (let index = 0; index < count; index += 1) {
        requestedStations.push({
          station: (span * index) / (count - 1),
          source: "grid",
          label: `grid-${index + 1}`,
          raw: null,
        });
      }
    }
  }

  if (["user", "combined"].includes(mode)) {
    explicitStations.forEach((station, index) => {
      const resolved = resolveRequestedStation(station, entry, "user", index);

      if (resolved.warning) {
        warnings.push(resolved.warning);
      }

      if (Number.isFinite(resolved.station)) {
        requestedStations.push(resolved);
      }
    });
  }

  return {
    enabled: true,
    mode,
    tolerance,
    requestedStations,
    warnings,
    raw: copyVerificationStations(verificationStations),
  };
}

function stationFromItem(item, span) {
  const raw = stationValue(item);

  if (raw === "start") {
    return 0;
  }

  if (["end", "span", "length"].includes(raw)) {
    return span;
  }

  const value = Number(raw);

  return Number.isFinite(value) ? value : null;
}

function supportMatches(entry, sample, tolerance) {
  const span = entrySpan(entry);

  return (entry.supports ?? []).some((support) =>
    sameStation(stationFromItem(support, span), sample.station, tolerance),
  );
}

function pointLoadMatches(entry, sample, tolerance) {
  const span = entrySpan(entry);

  return (entry.loads ?? []).some((load) => {
    const type = String(load.type ?? "").toLowerCase();

    if (!["point", "nodal", "force", "moment"].includes(type)) {
      return false;
    }

    return sameStation(stationFromItem(load, span), sample.station, tolerance);
  });
}

function criticalMatches(entry, sample, tolerance) {
  const forces = entry.internalForces ?? {};
  const matches = [];

  if (sameStation(forces.maxAbsBendingMoment?.station, sample.station, tolerance)) {
    matches.push("critical-bending");
  }

  if (
    sameStation(forces.maxShearForce?.station, sample.station, tolerance) ||
    sameStation(forces.minShearForce?.station, sample.station, tolerance)
  ) {
    matches.push("critical-shear");
  }

  return matches;
}

function unique(values) {
  return [...new Set(values)];
}

function sampleStationMetadata(entry, sample, settings) {
  const requestedMatches = settings.requestedStations.filter((station) =>
    sameStation(station.station, sample.station, settings.tolerance),
  );
  const criticalRoles = criticalMatches(entry, sample, settings.tolerance);
  const roles = [];

  if (requestedMatches.some((station) => station.source === "user")) {
    roles.push("verification-user");
  }

  if (requestedMatches.some((station) => station.source === "grid")) {
    roles.push("verification-grid");
  }

  if (supportMatches(entry, sample, settings.tolerance)) {
    roles.push("support");
  }

  if (pointLoadMatches(entry, sample, settings.tolerance)) {
    roles.push("point-load");
  }

  roles.push(...criticalRoles);

  if (roles.length === 0) {
    roles.push("fem-sample");
  }

  const uniqueRoles = unique(roles);
  const isRequestedStation = requestedMatches.length > 0;
  const isCriticalStation = criticalRoles.length > 0;
  const isUserStation = requestedMatches.some((station) => station.source === "user");
  const isGridStation = requestedMatches.some((station) => station.source === "grid");
  const stationSource = isUserStation
    ? "user"
    : isGridStation
      ? "grid"
      : isCriticalStation
        ? "critical"
        : uniqueRoles.includes("support")
          ? "support"
          : uniqueRoles.includes("point-load")
            ? "point-load"
            : "fem-sample";

  return {
    stationSource,
    stationRole: uniqueRoles.join("+"),
    stationRoles: uniqueRoles,
    stationSelectionMode: settings.mode,
    isRequestedStation,
    isUserStation,
    isGridStation,
    isCriticalStation,
    requestedStationIds: requestedMatches.map((station) => station.label),
    stationTolerance: settings.tolerance,
  };
}

function selectVerificationSamples(entry, settings) {
  const samples = entry.internalForces?.samples ?? [];
  const records = samples.map((sample) => ({
    sample,
    stationMetadata: sampleStationMetadata(entry, sample, settings),
  }));
  const warnings = [...settings.warnings];
  const selectDeclared =
    ["user", "combined", "auto"].includes(settings.mode) &&
    settings.requestedStations.length > 0;

  for (const station of settings.requestedStations) {
    const found = records.some((record) =>
      sameStation(record.sample.station, station.station, settings.tolerance),
    );

    if (!found) {
      warnings.push(
        `Verification station ${station.label} at x=${station.station} was requested but no FEM sample was found.`,
      );
    }
  }

  if (!settings.enabled || settings.mode === "all") {
    return { records, warnings };
  }

  if (settings.mode === "critical") {
    const selected = records.filter(
      (record) => record.stationMetadata.isCriticalStation,
    );

    if (selected.length === 0 && samples.length > 0) {
      warnings.push(
        `No critical FEM station was selected for result ${entry.id}.`,
      );
    }

    return { records: selected, warnings };
  }

  if (selectDeclared) {
    const selected = records.filter(
      (record) => record.stationMetadata.isRequestedStation,
    );

    if (selected.length === 0 && samples.length > 0) {
      warnings.push(
        `No requested verification station was selected for result ${entry.id}.`,
      );
    }

    return { records: selected, warnings };
  }

  return { records, warnings };
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
    verificationStations = null,
    metadata = {},
  } = {}) {
    this.applicationId = applicationId;
    this.sectionVerifier = sectionVerifier;
    this.includeLoadCases = includeLoadCases;
    this.limitStates = normalizeLimitStates(limitStates);
    this.verificationStations = copyVerificationStations(verificationStations);
    this.metadata = { ...metadata };
  }

  verify({
    analysisResult,
    sectionVerifier = this.sectionVerifier,
    includeLoadCases = this.includeLoadCases,
    limitStates = this.limitStates,
    verificationStations = this.verificationStations,
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
      const stationSettings = normalizeVerificationStationSettings(
        verificationStations,
        entry,
      );
      const selection = selectVerificationSamples(entry, stationSettings);

      warnings.push(...selection.warnings);

      for (const { sample, stationMetadata } of selection.records) {
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
              stationMetadata,
              sectionProperties: entry.sectionProperties,
              units: entry.units ?? analysisResult.units,
            },
          }),
          {
            resultId: entry.id,
            resultType: entry.resultType,
            station: sample.station,
            limitState: entry.context?.limitState ?? null,
            ...stationMetadata,
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
              ...stationMetadata,
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
        verificationStations: copyVerificationStations(verificationStations),
      },
    });
  }
}

export function verifyBeamSectionActions(options = {}) {
  return new BeamSectionActionVerifier(options).verify(options);
}
