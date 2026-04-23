import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { sanitizeAlignmentOpenings } from "../geometry/sanitizeAlignmentOpenings.js";
import { AlignmentSeismicAggregatedAnalysis } from "./AlignmentSeismicAggregatedAnalysis.js";

const APPLICATION_ID = "masonry-wall-openings";
const DEFAULT_STIFFNESS_TOLERANCE_RATIO = 0.15;
const EPS = 1e-9;

function resolveStiffnessToleranceRatio(options = {}) {
  const candidate =
    options.stiffnessToleranceRatio ??
    options.stiffnessVariationTolerance ??
    options.stiffnessTolerance;

  return Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : DEFAULT_STIFFNESS_TOLERANCE_RATIO;
}

function splitComparisonOptions(options = {}) {
  const {
    stiffnessToleranceRatio,
    stiffnessVariationTolerance,
    stiffnessTolerance,
    stateOfFact,
    stateOfFactOptions,
    design,
    designOptions,
    ...sharedSeismicOptions
  } = options ?? {};

  return {
    stiffnessToleranceRatio: resolveStiffnessToleranceRatio({
      stiffnessToleranceRatio,
      stiffnessVariationTolerance,
      stiffnessTolerance,
    }),
    stateOfFactOptions: {
      ...sharedSeismicOptions,
      ...(stateOfFactOptions ?? stateOfFact ?? {}),
    },
    designOptions: {
      ...sharedSeismicOptions,
      ...(designOptions ?? design ?? {}),
    },
  };
}

function resolveRatio(referenceValue, candidateValue) {
  if (
    !Number.isFinite(referenceValue) ||
    Math.abs(referenceValue) <= EPS ||
    !Number.isFinite(candidateValue)
  ) {
    return null;
  }

  return candidateValue / referenceValue;
}

function resolveVariationRatio(referenceValue, candidateValue) {
  const ratio = resolveRatio(referenceValue, candidateValue);

  return Number.isFinite(ratio) ? ratio - 1 : null;
}

function buildVariationBandCheck({
  id,
  description,
  referenceValue,
  candidateValue,
  toleranceRatio,
}) {
  const ratio = resolveRatio(referenceValue, candidateValue);
  const variationRatio = resolveVariationRatio(referenceValue, candidateValue);
  const ok =
    Number.isFinite(variationRatio) &&
    Math.abs(variationRatio) <= toleranceRatio + EPS;

  return {
    id,
    description,
    criterion: {
      type: "variation-band",
      referenceStage: "state-of-fact",
      candidateStage: "design",
      toleranceRatio: round(toleranceRatio),
    },
    stateOfFactValue: round(referenceValue),
    designValue: round(candidateValue),
    ratio: round(ratio),
    delta: round(candidateValue - referenceValue),
    variationRatio: round(variationRatio),
    variationPercent: round(
      Number.isFinite(variationRatio) ? variationRatio * 100 : null,
    ),
    ok,
  };
}

function buildNonDecreasingCheck({
  id,
  description,
  referenceValue,
  candidateValue,
}) {
  const ratio = resolveRatio(referenceValue, candidateValue);
  const variationRatio = resolveVariationRatio(referenceValue, candidateValue);
  const ok =
    Number.isFinite(referenceValue) &&
    Number.isFinite(candidateValue) &&
    candidateValue >= referenceValue - EPS;

  return {
    id,
    description,
    criterion: {
      type: "non-decreasing",
      referenceStage: "state-of-fact",
      candidateStage: "design",
      minimumRatio: 1,
    },
    stateOfFactValue: round(referenceValue),
    designValue: round(candidateValue),
    ratio: round(ratio),
    delta: round(candidateValue - referenceValue),
    variationRatio: round(variationRatio),
    variationPercent: round(
      Number.isFinite(variationRatio) ? variationRatio * 100 : null,
    ),
    ok,
  };
}

function summarizeSeismicResult(result) {
  const bilinearization = result.outputs?.bilinearization ?? {};
  const capacityCurve = result.outputs?.capacityCurve ?? {};

  return {
    status: result.status,
    summary: result.summary,
    outputs: result.outputs,
    metadata: result.metadata,
    performanceSummary: {
      stage: result.outputs?.stage ?? null,
      topRotation: result.outputs?.topRotation ?? null,
      includeSpandrels: Boolean(result.outputs?.includeSpandrels),
      ks: round(bilinearization.ks),
      Vy: round(bilinearization.Vy),
      du: round(bilinearization.du),
      yieldDisplacement: round(bilinearization.yieldDisplacement),
      maxBaseShear: round(capacityCurve.maxBaseShear),
      ultimateDisplacement: round(capacityCurve.ultimateDisplacement),
      pierCount: result.metadata?.pierCount ?? result.outputs?.piers?.length ?? 0,
      ringFrameCount:
        result.metadata?.ringFrameCount ?? result.outputs?.ringFrames?.length ?? 0,
      contributorCount: result.metadata?.contributorCount ?? null,
    },
  };
}

