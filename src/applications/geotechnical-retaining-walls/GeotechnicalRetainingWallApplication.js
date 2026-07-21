import { StructuralApplication } from
  "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RetainingWallAnalysis } from "../../domain/geotechnics/index.js";

export class GeotechnicalRetainingWallApplication extends StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-retaining-walls",
      name: "Geotechnical Retaining Walls",
      description:
        "Method-neutral 2D retaining-wall actions, rigid-body stability, compression-only base contact and geotechnical module coupling.",
      domain: "geotechnics",
      supportedCodes: ["method-neutral"],
      tags: [
        "ground-model",
        "retaining-wall",
        "earth-pressure",
        "sliding",
        "overturning",
        "bearing-capacity",
        "base-uplift",
        "pseudostatic",
        "structural-coupling",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "two-dimensional rigid-body analysis per unit wall width",
          "method-neutral output with no implicit normative factors or safety limits",
          "base uplift is linear hydrostatic or explicitly disabled; drains and seepage networks are not modeled",
          "front passive resistance requires explicit mobilization and justification",
          "pseudostatic bearing capacity and complete wall-soil global stability are not implemented",
          "global circular stability uses an explicitly reported equivalent-surcharge screening coupling",
          "structural stem, toe, heel and reinforcement verification consumes the action contract but is not part of this application",
        ],
      },
    });
  }

  run(input = {}) {
    const analysis = new RetainingWallAnalysis().analyze(input);
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
