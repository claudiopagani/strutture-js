import { StructuralApplication } from
  "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import {
  ShallowFoundationServiceabilityAnalysis,
  ShallowFoundationUltimateLimitStateAnalysis,
} from
  "../../domain/geotechnics/index.js";

export class GeotechnicalShallowFoundationApplication extends
  StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-shallow-foundations",
      name: "Geotechnical Shallow Foundations",
      description:
        "Static ULS resistance and SLS immediate-movement analysis for shallow foundations connected to a GroundModel.",
      domain: "geotechnics",
      supportedCodes: ["method-neutral"],
      tags: [
        "ground-model",
        "shallow-foundation",
        "bearing-capacity",
        "sliding",
        "meyerhof",
        "vesic",
        "effective-area",
        "punch-through",
        "settlement",
        "rotation",
        "soil-stiffness",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "static ULS and immediate SLS only; no normative partial factors or serviceability limits are implicit",
          "horizontal foundation base and level adjacent ground",
          "hydrostatic-horizontal or phreatic-line groundwater only",
          "layered punch-through is limited to a strong layer over an undrained weak layer using the cited 2V:1H model",
          "SLS methods retain their distinct parameter types and fields of validity; time-dependent consolidation and creep are not implemented",
          "embedded-footing passive resistance, uplift and seismic effects are not implemented",
          "the RC footing application consumes assigned geotechnical resistances through a separate orchestrator",
        ],
      },
    });
  }

  run(input = {}) {
    const limitState = input.analysisType ??
      input.designSituation?.limitState ?? "ULS";
    const analysis = limitState === "SLS"
      ? new ShallowFoundationServiceabilityAnalysis().analyze(input)
      : new ShallowFoundationUltimateLimitStateAnalysis().analyze(input);
    return new CalculationResult({
      applicationId: this.id,
      status: analysis.status,
      summary: analysis.summary,
      outputs: analysis.outputs,
      warnings: analysis.warnings,
      assumptions: analysis.assumptions,
      metadata: {
        domain: this.domain,
        ...analysis.metadata,
      },
    });
  }
}
