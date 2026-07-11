import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { DEFAULT_RC_SLE_MODULAR_RATIO } from "../../reinforced-concrete-sections/serviceabilityDefaults.js";
import { CrackedSectionDeflectionAnalysis } from "../analysis/CrackedSectionDeflectionAnalysis.js";

const BEAM_UNITS = Object.freeze({ force: "kN", length: "m" });

const SCA_DEFLECTION_SYSTEMS = Object.freeze({
  simpleBeam: Object.freeze({
    id: "simpleBeam",
    slendernessSystem: "simple_span",
    momentShape: "simple-span-parabolic",
    supports: [
      { id: "start", station: 0, restraints: { ux: true, uy: true, rz: false } },
      { id: "end", station: 1, restraints: { ux: false, uy: true, rz: false } },
    ],
  }),
  simple_span: Object.freeze({
    id: "simple_span",
    slendernessSystem: "simple_span",
    momentShape: "simple-span-parabolic",
    supports: [
      { id: "start", station: 0, restraints: { ux: true, uy: true, rz: false } },
      { id: "end", station: 1, restraints: { ux: false, uy: true, rz: false } },
    ],
  }),
  cantilever: Object.freeze({
    id: "cantilever",
    slendernessSystem: "cantilever",
    momentShape: "cantilever-linear",
    supports: [
      { id: "fixed", station: 0, restraints: { ux: true, uy: true, rz: true } },
    ],
  }),
  continuousEndSpan: Object.freeze({
    id: "continuousEndSpan",
    slendernessSystem: "continuous_end_span",
    momentShape: "simple-span-parabolic",
    supports: [
      { id: "start", station: 0, restraints: { ux: true, uy: true, rz: false } },
      { id: "end", station: 1, restraints: { ux: false, uy: true, rz: false } },
    ],
  }),
  continuousInternalSpan: Object.freeze({
    id: "continuousInternalSpan",
    slendernessSystem: "continuous_internal_span",
    momentShape: "simple-span-parabolic",
    supports: [
      { id: "start", station: 0, restraints: { ux: true, uy: true, rz: false } },
      { id: "end", station: 1, restraints: { ux: false, uy: true, rz: false } },
    ],
  }),
});

function parseLocaleNumber(value, fallback = null) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(",", "."));

  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveInteger(value, fallback) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? "").trim(), 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveCombinationType(value) {
  const normalized = String(value ?? "rare")
    .trim()
    .toLowerCase();

  if (["quasipermanent", "quasi-permanent", "quasi_permanent", "qp"].includes(normalized)) {
    return "SLE_QUASI_PERMANENT";
  }

  if (["frequent", "frequente"].includes(normalized)) {
    return "SLE_FREQUENT";
  }

  return "SLE_RARE";
}

function resolveDeflectionSystem(value) {
  return SCA_DEFLECTION_SYSTEMS[value] ?? SCA_DEFLECTION_SYSTEMS.simpleBeam;
}

function supportStationsForSpan(system, span) {
  return system.supports.map((support) => ({
    ...support,
    station: support.station * span,
    restraints: { ...support.restraints },
  }));
}

function momentAtRatio({ ratio, maxMoment, momentShape }) {
  if (momentShape === "cantilever-linear") {
    return maxMoment * (1 - ratio);
  }

  return maxMoment * 4 * ratio * (1 - ratio);
}

export function createScaServiceDeflectionAnalysisResult({
  spanM,
  maxMomentKnm,
  axialForceKn = 0,
  structuralSystem = "simpleBeam",
  stationCount = 17,
  combinationType = "SLE_RARE",
  id = "sca-service-deflection",
} = {}) {
  if (!Number.isFinite(spanM) || spanM <= 0) {
    throw new Error("SCA service deflection requires a positive spanM.");
  }

  if (!Number.isFinite(maxMomentKnm)) {
    throw new Error("SCA service deflection requires a finite maxMomentKnm.");
  }

  const system = resolveDeflectionSystem(structuralSystem);
  const count = Math.max(3, stationCount);
  const samples = Array.from({ length: count }, (_, index) => {
    const ratio = index / Math.max(1, count - 1);

    return {
      station: spanM * ratio,
      n: axialForceKn,
      m: momentAtRatio({
        ratio,
        maxMoment: maxMomentKnm,
        momentShape: system.momentShape,
      }),
    };
  });

  return {
    units: BEAM_UNITS,
    combinations: {
      [id]: {
        id,
        resultType: "sca-service-moment-profile",
        units: BEAM_UNITS,
        context: {
          limitState: "SLE",
          combinationType,
        },
        geometry: {
          length: spanM,
        },
        supports: supportStationsForSpan(system, spanM),
        internalForces: {
          samples,
        },
      },
    },
    metadata: {
      source: "sca-service-deflection-adapter",
      structuralSystem: system.id,
      momentShape: system.momentShape,
      maxMomentKnm,
      spanM,
      stationCount: count,
    },
  };
}

function buildServiceability({ analysisState = {}, serviceability = {} }) {
  const system = resolveDeflectionSystem(
    analysisState.deflectionStructuralSystem,
  );
  const deflection = {
    ...(serviceability.deflection ?? {}),
    slendernessSystem:
      serviceability.deflection?.slendernessSystem ??
      serviceability.slendernessSystem ??
      system.slendernessSystem,
    modularRatio: parseLocaleNumber(
      analysisState.modularRatio,
      serviceability.deflection?.modularRatio ??
        serviceability.modularRatio ??
        DEFAULT_RC_SLE_MODULAR_RATIO,
    ),
    creepCoefficient: parseLocaleNumber(
      analysisState.deflectionCreepCoefficient,
      serviceability.deflection?.creepCoefficient ??
        serviceability.creepCoefficient ??
        2,
    ),
    limitRatio: parseLocaleNumber(
      analysisState.deflectionLimitRatio,
      serviceability.deflection?.limitRatio ??
        serviceability.deflectionLimitRatio ??
        250,
    ),
  };

  return {
    ...serviceability,
    deflection,
  };
}

