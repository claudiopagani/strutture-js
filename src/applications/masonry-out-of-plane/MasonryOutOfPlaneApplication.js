import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { MasonryOutOfPlaneKinematicAnalysis } from "./analysis/MasonryOutOfPlaneKinematicAnalysis.js";

export class MasonryOutOfPlaneApplication extends StructuralApplication {
  constructor() {
    super({
      id: "masonry-out-of-plane",
      name: "Masonry Out Of Plane",
      description:
        "Local kinematic analysis of masonry walls for out-of-plane mechanisms.",
      domain: "masonry",
      supportedCodes: ["NTC2018", "Circolare 2019"],
      tags: ["masonry", "kinematics", "local-mechanisms", "seismic"],
      metadata: {
        maturity: "scaffolded",
        plannedCapabilities: [
          "predefined mechanism templates",
          "activation coefficient evaluation",
          "chain/tie and floor diaphragm effects",
          "existing-building knowledge-level integration",
        ],
      },
    });
  }

  run(input = {}) {
    const analysis = new MasonryOutOfPlaneKinematicAnalysis({
      code: input.code ?? "NTC2018",
    }).analyze({
      wallId: input.model?.id ?? null,
    });

    return this.createPlaceholderResult({
      summary:
        "Out-of-plane masonry module scaffold created with a dedicated kinematic analysis placeholder.",
      warnings: analysis.warnings,
      outputs: {
        wallId: input.model?.id ?? null,
        analysis: analysis.toJSON(),
      },
      assumptions: [
        "Mechanism templates should be separated from material confidence-level adjustments.",
      ],
    });
  }
}
