import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { TimberXlamCompositeBeamVerification } from "./checks/TimberXlamCompositeBeamVerification.js";

export class TimberXlamCompositeBeamApplication extends StructuralApplication {
  constructor() {
    super({
      id: "timber-xlam-composite-beams",
      name: "Timber XLAM Composite Beams",
      description:
        "Verification of timber beams collaborating with XLAM panels through discrete timber-timber connectors.",
      domain: "timber",
      supportedCodes: ["NTC2018", "Eurocode 5"],
      tags: ["timber", "xlam", "composite", "gamma-method", "connectors"],
      metadata: {
        maturity: "implemented",
        plannedCapabilities: [
          "fire verification workflow",
          "additional XLAM layups",
          "alternative connector families",
        ],
      },
    });
  }

  run({ model } = {}) {
    if (!model) {
      throw new Error("TimberXlamCompositeBeamApplication requires a model.");
    }

    return new TimberXlamCompositeBeamVerification().verify(model);
  }
}
