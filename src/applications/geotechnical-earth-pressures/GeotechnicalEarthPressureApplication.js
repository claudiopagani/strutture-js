import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { LateralEarthPressureAnalysis } from "../../domain/geotechnics/index.js";

export class GeotechnicalEarthPressureApplication extends StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-earth-pressures",
      name: "Geotechnical Earth Pressures",
      description:
        "Static and pseudostatic lateral earth-pressure actions for serializable ground profiles.",
      domain: "geotechnics",
      supportedCodes: ["method-neutral", "NTC2018-explicit-seismic-input"],
      tags: [
        "soil-profile",
        "earth-pressure",
        "rankine",
        "coulomb",
        "mononobe-okabe",
        "trial-wedge",
        "undrained",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "Rankine and at-rest methods require a vertical wall and horizontal retained surface",
          "inclined Coulomb is homogeneous, drained and cohesionless",
          "homogeneous dry cohesionless Mononobe-Okabe analysis",
          "layered pseudostatic trial wedge supports a planar inclined frictional wall but remains a no-groundwater, resultant-only approximation",
          "global slope stability is handled by the separate geotechnical-slope-stability application",
        ],
      },
    });
  }

  run(input = {}) {
    const analysis = new LateralEarthPressureAnalysis().analyze(input);

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
