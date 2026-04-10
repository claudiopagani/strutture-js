import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { XlamOutOfPlanePanelVerification } from "./checks/XlamOutOfPlanePanelVerification.js";

export class XlamOutOfPlanePanelApplication extends StructuralApplication {
  constructor() {
    super({
      id: "xlam-panels-out-of-plane",
      name: "XLAM Panels Out Of Plane",
      description:
        "Out-of-plane verification of standalone XLAM/CLT floor panels using the CLTdesigner-style 1D plate method.",
      domain: "timber",
      supportedCodes: ["EN1995", "WCTE2010"],
      tags: ["xlam", "clt", "floor", "out-of-plane", "timoshenko"],
      metadata: {
        maturity: "implemented",
        plannedCapabilities: [
          "continuous beam module",
          "vibration checks",
          "fire verification with reduced section",
          "producer panel catalogs",
        ],
      },
    });
  }

  run({ model } = {}) {
    if (!model) {
      throw new Error("XlamOutOfPlanePanelApplication requires a model.");
    }

    return new XlamOutOfPlanePanelVerification().verify(model);
  }
}
