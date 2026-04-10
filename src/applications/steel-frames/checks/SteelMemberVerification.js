import { VerificationResult } from "../../../core/results/VerificationResult.js";

export class SteelMemberVerification {
  constructor({ code = "NTC2018", metadata = {} } = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify({ memberId = null, combinations = [] } = {}) {
    return new VerificationResult({
      applicationId: "steel-frames",
      status: "not-implemented",
      summary: "Steel member verification workflow scaffolded.",
      checks: [],
      warnings: [
        "Resistance, stability, class and connection checks are not implemented yet.",
      ],
      metadata: {
        code: this.code,
        memberId,
        combinations: combinations.length,
        ...this.metadata,
      },
    });
  }
}
