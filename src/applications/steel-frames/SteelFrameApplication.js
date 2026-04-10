import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { SteelMemberVerification } from "./checks/SteelMemberVerification.js";

export class SteelFrameApplication extends StructuralApplication {
  constructor() {
    super({
      id: "steel-frames",
      name: "Steel Frames",
      description:
        "Global analysis and code checks for structural steel frames and members.",
      domain: "steel",
      supportedCodes: ["NTC2018", "Eurocode"],
      tags: ["frames", "steel", "uls", "sls", "buckling"],
      metadata: {
        maturity: "scaffolded",
        plannedCapabilities: [
          "2D/3D frame analysis integration",
          "member resistance checks",
          "stability and buckling verifications",
          "connection-level verification hooks",
        ],
      },
    });
  }

  run(input = {}) {
    const verification = new SteelMemberVerification({
      code: input.code ?? "NTC2018",
    }).verify({
      memberId: input.memberId ?? null,
      combinations: input.loadCombinations ?? [],
    });

    return this.createPlaceholderResult({
      summary:
        "Steel frame application scaffold created with placeholders for analysis and member verification.",
      warnings: verification.warnings,
      outputs: {
        modelId: input.model?.id ?? null,
        verification: verification.toJSON(),
      },
      assumptions: [
        "Global finite element solving will be connected to StructuralModel or a dedicated frame solver.",
      ],
    });
  }
}
