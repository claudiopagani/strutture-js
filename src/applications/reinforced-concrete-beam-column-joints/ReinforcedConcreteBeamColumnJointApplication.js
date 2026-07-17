import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcreteBeamColumnJointModel } from "./ReinforcedConcreteBeamColumnJointModel.js";
import { ReinforcedConcreteBeamColumnJointVerification } from "./ReinforcedConcreteBeamColumnJointVerification.js";
import { ReinforcedConcreteBeamColumnJoint3DModel } from "./ReinforcedConcreteBeamColumnJoint3DModel.js";
import { ReinforcedConcreteBeamColumnJoint3DVerification } from "./ReinforcedConcreteBeamColumnJoint3DVerification.js";

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
          "NTC 2018 dissipative CDA/CDB joints only",
          "member actions and capacity sums are assigned inputs",
          "3D verification requires concurrent directional action states and keeps the NTC checks directional",
          "no global generation of actions, member capacities or joint topology",
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

    const is3D = input.model instanceof ReinforcedConcreteBeamColumnJoint3DModel ||
      Array.isArray(input.model.directions);
    const model = is3D
      ? input.model instanceof ReinforcedConcreteBeamColumnJoint3DModel
        ? input.model
        : new ReinforcedConcreteBeamColumnJoint3DModel(input.model)
      : input.model instanceof ReinforcedConcreteBeamColumnJointModel
        ? input.model
        : new ReinforcedConcreteBeamColumnJointModel(input.model);

    const VerificationClass = is3D
      ? ReinforcedConcreteBeamColumnJoint3DVerification
      : ReinforcedConcreteBeamColumnJointVerification;

    return new VerificationClass({
      code: input.code ?? "NTC2018",
      metadata: input.metadata ?? {},
    }).verify(model);
  }
}
