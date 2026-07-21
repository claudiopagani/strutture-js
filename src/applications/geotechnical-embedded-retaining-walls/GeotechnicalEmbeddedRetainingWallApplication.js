import { StructuralApplication } from
  "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { EmbeddedRetainingWallAnalysis } from
  "../../domain/geotechnics/index.js";

export class GeotechnicalEmbeddedRetainingWallApplication extends
  StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-embedded-retaining-walls",
      name: "Geotechnical Embedded Retaining Walls",
      description:
        "Staged static or assigned-pseudostatic response of embedded retaining walls on nonlinear pressure-displacement springs.",
      domain: "geotechnics",
      supportedCodes: [
        "method-neutral",
        "staged-beam-on-nonlinear-soil-springs",
        "assigned-pseudostatic-pressure-diagrams",
      ],
      tags: [
        "ground-model",
        "embedded-retaining-wall",
        "excavation",
        "sheet-pile",
        "diaphragm-wall",
        "soldier-pile-wall",
        "ground-anchor",
        "strut",
        "construction-stages",
        "nonlinear-springs",
        "soil-structure-interaction",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "vertical two-dimensional equivalent wall strip only",
          "assigned effective-pressure versus closure curves without cyclic history",
          "Euler-Bernoulli wall with piecewise-constant assigned flexural rigidity",
          "pseudostatic response requires assigned distributed seismic pressure diagrams",
          "ground-anchor design is provided by geotechnical-ground-anchors",
          "global stability and wall/waler structural resistance are separate consuming workflows",
          "basal heave, piping and uplift are outside the selected application scope",
          "no wall inertia, dynamic response, consolidation or nonlinear structural section response",
        ],
      },
    });
  }

  run(input = {}) {
    const analysis = new EmbeddedRetainingWallAnalysis().analyze(input);
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
