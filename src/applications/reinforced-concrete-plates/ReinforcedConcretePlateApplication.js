import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcretePlateModel } from "./ReinforcedConcretePlateModel.js";
import { ReinforcedConcretePlateVerification } from "./ReinforcedConcretePlateVerification.js";

export class ReinforcedConcretePlateApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-plates",
      name: "RC Plates",
      description: "Local verification of flat reinforced-concrete plates through rotated Wood-Armer equivalent strips.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018"],
      tags: ["rc", "plates", "slabs", "wood-armer", "uls", "sle"],
      metadata: {
        maturity: "implemented",
        unitWidth: 1000,
        membraneActionsSupported: false,
      },
    });
  }

  run(input = {}) {
    if (!input.model) {
      throw new Error("ReinforcedConcretePlateApplication requires a model.");
    }

    const model = input.model instanceof ReinforcedConcretePlateModel
      ? input.model
      : new ReinforcedConcretePlateModel(input.model);

    return new ReinforcedConcretePlateVerification({
      code: input.code ?? "NTC2018",
      metadata: input.metadata ?? {},
    }).verify(model);
  }
}