function summarizeForSca({ result, source, analysisState }) {
  const combinations = result.outputs?.combinations ?? [];
  const primaryCombination =
    combinations.find(
      (combination) =>
        combination.combinationType ===
        resolveCombinationType(analysisState.serviceCombination),
    ) ??
    combinations[0] ??
    null;

  return {
    kind: "serviceDeflection",
    applicationId: result.applicationId,
    status: result.status,
    summary: result.summary,
    utilizationRatio: result.utilizationRatio,
    demand: result.demand,
    capacity: result.capacity,
    checks: result.checks,
    outputs: {
      ...result.outputs,
      analysisType: "serviceDeflection",
      source,
      combination: primaryCombination,
      points: primaryCombination?.points ?? [],
      maxAbsDeflection: primaryCombination?.maxAbsDeflection ?? null,
      governingStation: primaryCombination?.governingStation ?? null,
      deflectionLimit: primaryCombination?.deflectionLimit ?? null,
      mcr: primaryCombination?.mcr ?? null,
      mcrPositive: primaryCombination?.mcrPositive ?? null,
      mcrNegative: primaryCombination?.mcrNegative ?? null,
      hyperstatic: primaryCombination?.hyperstatic ?? { active: false },
      crackedPointCount: primaryCombination?.crackedPointCount ?? null,
      maxZeta: primaryCombination?.maxZeta ?? null,
      fiberCount: result.outputs?.performance?.targetFiberCount ?? null,
      targetFiberCount: result.outputs?.performance?.targetFiberCount ?? null,
    },
    warnings: result.warnings,
    assumptions: result.assumptions,
    metadata: {
      ...result.metadata,
      analysisType: "serviceDeflection",
      source,
    },
  };
}

export function runScaRcDeflectionAnalysis({
  sectionBuild = null,
  analysisState = {},
  analysisResult = null,
  section = sectionBuild?.section ?? null,
  concreteMaterial =
    sectionBuild?.materials?.concreteMaterial ?? section?.concreteMaterial,
  reinforcementMaterial =
    sectionBuild?.materials?.reinforcementMaterial ??
    section?.reinforcementMaterial,
  serviceability = {},
  mesh = null,
  solver = null,
  performanceProfile = "interactive",
  stationCount = null,
  output = null,
  code = "NTC2018",
} = {}) {
  if (!section?.concreteSection) {
    return {
      kind: "serviceDeflection",
      applicationId: "rc-cracked-deflection",
      status: RESULT_STATUS.NOT_IMPLEMENTED,
      summary:
        "SCA service deflection requires a reinforced concrete section.",
      checks: [],
      outputs: {},
      warnings: [
        "No reinforced concrete section was provided to the SCA deflection adapter.",
      ],
      assumptions: [],
      metadata: { source: "sca-service-deflection-adapter" },
    };
  }

  const spanM = parseLocaleNumber(analysisState.deflectionSpanM, null);
  const maxMomentKnm = parseLocaleNumber(
    analysisState.deflectionMEdKnm ?? analysisState.mxEdKnm ?? analysisState.mEdKnm,
    null,
  );
  const compressionKn = parseLocaleNumber(analysisState.nEdCompressionKn, 0);
  const combinationType = resolveCombinationType(
    analysisState.serviceCombination,
  );

  if (
    !analysisResult &&
    (!Number.isFinite(spanM) ||
      spanM <= 0 ||
      !Number.isFinite(maxMomentKnm))
  ) {
    return {
      kind: "serviceDeflection",
      applicationId: "rc-cracked-deflection",
      status: RESULT_STATUS.NOT_ANALYZED,
      summary:
        "SCA service deflection requires span and service moment inputs.",
      checks: [],
      outputs: {},
      warnings: [
        "No beam analysis result was provided and the simplified SCA deflection inputs are incomplete.",
      ],
      assumptions: [],
      metadata: { source: "sca-service-deflection-adapter" },
    };
  }

  const syntheticAnalysisResult =
    analysisResult ??
    createScaServiceDeflectionAnalysisResult({
      spanM,
      maxMomentKnm,
      axialForceKn: -compressionKn,
      structuralSystem: analysisState.deflectionStructuralSystem,
      stationCount:
        stationCount ??
        parsePositiveInteger(analysisState.deflectionStationCount, 17),
      combinationType,
    });
  const targetFiberCount = parsePositiveInteger(
    analysisState.targetFiberCount,
    null,
  );
  const meshOptions = {
    ...(targetFiberCount == null ? {} : { targetFiberCount }),
    ...(mesh ?? {}),
  };
  const result = new CrackedSectionDeflectionAnalysis({
    code,
    metadata: {
      source: "sca-service-deflection-adapter",
    },
  }).analyze({
    beamId: analysisState.id ?? "sca-service-deflection",
    analysisResult: syntheticAnalysisResult,
    section,
    concreteMaterial,
    reinforcementMaterial,
    serviceability: buildServiceability({ analysisState, serviceability }),
    mesh: meshOptions,
    solver: solver ?? {},
    performanceProfile,
    output: output ?? {},
  });

  return summarizeForSca({
    result,
    source: analysisResult
      ? "beam-analysis-result"
      : "synthetic-service-moment-profile",
    analysisState,
  });
}
