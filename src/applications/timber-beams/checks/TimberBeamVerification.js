import { VerificationResult } from "../../../core/results/VerificationResult.js";

export class TimberBeamVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify({ beamId = null } = {}) {
    return new VerificationResult({
      applicationId: "timber-beams",
      status: "not-implemented",
      summary: "Timber beam verification workflow scaffolded.",
      warnings: [
        "Bending, shear, deflection and lateral stability checks are placeholders.",
      ],
      metadata: {
        code: this.code,
        beamId,
        ...this.metadata,
      },
    });
  }
}
