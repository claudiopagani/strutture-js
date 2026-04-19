import { BEAM_REPORT_SCHEMA_VERSION } from "../dto/BeamReportDto.js";
import { BeamReportMarkdownRenderer } from "./BeamReportMarkdownRenderer.js";

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function toPlain(value, seen = new WeakSet()) {
  if (value == null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "function") {
    return {
      type: "function",
      name: value.name || null,
    };
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return {
      type: "circular-reference",
    };
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item, seen));
  }

  if (typeof value.toJSON === "function" && !isPlainObject(value)) {
    return toPlain(value.toJSON(), seen);
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    output[key] = toPlain(item, seen);
  }

  return output;
}

function unique(items) {
  return [...new Set(items.filter((item) => item != null && item !== ""))];
}

function resultEntries(resultMap = {}) {
  return Object.values(resultMap ?? {});
}

function firstAnalysisResult(analysisResult) {
  return (
    resultEntries(analysisResult.combinations)[0] ??
    resultEntries(analysisResult.loadCases)[0] ??
    null
  );
}

function summarizeResult(result) {
  const maxMoment = result.internalForces?.maxAbsBendingMoment;
  const maxMomentY = result.internalForces?.maxAbsBendingMomentY;
  const maxMomentZ = result.internalForces?.maxAbsBendingMomentZ;
  const maxShear = [result.internalForces?.maxShearForce, result.internalForces?.minShearForce]
    .filter(Boolean)
    .reduce((selected, sample) =>
      !selected || Math.abs(sample.v) > Math.abs(selected.v) ? sample : selected,
    null);
  const maxShearY = result.internalForces?.maxAbsShearForceY;
  const maxShearZ = result.internalForces?.maxAbsShearForceZ;
  const maxDeflection = result.displacements?.maxAbsVerticalDisplacement;

  return {
    id: result.id,
    resultType: result.resultType,
    limitState: result.context?.limitState ?? null,
    combinationType: result.context?.combinationType ?? null,
    maxAbsBendingMoment: maxMoment
      ? {
          value: maxMoment.m,
          station: maxMoment.station,
        }
      : null,
    maxAbsBendingMomentY: maxMomentY
      ? {
          value: maxMomentY.mY,
          station: maxMomentY.station,
        }
      : null,
    maxAbsBendingMomentZ: maxMomentZ
      ? {
          value: maxMomentZ.mZ,
          station: maxMomentZ.station,
        }
      : null,
    maxAbsShearForce: maxShear
      ? {
          value: maxShear.v,
          station: maxShear.station,
        }
      : null,
    maxAbsShearForceY: maxShearY
      ? {
          value: maxShearY.vY,
          station: maxShearY.station,
        }
      : null,
    maxAbsShearForceZ: maxShearZ
      ? {
          value: maxShearZ.vZ,
          station: maxShearZ.station,
        }
      : null,
    maxAbsVerticalDisplacement: maxDeflection
      ? {
          value: maxDeflection.uy,
          station: maxDeflection.station,
        }
      : null,
    sectionProperties: toPlain(result.sectionProperties),
  };
}

function sectionRotationDto(analysisResult, model) {
  const reference = firstAnalysisResult(analysisResult);
  const metadata = reference?.sectionProperties?.metadata ?? {};

  return toPlain(
    reference?.context?.sectionRotation ??
      reference?.sectionRotation ??
      metadata.sectionRotation ??
      model?.beamInput?.sectionRotation ??
      {},
  );
}

function principalAxesDto(analysisResult) {
  const reference = firstAnalysisResult(analysisResult);
  const metadata = reference?.sectionProperties?.metadata ?? {};
  const rotation =
    metadata.principalAxes ??
    metadata.sectionRotation ??
    reference?.context?.sectionRotation ??
    reference?.sectionRotation ??
    {};

  return toPlain(rotation);
}

function sectionRigidityDto(analysisResult) {
  const reference = firstAnalysisResult(analysisResult);
  const properties = reference?.sectionProperties ?? {};
  const metadata = properties.metadata ?? {};

  return toPlain({
    sourceResultId: reference?.id ?? null,
    axialRigidity: properties.axialRigidity ?? null,
    flexuralRigidity: properties.flexuralRigidity ?? null,
    flexuralRigidityY:
      properties.flexuralRigidityY ?? metadata.flexuralRigidityY ?? null,
    flexuralRigidityZ:
      properties.flexuralRigidityZ ?? metadata.flexuralRigidityZ ?? null,
    shearRigidity: properties.shearRigidity ?? null,
    shearRigidityY:
      properties.shearRigidityY ?? metadata.shearRigidityY ?? null,
    shearRigidityZ:
      properties.shearRigidityZ ?? metadata.shearRigidityZ ?? null,
    verticalFlexuralRigiditySource:
      metadata.verticalFlexuralRigiditySource ?? null,
    verticalShearRigiditySource:
      metadata.verticalShearRigiditySource ?? null,
  });
}

function envelopeSummaryItem(item) {
  if (!item) {
    return null;
  }

  return {
    resultId: item.resultId ?? null,
    resultType: item.resultType ?? null,
    limitState: item.limitState ?? null,
    combinationType: item.combinationType ?? null,
    quantity: item.quantity ?? null,
    value: item.value ?? null,
    station: item.sample?.station ?? null,
    sample: toPlain(item.sample ?? null),
  };
}

function principalEnvelopeGroup(envelope = {}) {
  return {
    maxAbsBendingMomentY: envelopeSummaryItem(envelope.maxAbsBendingMomentY),
    maxAbsBendingMomentZ: envelopeSummaryItem(envelope.maxAbsBendingMomentZ),
    maxAbsShearForceY: envelopeSummaryItem(envelope.maxAbsShearForceY),
    maxAbsShearForceZ: envelopeSummaryItem(envelope.maxAbsShearForceZ),
  };
}

