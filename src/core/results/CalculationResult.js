import { RESULT_STATUS } from "./resultStatus.js";

export class CalculationResult {
  constructor({
    applicationId,
    status = RESULT_STATUS.NOT_IMPLEMENTED,
    summary = "",
    outputs = {},
    warnings = [],
    assumptions = [],
    metadata = {},
  }) {
    if (!applicationId) {
      throw new Error("A result applicationId is required.");
    }

    this.applicationId = applicationId;
    this.status = status;
    this.summary = summary;
    this.outputs = { ...outputs };
    this.warnings = [...warnings];
    this.assumptions = [...assumptions];
    this.metadata = { ...metadata };
  }

  isSuccessful() {
    return this.status === RESULT_STATUS.OK;
  }

  toJSON() {
    return {
      applicationId: this.applicationId,
      status: this.status,
      summary: this.summary,
      outputs: { ...this.outputs },
      warnings: [...this.warnings],
      assumptions: [...this.assumptions],
      metadata: { ...this.metadata },
    };
  }
}
