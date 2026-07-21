import { StructuralApplication } from
  "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import {
  LateralPileBeamOnSpringsAnalysis,
  LateralPileCapacityAnalysis,
} from
  "../../domain/geotechnics/index.js";

export class GeotechnicalLateralPileApplication extends StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-lateral-piles",
      name: "Geotechnical Lateral Piles",
      description:
        "Lateral capacity and static nonlinear beam-on-p-y-springs response of single deep-foundation elements.",
      domain: "geotechnics",
      supportedCodes: [
        "method-neutral",
        "broms-short-free-head",
        "beam-on-py-springs",
      ],
      tags: [
        "ground-model",
        "deep-foundation",
        "pile",
        "micropile",
        "lateral-capacity",
        "broms",
        "p-y",
        "nonlinear-springs",
        "soil-structure-interaction",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "the implemented Broms branch is restricted to static ULS of a single short rigid uniform pile, free to rotate at groundline",
          "the complete embedment must lie in one homogeneous cohesive-undrained or cohesionless-drained layer",
          "the cohesionless branch requires either dry embedment or groundwater at/above ground or at/below the toe",
          "Broms is not used for displacement, stiffness, long/flexible piles or fixed-head piles",
          "the p-y solver uses assigned static-monotonic curves and constant Euler-Bernoulli flexural rigidity",
          "cyclic/seismic response, pile groups, lateral ground movement, axial geometric stiffness and structural pile verification are not implemented",
        ],
      },
    });
  }

  run(input = {}) {
    const usesPyResponse =
      input.scenario?.method === "beam-on-py-springs" ||
      input.scenario?.soilResponse != null;
    const solver = usesPyResponse
      ? new LateralPileBeamOnSpringsAnalysis()
      : new LateralPileCapacityAnalysis();
    const analysis = solver.analyze(input);
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
