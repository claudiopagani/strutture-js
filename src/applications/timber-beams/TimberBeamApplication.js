import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { TimberBeamVerification } from "./checks/TimberBeamVerification.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";

export class TimberBeamApplication extends StructuralApplication {
  constructor() {
    super({
      id: "timber-beams",
      name: "Timber Beams",
      description: "Verification workflow for timber beams in bending and shear.",
      domain: "timber",
      supportedCodes: ["NTC2018", "Eurocode 5"],
      tags: ["timber", "beam", "kmod", "serviceability"],
      metadata: {
        maturity: "partial",
        plannedCapabilities: [
          "solid and glulam timber checks",
          "instantaneous and final deflection",
          "lateral torsional stability assumptions",
          "service class and duration handling",
        ],
      },
    });
  }

  run(input = {}) {
    const verification = new TimberBeamVerification({
      code: input.code ?? "NTC2018",
    }).verify({
      beamId: input.model?.id ?? null,
      section: input.section ?? input.model?.section ?? null,
      material: input.material ?? input.model?.material ?? null,
      analysisResult: input.analysisResult ?? input.model?.analysisResult ?? null,
      serviceability: input.serviceability,
      stability: input.stability,
      verificationStations: input.verificationStations,
      deflectionLimitRatio: input.deflectionLimitRatio,
    });

    if (verification.status !== RESULT_STATUS.NOT_IMPLEMENTED) {
      return verification;
    }

    return this.createPlaceholderResult({
      summary:
        "Timber beam module scaffold created with placeholders for resistance and deformation checks.",
      warnings: verification.warnings,
      outputs: {
        beamId: input.model?.id ?? null,
        verification: verification.toJSON(),
      },
      assumptions: [
        "The existing timber material hierarchy will be reused as the primary material source.",
      ],
    });
  }
}
