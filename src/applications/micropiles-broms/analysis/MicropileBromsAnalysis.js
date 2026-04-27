import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

export class MicropileBromsAnalysis {
  constructor({ metadata = {} } = {}) {
    this.metadata = { ...metadata };
  }

  analyze({ pileId = null } = {}) {
    return new CalculationResult({
      applicationId: "micropiles-broms",
      status: RESULT_STATUS.NOT_IMPLEMENTED,
      summary: "Micropile Broms analysis scaffolded.",
      warnings: [
        "Passive pressure model, head restraint conditions and plastic hinge assumptions are placeholders.",
      ],
      metadata: {
        pileId,
        ...this.metadata,
      },
    });
  }
}
