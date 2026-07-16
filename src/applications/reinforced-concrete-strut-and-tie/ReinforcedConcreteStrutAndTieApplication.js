import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcreteStrutAndTieModel } from "./ReinforcedConcreteStrutAndTieModel.js";
import {
  RC_STRUT_AND_TIE_SUPPORTED_CODE,
  ReinforcedConcreteStrutAndTieVerification,
} from "./ReinforcedConcreteStrutAndTieVerification.js";

export class ReinforcedConcreteStrutAndTieApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-strut-and-tie",
      name: "RC Strut-and-Tie Models",
      description:
        "Analysis and EN 1992 verification of an explicitly assigned two-dimensional reinforced-concrete strut-and-tie model.",
      domain: "reinforced-concrete",
      supportedCodes: [RC_STRUT_AND_TIE_SUPPORTED_CODE],
      tags: ["rc", "strut-and-tie", "d-region", "deep-beam", "corbel"],
      metadata: {
        maturity: "partial",
        limitations: [
          "assigned 2D topology only",
          "linear-elastic force distribution",
          "no automatic topology generation or optimization",
          "anchorage and splitting reinforcement are not verified",
        ],
      },
    });
  }

  run(input = {}) {
    if (!input.model) {
      throw new Error("ReinforcedConcreteStrutAndTieApplication requires a model.");
    }

    const model = input.model instanceof ReinforcedConcreteStrutAndTieModel
      ? input.model
      : new ReinforcedConcreteStrutAndTieModel(input.model);

    return new ReinforcedConcreteStrutAndTieVerification({
      code: input.code ?? RC_STRUT_AND_TIE_SUPPORTED_CODE,
      metadata: input.metadata ?? {},
    }).verify(model);
  }
}
