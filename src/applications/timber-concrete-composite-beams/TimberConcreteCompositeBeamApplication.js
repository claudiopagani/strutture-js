import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { TimberConcreteCompositeBeamVerification } from "./checks/TimberConcreteCompositeBeamVerification.js";

export class TimberConcreteCompositeBeamApplication extends StructuralApplication {
  constructor() {
    super({
      id: "timber-concrete-composite-beams",
      name: "Timber Concrete Composite Beams",
      description:
        "Verification of timber beams with collaborating concrete slab and discrete shear connectors.",
      domain: "timber",
      supportedCodes: ["NTC2018", "Gelfi"],
      tags: ["timber", "concrete", "composite", "connectors", "serviceability"],
      metadata: {
        maturity: "implemented",
        plannedCapabilities: [
          "support for different slab shapes",
          "multiple connector layouts",
          "additional load combinations",
        ],
      },
    });
  }

  run({ model } = {}) {
    if (!model) {
      throw new Error("TimberConcreteCompositeBeamApplication requires a model.");
    }

    return new TimberConcreteCompositeBeamVerification().verify(model);
  }
}
