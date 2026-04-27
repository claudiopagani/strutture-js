import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import { bilinearizeCapacityCurve } from "./AlignmentCapacityBilinearization.js";
import { AlignmentSeismicAggregatedAnalysis } from "./AlignmentSeismicAggregatedAnalysis.js";
import { MasonryEquivalentFrameBuilder } from "./MasonryEquivalentFrameBuilder.js";
import { createMasonryEquivalentFrameContributorDefinition } from "./MasonryEquivalentFramePushoverInternalForces.js";
import { MasonryEquivalentFramePushoverSolver2D } from "./MasonryEquivalentFramePushoverSolver2D.js";
import { MasonryPierCapacityCurveComparisonAnalysis } from "./MasonryPierCapacityCurveComparisonAnalysis.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });
const DEFAULT_TOP_ROTATION = "free";
const DEFAULT_CONTROL_POINT_COUNT = 120;
const DEFAULT_SAMPLE_COUNT = 6;
const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_MAX_ITERATIONS = 60;
const DEFAULT_YIELD_TOLERANCE = 1e-9;
const DIRECT_MASONRY_MECHANISM_MODEL =
  "equivalent-frame-hinges-and-shear-plateau";
const EPS = 1e-9;

function normalizeTopRotation(value = DEFAULT_TOP_ROTATION) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  const aliases = new Map([
    ["free", "free"],
    ["libera", "free"],
    ["hinged", "free"],
    ["fixed", "fixed"],
    ["fissa", "fixed"],
    ["incastrata", "fixed"],
    ["clamped", "fixed"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(`Unsupported equivalent-frame pushover topRotation option: ${value}.`);
  }

  return resolved;
}

function maxFinite(values = []) {
  const finiteValues = values.filter(Number.isFinite);

  return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function normalizeCurvePoint(point, index, prefix = "point") {
  return {
    id: point.id ?? `${prefix}-${index + 1}`,
    displacement:
      Number.isFinite(point.displacement)
        ? point.displacement
        : point.controlDisplacement,
    baseShear:
      Number.isFinite(point.baseShear) ? point.baseShear : point.force,
  };
}

function normalizeCurvePoints(points = [], prefix = "point") {
  return points.map((point, index) => normalizeCurvePoint(point, index, prefix));
}

function roundCurvePoints(points = []) {
  return points.map((point) => ({
    id: point.id,
    displacement: round(point.displacement),
    baseShear: round(point.baseShear),
  }));
}

function interpolateCurve(points = [], displacement) {
  if (!Number.isFinite(displacement) || points.length === 0) {
    return 0;
  }

  if (displacement <= points[0].displacement + EPS) {
    return points[0].baseShear;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];

    if (displacement > endPoint.displacement + EPS) {
      continue;
    }

    const deltaDisplacement = endPoint.displacement - startPoint.displacement;

    if (deltaDisplacement <= EPS) {
      return endPoint.baseShear;
    }

    const ratio = (displacement - startPoint.displacement) / deltaDisplacement;

    return (
      startPoint.baseShear +
      ratio * (endPoint.baseShear - startPoint.baseShear)
    );
  }

  return points.at(-1)?.baseShear ?? 0;
}

function buildAggregateCapacityCurve(contributors = []) {
  const displacements = [
    ...new Set(
      contributors.flatMap((contributor) =>
        contributor.curvePoints.map((point) => point.displacement),
      ),
    ),
  ]
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  return displacements.map((displacement, index) => ({
    id: `global-point-${index + 1}`,
    displacement,
    baseShear: contributors.reduce(
      (sum, contributor) =>
        sum + interpolateCurve(contributor.curvePoints, displacement),
      0,
    ),
  }));
}

function metricDelta(id, label, aggregatedValue, femValue) {
  const delta =
    Number.isFinite(aggregatedValue) && Number.isFinite(femValue)
      ? femValue - aggregatedValue
      : null;
  const variationPercent =
    Number.isFinite(delta) &&
    Number.isFinite(aggregatedValue) &&
    Math.abs(aggregatedValue) > EPS
      ? (delta / aggregatedValue) * 100
      : null;

  return {
    id,
    label,
    aggregatedValue: round(aggregatedValue),
    femValue: round(femValue),
    delta: round(delta),
    variationPercent: round(variationPercent),
  };
}

function sampleCurveComparison({
  aggregatedCurve,
  femCurve,
  yieldDisplacement,
  ultimateDisplacement,
  sampleCount = DEFAULT_SAMPLE_COUNT,
}) {
  const referenceYieldDisplacement =
    Number.isFinite(yieldDisplacement) && yieldDisplacement >= 0
      ? yieldDisplacement
      : 0;
  const referenceUltimateDisplacement =
    Number.isFinite(ultimateDisplacement) && ultimateDisplacement > EPS
      ? ultimateDisplacement
      : maxFinite(aggregatedCurve.map((point) => point.displacement)) ?? 0;
  const intermediateFractions = Array.from(
    { length: Math.max(1, sampleCount) },
    (_, index) => (index + 1) / (sampleCount + 1),
  );
  const sampleDisplacements = [
    0,
    referenceYieldDisplacement,
    ...intermediateFractions.map((ratio) => ratio * referenceUltimateDisplacement),
    referenceUltimateDisplacement,
  ]
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .filter((value, index, values) =>
      index === 0 || Math.abs(value - values[index - 1]) > 1e-8,
    );

  return sampleDisplacements.map((displacement, index) => {
    const aggregatedBaseShear = interpolateCurve(aggregatedCurve, displacement);
    const femBaseShear = interpolateCurve(femCurve, displacement);
    const delta = femBaseShear - aggregatedBaseShear;
    const variationPercent =
      Math.abs(aggregatedBaseShear) > EPS
        ? (delta / aggregatedBaseShear) * 100
        : null;

    return {
      id: `sample-${index + 1}`,
      displacement: round(displacement),
      aggregatedBaseShear: round(aggregatedBaseShear),
      femBaseShear: round(femBaseShear),
      delta: round(delta),
      variationPercent: round(variationPercent),
    };
  });
}

function buildReading(metricDeltas = []) {
  const metricById = Object.fromEntries(
    metricDeltas.map((metric) => [metric.id, metric]),
  );
  const thresholds = {
    ks: 10,
    Vy: 10,
    du: 5,
  };
  const failedMetric = ["ks", "Vy", "du"].find((metricId) => {
    const variationPercent = metricById[metricId]?.variationPercent;

    return Number.isFinite(variationPercent)
      ? Math.abs(variationPercent) > thresholds[metricId]
      : false;
  });
  const outcome = failedMetric ? "attention" : "consistent";

  return {
    outcome,
    headline:
      outcome === "consistent"
        ? "Il pushover FEM globale dell'allineamento riproduce la curva aggregata con scarti contenuti su rigidezza, resistenza e deformabilita."
        : "Il pushover FEM globale dell'allineamento mostra scarti non trascurabili rispetto alla curva aggregata e richiede una lettura cauta.",
    governingMetricId: failedMetric ?? "aligned-response",
    messages: [
      `Scarto rigidezza ks: ${round(metricById.ks?.variationPercent)}%.`,
      `Scarto resistenza Vy: ${round(metricById.Vy?.variationPercent)}%.`,
      `Scarto deformabilita du: ${round(metricById.du?.variationPercent)}%.`,
    ],
  };
}

function performanceSummaryFromBilinearization(bilinearization, capacityCurvePoints = []) {
  return {
    ks: round(bilinearization?.ks),
    Vy: round(bilinearization?.Vy),
    du: round(bilinearization?.du),
    yieldDisplacement: round(bilinearization?.yieldDisplacement),
    peakBaseShear: round(
      maxFinite(capacityCurvePoints.map((point) => point.baseShear)),
    ),
  };
}

function normalizeRingFrameContribution(contributor = {}) {
  const curvePoints = normalizeCurvePoints(
    contributor.curvePoints ?? [],
    contributor.id ?? "ring-frame",
  );

  return {
    id: contributor.id,
    contributorType: "ring-frame",
    openingId: contributor.openingId ?? null,
    status: contributor.status ?? RESULT_STATUS.OK,
    frameCount: contributor.frameCount ?? 1,
    metadata: contributor.metadata ?? {},
    curvePoints,
    maxBaseShear: round(maxFinite(curvePoints.map((point) => point.baseShear))),
    ultimateDisplacement: round(curvePoints.at(-1)?.displacement),
  };
}

function buildDirectMasonryFrame({
  alignment,
  fullFrame,
  aggregatedPiers = [],
  referenceHorizontalForce = 1,
}) {
  if ((aggregatedPiers ?? []).length === 0) {
    return null;
  }

  const controlNodeId =
    fullFrame.snapshot.metadata?.diaphragmControlNodeId ??
    fullFrame.snapshot.metadata?.topNodeIds?.[0] ??
    null;
  const controlNode = (fullFrame.model.nodes ?? []).find(
    (node) => node.id === controlNodeId,
  );

  if (!controlNode || !fullFrame.dofRegistry) {
    return null;
  }

  const referenceLoadVector = new Array(fullFrame.dofRegistry.size()).fill(0);
  const controlVector = new Array(fullFrame.dofRegistry.size()).fill(0);

  referenceLoadVector[fullFrame.dofRegistry.getIndex(controlNode, "ux")] =
    referenceHorizontalForce;
  controlVector[fullFrame.dofRegistry.getIndex(controlNode, "ux")] = 1;

  return {
    ...fullFrame.model,
    id: `${alignment.id}-equivalent-frame-pushover-direct`,
    dofRegistry: fullFrame.dofRegistry,
    referenceLoadVector,
    controlVector,
    controlNode,
  };
}

function buildDirectContributorConfigs({
  alignment,
  directFrame,
  aggregatedPiers = [],
  topRotation,
}) {
  const aggregatedById = Object.fromEntries(
    aggregatedPiers.map((pier) => [pier.id, pier]),
  );

  return Object.fromEntries(
    (directFrame?.elements ?? [])
      .map((element) => {
        const pier = aggregatedById[element.metadata?.sourcePierId];

        if (!pier) {
          return null;
        }

        return [
          element.id,
          createMasonryEquivalentFrameContributorDefinition({
            alignment,
            pier,
            topRotation,
          }),
        ];
      })
      .filter(Boolean),
  );
}

function normalizeDirectHingeEvent(event, fromFem) {
  const capacityKind = event.capacityKind ?? null;
  const plasticCapacity =
    Number.isFinite(event.plasticCapacity) && capacityKind === "moment"
      ? round(fromFem.moment(event.plasticCapacity))
      : Number.isFinite(event.plasticCapacity) && capacityKind === "force"
        ? round(fromFem.force(event.plasticCapacity))
        : null;

  return {
    id: event.id,
    type: event.type,
    pierId: event.pierId ?? null,
    wallId: event.wallId ?? null,
    position: event.position ?? null,
    sign: event.sign ?? null,
    elementId: event.elementId ?? null,
    sourceRingFrameId: event.sourceRingFrameId ?? null,
    sourceOpeningId: event.sourceOpeningId ?? null,
    role: event.role ?? null,
    capacityKind,
    plasticCapacity,
    plasticMoment: capacityKind === "moment" ? plasticCapacity : null,
    plasticShear: capacityKind === "force" ? plasticCapacity : null,
    failureMode: event.failureMode ?? null,
  };
}

function buildDirectPierResults({
  alignment,
  directFrame,
  directSolverResult,
  masonryPiers = [],
  fromFem,
}) {
  const points = directSolverResult?.points ?? [];
  const elementIdByPierId = Object.fromEntries(
    (directFrame?.elements ?? []).map((element) => [
      element.metadata?.sourcePierId,
      element.id,
    ]),
  );
  const curvesByPierId = Object.fromEntries(
    masonryPiers.map((pier) => [pier.id, []]),
  );

  points.forEach((point, pointIndex) => {
    const displacement = round(fromFem.length(point.controlDisplacement));

    for (const pier of masonryPiers) {
      curvesByPierId[pier.id].push({
        id: `${pier.id}-direct-point-${pointIndex + 1}`,
        displacement,
        baseShear: round(fromFem.force(point.pierBaseShearsById?.[pier.id] ?? 0)),
      });
    }
  });

  return masonryPiers.map((pier) => {
    const capacityCurvePoints = curvesByPierId[pier.id];
    const bilinearization = bilinearizeCapacityCurve({
      points: capacityCurvePoints,
    });
    const elementId = elementIdByPierId[pier.id];
    const rawState = directSolverResult.hingeStatesByElementId?.[elementId] ?? null;
    const hingeEvents = (directSolverResult.hingeEvents ?? [])
      .filter((event) => event.pierId === pier.id)
      .map((event, index) =>
        normalizeDirectHingeEvent(
          {
            ...event,
            id: `${pier.id}-direct-event-${index + 1}`,
          },
          fromFem,
        ),
      );

    return {
      id: pier.id,
      wallId: pier.wallId,
      topRotation: pier.topRotation,
      governingFamily: pier.governingFamily,
      governingMode: pier.governingMode,
      contributorType: "pier",
      sourceModel: "direct-global-frame-pushover",
      performanceSummary: {
        ...performanceSummaryFromBilinearization(bilinearization, capacityCurvePoints),
        hingeCount:
          Number(rawState?.hingeState?.start != null) +
          Number(rawState?.hingeState?.end != null) +
          Number(rawState?.hingeState?.shear != null),
        mechanismModel: DIRECT_MASONRY_MECHANISM_MODEL,
      },
      capacityCurve: {
        units: {
          displacement: alignment.units.length,
          baseShear: alignment.units.force,
        },
        points: capacityCurvePoints,
      },
      hingeEvents,
      finalState: {
        termination: directSolverResult.termination,
        failed: Boolean(rawState?.failed),
        hingeState: {
          start: rawState?.hingeState?.start ?? null,
          end: rawState?.hingeState?.end ?? null,
          shear: rawState?.hingeState?.shear ?? null,
        },
      },
      reading: null,
      curvePoints: capacityCurvePoints,
    };
  });
}

function normalizeFallbackPierResult(result, alignment) {
  return {
    id: result.outputs.pier.id,
    wallId: result.outputs.pier.wallId,
    topRotation: result.outputs.pier.topRotation,
    governingFamily: result.outputs.pier.governingFamily,
    governingMode: result.outputs.pier.governingMode,
    contributorType: "pier",
    sourceModel: "single-pier-fallback",
    performanceSummary: result.outputs.fem.performanceSummary,
    capacityCurve: result.outputs.fem.capacityCurve,
    hingeEvents: result.outputs.fem.hingeEvents,
    finalState: result.outputs.fem.finalState,
    reading: result.outputs.reading,
    curvePoints: normalizeCurvePoints(
      result.outputs.fem.capacityCurve.points ?? [],
      result.outputs.pier.id,
    ),
    units: {
      displacement: alignment.units.length,
      baseShear: alignment.units.force,
    },
  };
}

function fallbackHingeEvents(results = []) {
  return results.flatMap((result) =>
    (result.outputs?.fem?.hingeEvents ?? []).map((event, index) => ({
      id: `${result.outputs.pier.id}-fallback-event-${index + 1}`,
      pierId: result.outputs.pier.id,
      wallId: result.outputs.pier.wallId,
      ...event,
    })),
  );
}

export class AlignmentEquivalentFramePushoverAnalysis {
  constructor({
    aggregatedAnalysis = new AlignmentSeismicAggregatedAnalysis(),
    frameBuilder = new MasonryEquivalentFrameBuilder(),
    frameSolver = new MasonryEquivalentFramePushoverSolver2D(),
    flexuralFrameSolver = null,
    pierComparisonAnalysis = new MasonryPierCapacityCurveComparisonAnalysis(),
  } = {}) {
    this.aggregatedAnalysis = aggregatedAnalysis;
    this.frameBuilder = frameBuilder;
    this.frameSolver = frameSolver ?? flexuralFrameSolver;
    this.pierComparisonAnalysis = pierComparisonAnalysis;
  }

  analyze({
    alignment,
    stage = "design",
    options = {},
    sanitizedOpenings = null,
    extractedMembers = null,
    resolvedAlignmentState = null,
  } = {}) {
    if (!alignment) {
      throw new Error(
        "AlignmentEquivalentFramePushoverAnalysis requires an alignment model.",
      );
    }

    const topRotation = normalizeTopRotation(
      options.topRotation ?? DEFAULT_TOP_ROTATION,
    );
    const includeSpandrels = Boolean(options.includeSpandrels);
    const frame = this.frameBuilder.build({
      alignment,
      stage,
      options: {
        ...options,
        topRotation,
        includeDiaphragm: true,
      },
      sanitizedOpenings,
      extractedMembers,
      resolvedAlignmentState,
    });
    const aggregatedResult = this.aggregatedAnalysis.analyze({
      alignment,
      stage,
      options: {
        ...options,
        topRotation,
        includeSpandrels: false,
      },
      sanitizedOpenings,
      extractedMembers,
      resolvedAlignmentState,
    });
    const aggregatedCurvePoints = normalizeCurvePoints(
      aggregatedResult.outputs?.capacityCurve?.points ?? [],
      "aggregated",
    );
    const aggregatedPiers = aggregatedResult.outputs?.piers ?? [];
    const ringFrameContributions = (aggregatedResult.outputs?.ringFrames ?? [])
      .filter((contributor) => (contributor.curvePoints ?? []).length > 1)
      .map((contributor) => normalizeRingFrameContribution(contributor));
    const explicitRingFrameCount = frame.snapshot.metadata?.ringFrameCount ?? 0;
    const femRingFrameContributions =
      explicitRingFrameCount > 0 ? [] : ringFrameContributions;
    const activeRingFrameCount =
      explicitRingFrameCount > 0
        ? explicitRingFrameCount
        : femRingFrameContributions.length;
    const warnings = [];
    const assumptions = [
      "The whole-alignment non-linear FEM workflow solves each masonry pier directly on the global equivalent frame, with a diaphragm master node tying the top ux DOFs through equal-DOF constraints.",
      "Each masonry pier is represented through a unified macroelement with concentrated end plastic hinges and an internal perfectly plastic shear mechanism, so flexural and shear-governed responses stay in the same non-linear state model.",
      includeSpandrels
        ? "Explicit masonry spandrels are included as linear elastic Timoshenko elements in the global frame; their non-linear limit states are intentionally deferred while declared steel ring frames are solved as explicit plastic-hinge frame elements."
        : "Masonry spandrels are excluded unless includeSpandrels is enabled; declared steel ring frames are solved explicitly in the global FEM model, with legacy aggregated steel curves used only when no explicit ring frame is assembled.",
    ];
    const toFem = createUnitResolver(alignment.units, FEM_UNITS);
    const fromFem = createUnitResolver(FEM_UNITS, alignment.units);
    const controlPointCount = Math.max(
      20,
      Math.round(options.controlPointCount ?? DEFAULT_CONTROL_POINT_COUNT),
    );
    let directFrame = null;
    let directSolverResult = null;
    let directPierResults = [];
    let directMasonryFrameCurvePoints = [];
    let directMasonryFrameBilinearization = null;

    if (aggregatedPiers.length > 0) {
      directFrame = buildDirectMasonryFrame({
        alignment,
        fullFrame: frame,
        aggregatedPiers,
        referenceHorizontalForce: Math.max(
          1,
          toFem.force(
            aggregatedPiers.reduce((sum, pier) => sum + pier.peakBaseShear, 0),
          ),
        ),
      });

      if (directFrame) {
        const contributorConfigs = buildDirectContributorConfigs({
          alignment,
          directFrame,
          aggregatedPiers,
          topRotation,
        });
        const maxControlDisplacement = maxFinite(
          Object.values(contributorConfigs).map(
            (config) => config.failureDisplacement,
          ),
        );

        if (Number.isFinite(maxControlDisplacement) && maxControlDisplacement > EPS) {
          directSolverResult = this.frameSolver.solve({
            frame: directFrame,
            contributorsByElementId: contributorConfigs,
            controlDisplacementIncrement: maxControlDisplacement / controlPointCount,
            maxControlDisplacement,
            tolerance: options.tolerance ?? DEFAULT_TOLERANCE,
            maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
            maxSteps: controlPointCount + 2,
            yieldTolerance: options.yieldTolerance ?? DEFAULT_YIELD_TOLERANCE,
          });
        }
      }
    }

    const directMasonryAvailable =
      directSolverResult != null && (directSolverResult.points?.length ?? 0) > 1;

    if (aggregatedPiers.length > 0 && !directMasonryAvailable) {
      warnings.push(
        "The direct global frame pushover of the masonry alignment could not produce an active response, so this run falls back to the validated single-pier non-linear contributors only as an emergency surrogate.",
      );
    }

    if (directMasonryAvailable) {
      directMasonryFrameCurvePoints = directSolverResult.points.map((point, index) => ({
        id: `direct-frame-point-${index + 1}`,
        displacement: round(fromFem.length(point.controlDisplacement)),
        baseShear: round(fromFem.force(point.baseShear)),
      }));
      directMasonryFrameBilinearization = bilinearizeCapacityCurve({
        points: directMasonryFrameCurvePoints,
      });
      directPierResults = buildDirectPierResults({
        alignment,
        directFrame,
        directSolverResult,
        masonryPiers: aggregatedPiers,
        fromFem,
      });
    }

    const fallbackPierResults = !directMasonryAvailable
      ? aggregatedPiers.map((pier) =>
          this.pierComparisonAnalysis.analyze({
            alignment,
            stage,
            aggregatedResult,
            options: {
              ...options,
              topRotation,
              pierId: pier.id,
            },
          }),
        )
      : [];
    const normalizedFallbackPierResults = fallbackPierResults
      .filter((result) => (result.outputs?.fem?.capacityCurve?.points ?? []).length > 1)
      .map((result) => normalizeFallbackPierResult(result, alignment));
    const activePierResults = (
      directMasonryAvailable ? directPierResults : normalizedFallbackPierResults
    ).sort((left, right) => left.id.localeCompare(right.id));
    const activeContributors = [
      ...(directMasonryAvailable
        ? [
            {
              id: `${alignment.id}-masonry-frame`,
              contributorType: "masonry-frame",
              curvePoints: directMasonryFrameCurvePoints,
            },
          ]
        : activePierResults.map((pier) => ({
            id: pier.id,
            contributorType: "pier",
            curvePoints: pier.curvePoints,
          }))),
      ...femRingFrameContributions,
    ];

    if (activeContributors.length === 0 || aggregatedCurvePoints.length === 0) {
      return new CalculationResult({
        applicationId: "masonry-wall-openings",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary:
          "Equivalent-frame pushover could not assemble any active non-linear contributor for the wall alignment.",
        outputs: {
          stage,
          topRotation,
          equivalentFrame: frame.snapshot,
          controlModel: {
            strategy: directMasonryAvailable
              ? "direct-global-frame-pushover"
              : "single-pier-fallback-aggregate",
            explicitDiaphragmConstraint:
              Boolean(frame.snapshot.metadata?.diaphragmControlNodeId),
            controlNodeId: frame.snapshot.metadata?.diaphragmControlNodeId ?? null,
          },
        },
        warnings: uniqueStrings([
          ...warnings,
          ...frame.warnings,
          ...(aggregatedResult.warnings ?? []),
          ...fallbackPierResults.flatMap((result) => result.warnings ?? []),
        ]),
        assumptions: uniqueStrings([
          ...assumptions,
          ...frame.assumptions,
          ...(aggregatedResult.assumptions ?? []),
          ...fallbackPierResults.flatMap((result) => result.assumptions ?? []),
        ]),
        metadata: {
          analysisType: "equivalent-frame-pushover",
          stage,
          topRotation,
          contributorCount: activeContributors.length,
          activePierCount: activePierResults.length,
          activeRingFrameCount,
          directMasonryPierCount: directPierResults.length,
        },
      });
    }

    const femCurvePoints = buildAggregateCapacityCurve(activeContributors);
    const femBilinearization = bilinearizeCapacityCurve({
      points: femCurvePoints,
      options: {
        dropRatio: options.capacityDropRatio,
      },
    });
    const aggregatedPerformanceSummary = performanceSummaryFromBilinearization(
      aggregatedResult.outputs?.bilinearization,
      aggregatedCurvePoints,
    );
    const femPerformanceSummary = {
      ...performanceSummaryFromBilinearization(femBilinearization, femCurvePoints),
      contributorCount: activeContributors.length,
      activePierCount: activePierResults.length,
      activeRingFrameCount,
      directMasonryPierCount: directPierResults.length,
      hingeCount: round(
        directMasonryAvailable
          ? directSolverResult.points.at(-1)?.hingeCount
          : activePierResults.reduce(
              (sum, result) => sum + (result.performanceSummary?.hingeCount ?? 0),
              0,
            ),
      ),
    };
    const metricDeltas = [
      metricDelta(
        "ks",
        "Rigidezza iniziale ks",
        aggregatedPerformanceSummary.ks,
        femPerformanceSummary.ks,
      ),
      metricDelta(
        "Vy",
        "Taglio equivalente Vy",
        aggregatedPerformanceSummary.Vy,
        femPerformanceSummary.Vy,
      ),
      metricDelta(
        "peakBaseShear",
        "Taglio massimo Vmax",
        aggregatedPerformanceSummary.peakBaseShear,
        femPerformanceSummary.peakBaseShear,
      ),
      metricDelta(
        "du",
        "Spostamento ultimo du",
        aggregatedPerformanceSummary.du,
        femPerformanceSummary.du,
      ),
    ];
    const sampledCurvePoints = sampleCurveComparison({
      aggregatedCurve: aggregatedCurvePoints,
      femCurve: femCurvePoints,
      yieldDisplacement: aggregatedPerformanceSummary.yieldDisplacement,
      ultimateDisplacement: aggregatedPerformanceSummary.du,
      sampleCount: options.sampleCount ?? DEFAULT_SAMPLE_COUNT,
    });
    const reading = buildReading(metricDeltas);
    const hingeEvents = [
      ...(directSolverResult?.hingeEvents ?? []).map((event, index) =>
        normalizeDirectHingeEvent(
          {
            ...event,
            id: `direct-global-event-${index + 1}`,
          },
          fromFem,
        ),
      ),
      ...fallbackHingeEvents(fallbackPierResults).map((event) => ({
        ...event,
        plasticMoment: Number.isFinite(event.plasticMoment)
          ? round(event.plasticMoment)
          : null,
      })),
    ];
    const status =
      femBilinearization.status === RESULT_STATUS.OK && activePierResults.length > 0
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED;

    return new CalculationResult({
      applicationId: "masonry-wall-openings",
      status,
      summary:
        "Whole-alignment equivalent-frame pushover completed by solving the masonry frame directly under a diaphragm master displacement, with each pier represented by the same unified hinge-plus-shear macroelement already validated at single-pier level.",
      outputs: {
        stage,
        topRotation,
        equivalentFrame: frame.snapshot,
        controlModel: {
          strategy: directMasonryAvailable
            ? "direct-global-frame-pushover"
            : "single-pier-fallback-aggregate",
          explicitDiaphragmConstraint:
            Boolean(frame.snapshot.metadata?.diaphragmControlNodeId),
          controlNodeId: frame.snapshot.metadata?.diaphragmControlNodeId ?? null,
          topNodeIds: frame.snapshot.metadata?.topNodeIds ?? [],
          diaphragmNodeIds: frame.snapshot.metadata?.diaphragmNodeIds ?? [],
        },
        aggregated: {
          performanceSummary: aggregatedPerformanceSummary,
          capacityCurve: {
            units: aggregatedResult.outputs?.capacityCurve?.units ?? {
              displacement: alignment.units.length,
              baseShear: alignment.units.force,
            },
            points: roundCurvePoints(aggregatedCurvePoints),
          },
          piers: aggregatedPiers,
          ringFrames: aggregatedResult.outputs?.ringFrames ?? [],
        },
        fem: {
          performanceSummary: femPerformanceSummary,
          masonryFrame:
            directMasonryAvailable
              ? {
                  performanceSummary: performanceSummaryFromBilinearization(
                    directMasonryFrameBilinearization,
                    directMasonryFrameCurvePoints,
                  ),
                  capacityCurve: {
                    units: {
                      displacement: alignment.units.length,
                      baseShear: alignment.units.force,
                    },
                    points: directMasonryFrameCurvePoints,
                  },
                  hingeEvents: hingeEvents.filter(
                    (event) => event.id.startsWith("direct-global-event-"),
                  ),
                  finalState: {
                    loadFactor: round(directSolverResult.finalLoadFactor),
                    termination: directSolverResult.termination,
                    hingeStatesByElementId: Object.fromEntries(
                      Object.entries(directSolverResult.hingeStatesByElementId ?? {}).map(
                        ([elementId, state]) => [
                          elementId,
                          {
                            failed: Boolean(state?.failed),
                            kind: state?.kind ?? "masonry-pier",
                            hingeState: {
                              start: state?.hingeState?.start ?? null,
                              end: state?.hingeState?.end ?? null,
                              shear: state?.hingeState?.shear ?? null,
                            },
                          },
                        ],
                      ),
                    ),
                  },
                }
              : null,
          capacityCurve: {
            units: {
              displacement: alignment.units.length,
              baseShear: alignment.units.force,
            },
            points: roundCurvePoints(femCurvePoints),
          },
          piers: activePierResults.map((pier) => ({
            id: pier.id,
            wallId: pier.wallId,
            topRotation: pier.topRotation,
            governingFamily: pier.governingFamily,
            governingMode: pier.governingMode,
            sourceModel: pier.sourceModel,
            performanceSummary: pier.performanceSummary,
            capacityCurve: pier.capacityCurve,
            hingeEvents: pier.hingeEvents,
            finalState: pier.finalState,
            reading: pier.reading,
          })),
          ringFrameModel:
            explicitRingFrameCount > 0
              ? "explicit-global-frame"
              : "aggregated-steel-pushover",
          ringFrames:
            explicitRingFrameCount > 0
              ? frame.ringFrameFrames ?? []
              : femRingFrameContributions,
          hingeEvents,
        },
        comparison: {
          metrics: metricDeltas,
          sampledCurvePoints,
        },
        reading,
      },
      warnings: uniqueStrings([
        ...warnings,
        ...frame.warnings,
        ...(aggregatedResult.warnings ?? []),
        ...(directSolverResult?.warnings ?? []),
        ...fallbackPierResults.flatMap((result) => result.warnings ?? []),
        ...femBilinearization.warnings,
      ]),
      assumptions: uniqueStrings([
        ...assumptions,
        ...frame.assumptions,
        ...(aggregatedResult.assumptions ?? []),
        ...(directSolverResult?.assumptions ?? []),
        ...fallbackPierResults.flatMap((result) => result.assumptions ?? []),
      ]),
      metadata: {
        analysisType: "equivalent-frame-pushover",
        stage,
        topRotation,
        controlPointCount,
        contributorCount: activeContributors.length,
        activePierCount: activePierResults.length,
        activeRingFrameCount,
        explicitRingFrameCount,
        directMasonryPierCount: directPierResults.length,
        fallbackPierCount: normalizedFallbackPierResults.length,
        generatedCurvePointCount: femCurvePoints.length,
      },
    });
  }
}
