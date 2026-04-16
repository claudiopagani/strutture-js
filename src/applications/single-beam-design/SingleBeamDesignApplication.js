import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { SingleBeamAnalysis } from "../../domain/beams/SingleBeamAnalysis.js";
import { SingleBeamDesignModel } from "./models/SingleBeamDesignModel.js";
import { BeamReportBuilder } from "./reports/BeamReportBuilder.js";

function normalizeModel(input) {
  if (input instanceof SingleBeamDesignModel) {
    return input;
  }

  return new SingleBeamDesignModel(input);
}

function resultToJson(result) {
  return typeof result?.toJSON === "function" ? result.toJSON() : result;
}

function statusFromVerification(verificationResult) {
  if (!verificationResult) {
    return "ok";
  }

  return verificationResult.status ?? "ok";
}

function collectWarnings(...sources) {
  return [
    ...new Set(
      sources.flatMap((source) => source?.warnings ?? []),
    ),
  ];
}

function collectAssumptions(...sources) {
  return [
    ...new Set(
      sources.flatMap((source) => source?.assumptions ?? []),
    ),
  ];
}

function runVerification({ model, analysisResult }) {
  const verification = model.verification;

  if (!verification) {
    return null;
  }

  if (typeof verification === "function") {
    return verification({
      model,
      analysisResult,
      verificationStations: model.beamInput?.verificationStations ?? null,
    });
  }

  const verifier = verification.verifier ?? verification;
  const input = {
    verificationStations: model.beamInput?.verificationStations ?? null,
    ...(verification.input ?? {}),
    analysisResult,
  };

  if (typeof verifier.verify === "function") {
    return verifier.verify(input);
  }

  if (typeof verifier.run === "function") {
    return verifier.run({
      model: verification.model ?? model,
      analysisResult,
      ...(verification.input ?? {}),
    });
  }

  throw new Error(
    "SingleBeamDesignApplication verification must be a function or expose verify()/run().",
  );
}

export class SingleBeamDesignApplication extends StructuralApplication {
  constructor({
    analysis = new SingleBeamAnalysis(),
    reportBuilder = new BeamReportBuilder(),
    metadata = {},
  } = {}) {
    super({
      id: "single-beam-design",
      name: "Single Beam Design",
      description:
        "End-to-end analysis, verification and reporting workflow for simple beams.",
      domain: "beams",
      supportedCodes: ["NTC2018"],
      tags: ["beam", "fem", "report", "verification"],
      metadata: {
        maturity: "mvp",
        plannedCapabilities: [
          "JSON and Markdown reporting",
          "frontend-ready DTOs",
          "material-specific verification adapters",
          "example library for simple beams",
        ],
        ...metadata,
      },
    });

    this.analysis = analysis;
    this.reportBuilder = reportBuilder;
  }

  run(input = {}) {
    const model = normalizeModel(input.model ?? input);
    const analysisResult =
      input.analysisResult ?? this.analysis.analyze(model.toAnalysisInput());
    const verificationResult = runVerification({
      model,
      analysisResult,
    });
    const report = this.reportBuilder.build({
      model,
      analysisResult,
      verificationResult,
      metadata: input.metadata ?? {},
    });
    const verificationJson = resultToJson(verificationResult);

    return new CalculationResult({
      applicationId: this.id,
      status: statusFromVerification(verificationResult),
      summary:
        "Single beam analysis, material verification and report generation completed.",
      outputs: {
        modelId: model.id,
        analysis: analysisResult,
        verification: verificationJson,
        report,
      },
      warnings: collectWarnings(verificationJson, report.json),
      assumptions: collectAssumptions(verificationJson, report.json),
      metadata: {
        domain: this.domain,
        modelId: model.id,
        reportFormats: ["json", "markdown"],
      },
    });
  }
}
