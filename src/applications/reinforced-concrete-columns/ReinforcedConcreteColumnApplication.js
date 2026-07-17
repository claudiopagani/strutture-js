import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcreteColumnVerification } from "./ReinforcedConcreteColumnVerification.js";

export class ReinforcedConcreteColumnApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-columns",
      name: "RC Columns",
      description:
        "Local RC column verification with NTC 2018 second-order generation, biaxial resistance, shear, confinement and detailing.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018"],
      tags: ["rc", "columns", "biaxial-bending", "stability", "uls"],
      metadata: {
        maturity: "partial",
        limitations: [
          "nominal-stiffness moment generation applies to isolated members with assigned effective lengths",
          "global frame P-Delta analysis and automatic effective lengths remain consumer responsibilities",
          "shear and detailing require explicit serializable reinforcement contracts",
        ],
      },
    });
  }

  run(input = {}) {
    if (!input.model) {
      throw new Error("ReinforcedConcreteColumnApplication requires a model.");
    }

    return new ReinforcedConcreteColumnVerification({
      code: input.code ?? "NTC2018",
    }).verify(input.model);
  }
}
