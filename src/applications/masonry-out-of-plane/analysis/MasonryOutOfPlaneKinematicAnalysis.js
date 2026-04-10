import { CalculationResult } from "../../../core/results/CalculationResult.js";

export class MasonryOutOfPlaneKinematicAnalysis {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  analyze({ wallId = null } = {}) {
    return new CalculationResult({
      applicationId: "masonry-out-of-plane",
      status: "not-implemented",
      summary: "Out-of-plane kinematic analysis scaffolded.",
      warnings: [
        "Activation multiplier, stabilizing masses and hinge patterns are placeholders.",
      ],
      metadata: {
        code: this.code,
        wallId,
        ...this.metadata,
      },
    });
  }
}
