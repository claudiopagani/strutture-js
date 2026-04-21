import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { SteelMemberVerification } from "./checks/SteelMemberVerification.js";
import { SteelRingFramePushoverAnalysis } from "./analysis/SteelRingFramePushoverAnalysis.js";
import { SteelRingFramePushoverModel } from "./models/SteelRingFramePushoverModel.js";

function isRingFramePushoverInput(input = {}) {
  return (
    input.model instanceof SteelRingFramePushoverModel ||
    input.analysisType === "steel-ring-frame-pushover" ||
    input.model?.metadata?.analysisType === "steel-ring-frame-pushover"
  );
}

export class SteelFrameApplication extends StructuralApplication {
  constructor() {
    super({
      id: "steel-frames",
      name: "Steel Frames",
      description:
        "Global analysis and code checks for structural steel frames, members and standalone ring-frame pushover workflows.",
      domain: "steel",
      supportedCodes: ["NTC2018", "Eurocode"],
      tags: ["frames", "steel", "uls", "sls", "buckling", "pushover"],
      metadata: {
        maturity: "partial",
        plannedCapabilities: [
          "2D/3D frame analysis integration",
          "member resistance checks",
          "stability and buckling verifications",
          "connection-level verification hooks",
          "standalone pushover curves for steel ring frames around openings",
        ],
      },
    });
  }

  run(input = {}) {
    if (isRingFramePushoverInput(input)) {
      const result = new SteelRingFramePushoverAnalysis().analyze({
        model: input.model ?? input,
      });

      return new CalculationResult({
        applicationId: this.id,
        status: result.status,
        summary: result.summary,
        outputs: result.outputs,
        warnings: result.warnings,
        assumptions: result.assumptions,
        metadata: {
          domain: this.domain,
          ...result.metadata,
        },
      });
    }

    const verification = new SteelMemberVerification({
      code: input.code ?? "NTC2018",
    }).verify({
      memberId: input.memberId ?? null,
      combinations: input.loadCombinations ?? [],
      section: input.section ?? input.model?.section ?? null,
      material: input.material ?? input.model?.material ?? null,
      analysisResult: input.analysisResult ?? input.model?.analysisResult ?? null,
      serviceability: input.serviceability,
      classification: input.classification,
      resistance: input.resistance,
      stability: input.stability,
      verificationStations: input.verificationStations,
      deflectionLimitRatio: input.deflectionLimitRatio,
    });

    if (verification.status !== "not-implemented") {
      return verification;
    }

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
