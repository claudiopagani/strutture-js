import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcreteBeamColumnJointModel } from "./ReinforcedConcreteBeamColumnJointModel.js";
import { ReinforcedConcreteBeamColumnJointVerification } from "./ReinforcedConcreteBeamColumnJointVerification.js";

export class ReinforcedConcreteBeamColumnJointApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-beam-column-joints",
      name: "RC Beam-Column Joints",
      description:
        "Local NTC 2018 verification of reinforced-concrete beam-column joints for assigned seismic actions and capacities.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018"],
      tags: ["rc", "beam-column-joint", "seismic", "capacity-design"],
      metadata: {
        maturity: "partial",
        limitations: [
          "one explicitly assigned seismic direction per model",
          "NTC 2018 dissipative CDA/CDB joints only",
          "member actions and capacity sums are assigned inputs",
          "anchorage and eccentric joint transfer are not implemented",
        ],
      },
    });
  }

  run(input = {}) {
    if (!input.model) {
      throw new Error(
        "ReinforcedConcreteBeamColumnJointApplication requires a model.",
      );
    }

    const model = input.model instanceof ReinforcedConcreteBeamColumnJointModel
      ? input.model
      : new ReinforcedConcreteBeamColumnJointModel(input.model);

    return new ReinforcedConcreteBeamColumnJointVerification({
      code: input.code ?? "NTC2018",
      metadata: input.metadata ?? {},
    }).verify(model);
  }
}