function principalActionEnvelopeDto(envelopes = {}) {
  return {
    all: principalEnvelopeGroup(envelopes.all ?? {}),
    loadCases: principalEnvelopeGroup(envelopes.loadCases ?? {}),
    combinations: principalEnvelopeGroup(envelopes.combinations ?? {}),
    uls: principalEnvelopeGroup(envelopes.uls ?? {}),
    sle: principalEnvelopeGroup(envelopes.sle ?? {}),
  };
}

function governingCheckFromVerification(verification) {
  const checks = verification?.checks ?? [];

  return checks.reduce((selected, check) => {
    if (!Number.isFinite(check.utilizationRatio)) {
      return selected;
    }

    if (!selected || check.utilizationRatio > selected.utilizationRatio) {
      return check;
    }

    return selected;
  }, null);
}

function collectWarnings(...sources) {
  return unique(
    sources.flatMap((source) => {
      if (!source) {
        return [];
      }

      if (Array.isArray(source)) {
        return source;
      }

      return source.warnings ?? [];
    }),
  );
}

function collectAssumptions(...sources) {
  return unique(
    sources.flatMap((source) => {
      if (!source) {
        return [];
      }

      if (Array.isArray(source)) {
        return source;
      }

      return source.assumptions ?? [];
    }),
  );
}

export class BeamReportBuilder {
  constructor({
    applicationId = "single-beam-design",
    schemaVersion = BEAM_REPORT_SCHEMA_VERSION,
    metadata = {},
    markdownRenderer = new BeamReportMarkdownRenderer(),
  } = {}) {
    this.applicationId = applicationId;
    this.schemaVersion = schemaVersion;
    this.metadata = { ...metadata };
    this.markdownRenderer = markdownRenderer;
  }

  build({
    model,
    analysisResult,
    verificationResult = null,
    metadata = {},
  } = {}) {
    if (!model) {
      throw new Error("BeamReportBuilder requires a model.");
    }

    if (!analysisResult) {
      throw new Error("BeamReportBuilder requires an analysisResult.");
    }

    const json = this.buildJson({
      model,
      analysisResult,
      verificationResult,
      metadata,
    });

    return {
      json,
      markdown: this.renderMarkdown(json),
    };
  }

  buildJson({
    model,
    analysisResult,
    verificationResult = null,
    metadata = {},
  }) {
    const loadCaseSummaries = Object.fromEntries(
      Object.entries(analysisResult.loadCases ?? {}).map(([id, result]) => [
        id,
        summarizeResult(result),
      ]),
    );
    const combinationSummaries = Object.fromEntries(
      Object.entries(analysisResult.combinations ?? {}).map(([id, result]) => [
        id,
        summarizeResult(result),
      ]),
    );
    const verification = verificationResult
      ? toPlain(verificationResult)
      : null;
    const governingCheck = governingCheckFromVerification(verification);
    const warnings = collectWarnings(
      analysisResult,
      verification,
      verification ? [] : ["No structural verification result was provided."],
    );
    const assumptions = collectAssumptions(analysisResult, verification);
    const sectionRotation = sectionRotationDto(analysisResult, model);
    const principalAxes = principalAxesDto(analysisResult);
    const sectionRigidity = sectionRigidityDto(analysisResult);
    const principalActionEnvelopes = principalActionEnvelopeDto(
      analysisResult.envelopes,
    );

    return {
      schemaVersion: this.schemaVersion,
      applicationId: this.applicationId,
      id: model.id,
      title: model.title,
      description: model.description,
      units: toPlain(analysisResult.units ?? model.units),
      model: typeof model.toJSON === "function" ? model.toJSON() : toPlain(model),
      analysis: {
        id: analysisResult.id,
        units: toPlain(analysisResult.units),
        analysisModel: analysisResult.analysisModel,
        loadCaseIds: Object.keys(analysisResult.loadCases ?? {}),
        combinationIds: Object.keys(analysisResult.combinations ?? {}),
        loadCases: loadCaseSummaries,
        combinations: combinationSummaries,
        envelopes: toPlain(analysisResult.envelopes),
        sectionRotation,
        principalAxes,
        sectionRigidity,
        principalActionEnvelopes,
        raw: toPlain(analysisResult),
      },
      verification,
      governing: {
        verification: verification?.outputs?.governing ?? null,
        utilizationRatio: verification?.utilizationRatio ?? null,
        checkId: verification?.metadata?.governingCheckId ?? governingCheck?.id ?? null,
        ulsMoment: toPlain(analysisResult.envelopes?.uls?.maxAbsBendingMoment),
        ulsMomentY: toPlain(
          analysisResult.envelopes?.uls?.maxAbsBendingMomentY,
        ),
        ulsMomentZ: toPlain(
          analysisResult.envelopes?.uls?.maxAbsBendingMomentZ,
        ),
        sleDeflection: toPlain(
          analysisResult.envelopes?.sle?.maxAbsVerticalDisplacement,
        ),
      },
      warnings,
      assumptions,
      metadata: {
        ...this.metadata,
        ...metadata,
        generatedBy: "BeamReportBuilder",
      },
    };
  }

  renderMarkdown(report) {
    if (typeof this.markdownRenderer === "function") {
      return this.markdownRenderer(report);
    }

    if (typeof this.markdownRenderer?.render === "function") {
      return this.markdownRenderer.render(report);
    }

    throw new Error("BeamReportBuilder requires a markdown renderer with a render() method.");
  }

  buildMarkdown(report) {
    return this.renderMarkdown(report);
  }
}
