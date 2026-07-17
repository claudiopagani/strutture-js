import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { PunchingVerification } from "./PunchingVerification.js";
import { RC_PUNCHING_DESIGN_CODE_ID_VALUES } from "./punchingDesignCodes.js";

export class ReinforcedConcretePunchingApplication extends StructuralApplication {
  constructor() {
    super({
      id: "reinforced-concrete-punching",
      name: "RC Punching",
      description:
        "Local punching verification of reinforced-concrete slabs at columns and concentrated supports.",
      domain: "reinforced-concrete",
      supportedCodes: RC_PUNCHING_DESIGN_CODE_ID_VALUES,
      tags: ["rc", "slabs", "punching", "uls"],
      metadata: {
        maturity: "implemented",
        inputContract: "rc-punching-verification-request/v0",
      },
    });
  }

  run(input = {}) {
    const request = input.request ?? input.model;

    if (!request) {
      throw new Error(
        "ReinforcedConcretePunchingApplication requires a request or model.",
      );
    }

    return new PunchingVerification().verify(request);
  }
}
