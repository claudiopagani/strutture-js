import { CalculationResult } from "../../../core/results/CalculationResult.js";

export class CrackedSectionDeflectionAnalysis {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  analyze({ beamId = null } = {}) {
    return new CalculationResult({
      applicationId: "rc-cracked-deflection",
      status: "not-implemented",
      summary: "Cracked-section deflection analysis scaffolded.",
      warnings: [
        "Cracked inertia, tension stiffening and time-dependent effects are placeholders.",
      ],
      metadata: {
        code: this.code,
        beamId,
        ...this.metadata,
      },
    });
  }
}
