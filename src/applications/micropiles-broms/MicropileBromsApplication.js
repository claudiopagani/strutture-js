import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { MicropileBromsAnalysis } from "./analysis/MicropileBromsAnalysis.js";

export class MicropileBromsApplication extends StructuralApplication {
  constructor() {
    super({
      id: "micropiles-broms",
      name: "Micropiles Broms",
      description:
        "Deprecated compatibility entry point for Broms lateral-pile capacity.",
      domain: "geotechnics",
      supportedCodes: ["broms-short-free-head"],
      tags: ["micropiles", "soil-structure", "lateral-load", "geotechnical"],
      metadata: {
        maturity: "deprecated-compatibility",
        replacementApplicationId: "geotechnical-lateral-piles",
        limitations: [
          "legacy MicropileBromsModel inputs remain not implemented",
          "new general lateral-pile inputs are delegated to geotechnical-lateral-piles",
        ],
      },
    });
  }

  run(input = {}) {
    return new MicropileBromsAnalysis().analyze(input);
  }
}
