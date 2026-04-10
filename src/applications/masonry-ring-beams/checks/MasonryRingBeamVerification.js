import { VerificationResult } from "../../../core/results/VerificationResult.js";

export class MasonryRingBeamVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify({ openingId = null } = {}) {
    return new VerificationResult({
      applicationId: "masonry-ring-beams",
      status: "not-implemented",
      summary: "Masonry ring beam verification workflow scaffolded.",
      warnings: [
        "Arching behaviour, local wall checks and steel profile checks are placeholders.",
      ],
      metadata: {
        code: this.code,
        openingId,
        ...this.metadata,
      },
    });
  }
}
