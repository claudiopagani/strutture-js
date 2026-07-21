import { StructuralApplication } from
  "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { AxialPileCapacityAnalysis } from
  "../../domain/geotechnics/index.js";

export class GeotechnicalDeepFoundationApplication extends
  StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-deep-foundations",
      name: "Geotechnical Deep Foundations",
      description:
        "Method-neutral axial capacity of a single vertical pile in a layered GroundModel.",
      domain: "geotechnics",
      supportedCodes: ["method-neutral"],
      tags: [
        "ground-model",
        "deep-foundation",
        "pile",
        "micropile",
        "axial-capacity",
        "shaft-resistance",
        "base-resistance",
        "alpha-method",
        "effective-stress-method",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "single vertical pile with constant geometry and static ULS capacity only",
          "method coefficients, unit-resistance limits and any resistance conversion must be supplied explicitly with provenance",
          "shaft contributions are summed layer by layer without solving peak-strain compatibility",
          "hydrostatic GroundProfile groundwater only",
          "negative skin friction, settlement, t-z/q-z response, pile groups, inclined piles, cyclic loading and seismic effects are not implemented",
          "structural verification of the pile is delegated through the serializable coupling contract",
        ],
      },
    });
  }

  run(input = {}) {
    const analysis = new AxialPileCapacityAnalysis().analyze(input);
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
