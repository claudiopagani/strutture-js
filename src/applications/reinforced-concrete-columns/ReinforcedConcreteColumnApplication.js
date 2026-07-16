import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { ReinforcedConcreteColumnVerification } from "./ReinforcedConcreteColumnVerification.js";

export class ReinforcedConcreteColumnApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-columns",
      name: "RC Columns",
      description:
        "Local reinforced-concrete column verification with NTC 2018 slenderness screening and biaxial section resistance.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018"],
      tags: ["rc", "columns", "biaxial-bending", "stability", "uls"],
      metadata: {
        maturity: "partial",
        limitations: [
          "slender columns require supplied second-order design moments",
          "member detailing and seismic ductility are not implemented",
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
