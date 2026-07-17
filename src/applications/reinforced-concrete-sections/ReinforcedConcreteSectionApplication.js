import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcreteSectionVerification } from "./checks/ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteSectionModel } from "./models/ReinforcedConcreteSectionModel.js";

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
        limitations: [
          "domain sampling and mesh refinement are explicit solver settings",
          "member detailing is handled by the beam and column verification contracts",
        ],
      },
    });
  }

  run(input = {}) {
    if (!input.model) {
      throw new Error("ReinforcedConcreteSectionApplication requires a model.");
    }

    const model = input.model instanceof ReinforcedConcreteSectionModel
      ? input.model
      : new ReinforcedConcreteSectionModel(input.model);

    return new ReinforcedConcreteSectionVerification({
      code: input.code ?? "NTC2018",
      metadata: input.metadata ?? {},
    }).verify(model);
  }
}
