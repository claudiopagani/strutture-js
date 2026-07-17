import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CrackedSectionDeflectionAnalysis } from "./analysis/CrackedSectionDeflectionAnalysis.js";
import { CrackedSectionBeamModel } from "./models/CrackedSectionBeamModel.js";

export class RCrackedDeflectionApplication extends StructuralApplication {
  constructor() {
    super({
      id: "rc-cracked-deflection",
      name: "RC Cracked Deflection",
      description:
        "Deflection analysis of reinforced concrete beams with cracked sections.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018", "Eurocode 2"],
      tags: ["rc", "deflection", "cracking", "sls"],
      metadata: {
        maturity: "implemented",
        limitations: [
          "time-dependent parameters and shrinkage strain are explicit caller inputs",
          "hyperstatic iteration requires an analyzable beam model or an external callback",
          "global staged-construction history remains a consumer responsibility",
        ],
      },
    });
  }

  run(input = {}) {
    const model = input.model instanceof CrackedSectionBeamModel
      ? input.model
      : input.model
        ? new CrackedSectionBeamModel(input.model)
        : null;
    const analysis = new CrackedSectionDeflectionAnalysis({
      code: input.code ?? "NTC2018",
      metadata: input.metadata ?? model?.metadata ?? {},
    }).analyze({
      beamId: model?.id ?? null,
      analysisResult: input.analysisResult ?? model?.analysisResult ?? null,
      section: input.section ?? model?.section ?? null,
      concreteMaterial: input.concreteMaterial ?? model?.concreteMaterial,
      reinforcementMaterial:
        input.reinforcementMaterial ?? model?.reinforcementMaterial,
      serviceability: input.serviceability ?? model?.serviceability ?? {},
      mesh: input.mesh ?? model?.mesh ?? { targetFiberCount: 100 },
      solver: input.solver ?? model?.solver ?? { tolerance: 1e-2, maxIterations: 50 },
      beamModel:
        input.beamModel ??
        model?.beamModel ??
        model?.beamInput ??
        null,
      hyperstatic: input.hyperstatic ?? model?.hyperstatic ?? null,
      performanceProfile:
        input.performanceProfile ?? model?.performanceProfile ?? null,
      sampling: input.sampling ?? model?.sampling ?? {},
      output: input.output ?? model?.output ?? {},
    });

    return analysis;
  }
}