function signedPercentText(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const roundedValue = round(value, 3);

  return `${roundedValue >= 0 ? "+" : ""}${roundedValue}%`;
}

function buildCheckReading(check) {
  if (!check) {
    return null;
  }

  if (check.id === "stiffness-variation") {
    if (!Number.isFinite(check.variationPercent)) {
      return "La variazione di rigidezza non e valutabile con i dati attuali.";
    }

    if (!check.ok) {
      return `La rigidezza equivalente varia di ${signedPercentText(check.variationPercent)} e supera la banda di confronto ammessa.`;
    }

    if (Math.abs(check.variationPercent) <= EPS) {
      return "La rigidezza equivalente resta sostanzialmente invariata rispetto allo stato di fatto.";
    }

    return `La rigidezza equivalente varia di ${signedPercentText(check.variationPercent)} e resta entro la banda di confronto configurata.`;
  }

  if (check.id === "strength-non-decreasing") {
    if (!Number.isFinite(check.variationPercent)) {
      return "La variazione di resistenza equivalente non e valutabile con i dati attuali.";
    }

    if (!check.ok) {
      return `La resistenza laterale equivalente si riduce di ${signedPercentText(check.variationPercent)} rispetto allo stato di fatto.`;
    }

    if (Math.abs(check.variationPercent) <= EPS) {
      return "La resistenza laterale equivalente resta invariata.";
    }

    return `La resistenza laterale equivalente aumenta di ${signedPercentText(check.variationPercent)}.`;
  }

  if (check.id === "deformability-non-decreasing") {
    if (!Number.isFinite(check.variationPercent)) {
      return "La variazione di deformabilita equivalente non e valutabile con i dati attuali.";
    }

    if (!check.ok) {
      return `La deformabilita equivalente si riduce di ${signedPercentText(check.variationPercent)} rispetto allo stato di fatto.`;
    }

    if (Math.abs(check.variationPercent) <= EPS) {
      return "La deformabilita equivalente resta invariata.";
    }

    return `La deformabilita equivalente aumenta di ${signedPercentText(check.variationPercent)}.`;
  }

  return null;
}

function buildComparisonReading({
  checks,
  status,
  stateOfFactStatus,
  designStatus,
}) {
  const failedChecks = checks.filter((check) => !check.ok);
  let outcome = "accepted";
  let headline =
    "Il progetto rispetta i criteri ante/post configurati per rigidezza, resistenza e deformabilita.";

  if (stateOfFactStatus !== "ok" || designStatus !== "ok") {
    outcome = "provisional";
    headline =
      "Il confronto ante/post e disponibile, ma resta provvisorio perche almeno una delle analisi di base non e in stato ok.";
  } else if (failedChecks.length > 0 || status !== "ok") {
    outcome = "attention-required";
    headline =
      "Il progetto non rispetta tutti i criteri ante/post configurati e richiede una lettura ingegneristica mirata.";
  }

  const messages = checks
    .map((check) => buildCheckReading(check))
    .filter(Boolean);

  if (outcome === "provisional") {
    messages.unshift(
      `Stato analisi di base: stato di fatto ${stateOfFactStatus}, progetto ${designStatus}.`,
    );
  }

  return {
    outcome,
    status,
    headline,
    governingCheckId: failedChecks[0]?.id ?? null,
    failedCheckIds: failedChecks.map((check) => check.id),
    messages,
  };
}

