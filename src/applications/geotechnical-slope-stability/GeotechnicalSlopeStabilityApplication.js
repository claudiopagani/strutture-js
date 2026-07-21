import { StructuralApplication } from
  "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { CircularSlopeStabilityAnalysis } from
  "../../domain/geotechnics/index.js";

export class GeotechnicalSlopeStabilityApplication extends StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-slope-stability",
      name: "Geotechnical Slope Stability",
      description:
        "Static and pseudostatic circular slip-surface analysis with bounded critical-surface search and FHWA ground-anchor interaction for two-dimensional ground sections.",
      domain: "geotechnics",
      supportedCodes: ["method-neutral"],
      tags: [
        "ground-model",
        "slope-stability",
        "limit-equilibrium",
        "spencer",
        "bishop",
        "ordinary-method-of-slices",
        "pseudostatic",
        "circular-slip-surface",
        "ground-anchor",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "plane-strain analysis with circular slip surfaces only",
          "Simplified Bishop and Ordinary Method of Slices are static-only diagnostics",
          "pseudostatic analysis uses Spencer and predicts neither dynamic response nor permanent displacement",
          "straight ground anchors are supported with Spencer; other reinforcement and tension cracks are not implemented",
          "ground-anchor force through a bond zone assumes uniform bond stress and proportional remaining bond length",
          "surface-load inertia is excluded from the pseudostatic action model",
          "critical-surface search is bounded by explicit entry, exit and sagitta ranges",
        ],
      },
    });
  }

  run(input = {}) {
    const analysis = new CircularSlopeStabilityAnalysis().analyze(input);
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
