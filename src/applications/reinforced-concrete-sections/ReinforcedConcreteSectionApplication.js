import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcreteSectionVerification } from "./checks/ReinforcedConcreteSectionVerification.js";

export class ReinforcedConcreteSectionApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-sections",
      name: "RC Sections",
      description:
        "Analysis and verification of reinforced concrete sections under axial load and bending.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018", "Eurocode 2"],
      tags: ["rc", "interaction-domain", "section-analysis", "uls"],
      metadata: {
        maturity: "implemented",
        plannedCapabilities: [
          "adaptive domain refinement",
          "moment-curvature workflow",
          "detailing validation hooks",
        ],
      },
    });
  }

  run(input = {}) {
    if (!input.model) {
      throw new Error("ReinforcedConcreteSectionApplication requires a model.");
    }

    return new ReinforcedConcreteSectionVerification({
      code: input.code ?? "NTC2018",
    }).verify(input.model);
  }
}