export class AlignmentStateComparisonAnalysis {
  analyze({ alignment, options = {}, sanitizedOpenings = null } = {}) {
    if (!alignment) {
      throw new Error(
        "AlignmentStateComparisonAnalysis requires an alignment model.",
      );
    }

    const warnings = [];
    const assumptions = [
      "The ante/post comparison reuses the same aggregated seismic workflow for both stages so ks, Vy and du are compared on a consistent modeling basis.",
      "The current acceptance criteria follow todo.md: project-stage stiffness must stay within the configured symmetric band around the state-of-fact ks, while equivalent strength Vy and ultimate displacement du must not decrease.",
      "Spandrels remain excluded from this comparison until the equivalent-frame FEM workflow is introduced and validated on pier-only wall alignments.",
    ];
    const {
      stiffnessToleranceRatio,
      stateOfFactOptions,
      designOptions,
    } = splitComparisonOptions(options);
    const resolvedSanitizedOpenings =
      sanitizedOpenings ?? sanitizeAlignmentOpenings({ alignment }).openings;
    const seismicAnalysis = new AlignmentSeismicAggregatedAnalysis();
    const stateOfFactResult = seismicAnalysis.analyze({
      alignment,
      stage: "state-of-fact",
      options: stateOfFactOptions,
      sanitizedOpenings: resolvedSanitizedOpenings,
    });
    const designResult = seismicAnalysis.analyze({
      alignment,
      stage: "design",
      options: designOptions,
      sanitizedOpenings: resolvedSanitizedOpenings,
    });
    const stateBilinearization = stateOfFactResult.outputs?.bilinearization ?? {};
    const designBilinearization = designResult.outputs?.bilinearization ?? {};
    const checks = [
      buildVariationBandCheck({
        id: "stiffness-variation",
        description:
          "Project-stage equivalent stiffness ks stays within the configured ante/post tolerance band relative to the state-of-fact value.",
        referenceValue: stateBilinearization.ks,
        candidateValue: designBilinearization.ks,
        toleranceRatio: stiffnessToleranceRatio,
      }),
      buildNonDecreasingCheck({
        id: "strength-non-decreasing",
        description:
          "Project-stage equivalent strength Vy does not fall below the state-of-fact value.",
        referenceValue: stateBilinearization.Vy,
        candidateValue: designBilinearization.Vy,
      }),
      buildNonDecreasingCheck({
        id: "deformability-non-decreasing",
        description:
          "Project-stage ultimate displacement du does not fall below the state-of-fact value.",
        referenceValue: stateBilinearization.du,
        candidateValue: designBilinearization.du,
      }),
    ];
    const allChecksOk = checks.every((check) => check.ok);

    if (stateOfFactResult.status !== "ok") {
      warnings.push(
        `The state-of-fact aggregated seismic analysis returned status ${stateOfFactResult.status}, so the ante/post comparison should be interpreted as provisional.`,
      );
    }

    if (designResult.status !== "ok") {
      warnings.push(
        `The design aggregated seismic analysis returned status ${designResult.status}, so the ante/post comparison should be interpreted as provisional.`,
      );
    }

    for (const check of checks.filter((candidate) => !candidate.ok)) {
      if (check.id === "stiffness-variation") {
        warnings.push(
          `The project-stage stiffness changes by ${round(Math.abs(check.variationPercent))}% relative to the state-of-fact result, beyond the configured +/-${round(stiffnessToleranceRatio * 100)}% comparison band.`,
        );
        continue;
      }

      if (check.id === "strength-non-decreasing") {
        warnings.push(
          `The project-stage equivalent strength Vy (${round(check.designValue)}) is lower than the state-of-fact value (${round(check.stateOfFactValue)}).`,
        );
        continue;
      }

      if (check.id === "deformability-non-decreasing") {
        warnings.push(
          `The project-stage ultimate displacement du (${round(check.designValue)}) is lower than the state-of-fact value (${round(check.stateOfFactValue)}).`,
        );
      }
    }

    const status =
      stateOfFactResult.status === "ok" &&
      designResult.status === "ok" &&
      allChecksOk
        ? "ok"
        : "not-verified";
    const reading = buildComparisonReading({
      checks,
      status,
      stateOfFactStatus: stateOfFactResult.status,
      designStatus: designResult.status,
    });

    return new CalculationResult({
      applicationId: APPLICATION_ID,
      status,
      summary:
        status === "ok"
          ? "Ante/post aggregated seismic comparison completed: the project stage stays within the configured stiffness tolerance band and does not reduce equivalent strength or deformability."
          : "Ante/post aggregated seismic comparison completed, but one or more acceptance criteria were not satisfied.",
      outputs: {
        criteria: {
          stiffnessToleranceRatio: round(stiffnessToleranceRatio),
          stiffnessTolerancePercent: round(stiffnessToleranceRatio * 100),
          strengthMustNotDecrease: true,
          deformabilityMustNotDecrease: true,
        },
        stateOfFact: summarizeSeismicResult(stateOfFactResult),
        design: summarizeSeismicResult(designResult),
        comparison: {
          topRotation:
            designResult.outputs?.topRotation ??
            stateOfFactResult.outputs?.topRotation ??
            null,
          includeSpandrels:
            Boolean(stateOfFactResult.outputs?.includeSpandrels) ||
            Boolean(designResult.outputs?.includeSpandrels),
          checks,
          ks: checks.find((check) => check.id === "stiffness-variation"),
          Vy: checks.find((check) => check.id === "strength-non-decreasing"),
          du: checks.find(
            (check) => check.id === "deformability-non-decreasing",
          ),
          overall: {
            ok: allChecksOk,
            status,
            failedCheckIds: checks
              .filter((check) => !check.ok)
              .map((check) => check.id),
          },
        },
        reading,
      },
      warnings: uniqueStrings([
        ...warnings,
        ...(stateOfFactResult.warnings ?? []),
        ...(designResult.warnings ?? []),
      ]),
      assumptions: uniqueStrings([
        ...assumptions,
        ...(stateOfFactResult.assumptions ?? []),
        ...(designResult.assumptions ?? []),
      ]),
      metadata: {
        comparisonType: "state-of-fact-vs-design",
        stiffnessToleranceRatio: round(stiffnessToleranceRatio),
        stateOfFactStatus: stateOfFactResult.status,
        designStatus: designResult.status,
      },
    });
  }
}
