import { StructuralApplication } from
  "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { GroundAnchorAnalysis } from "../../domain/geotechnics/index.js";

export class GeotechnicalGroundAnchorApplication extends
  StructuralApplication {
  constructor() {
    super({
      id: "geotechnical-ground-anchors",
      name: "Geotechnical Ground Anchors",
      description:
        "Design of cement-grouted ground anchors including wall-demand conversion, geometry, bond, tendon, corrosion protection and acceptance tests.",
      domain: "geotechnics",
      supportedCodes: ["FHWA-IF-99-015", "method-neutral-input-contracts"],
      tags: [
        "ground-model",
        "ground-section-2d",
        "ground-anchor",
        "tieback",
        "bond-length",
        "prestressing-steel",
        "corrosion-protection",
        "proof-test",
        "performance-test",
        "embedded-retaining-wall",
        "fem-coupling",
      ],
      metadata: {
        maturity: "implemented-local",
        limitations: [
          "straight cement-grouted anchors represented in a GroundSection2D plane",
          "FHWA allowable-load workflow; no automatic Eurocode or NTC partial-factor conversion",
          "presumptive transfer values are preliminary and require production anchor testing",
          "wall/waler structural resistance remains separate; the global-stability workflow can consume the verified anchor result",
          "no anchor-group interaction beyond the minimum-spacing check",
        ],
      },
    });
  }

  run(input = {}) {
    const analysis = new GroundAnchorAnalysis().analyze(input);
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
