import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { FoundationBeamAnalysis } from "../../domain/foundations/FoundationBeamAnalysis.js";
import { ReinforcedConcreteBeamVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteBeamVerification.js";
import { ReinforcedConcreteFoundationBeamModel } from "./ReinforcedConcreteFoundationBeamModel.js";

function json(value) {
  return typeof value?.toJSON === "function" ? value.toJSON() : value;
}

export class ReinforcedConcreteFoundationBeamApplication extends StructuralApplication {
  constructor({ analysis = new FoundationBeamAnalysis() } = {}) {
    super({
      id: "reinforced-concrete-foundation-beams",
      name: "RC Foundation Beams",
      description:
        "Linear analysis and local RC verification of horizontal beams on an assigned Winkler foundation.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018"],
      tags: ["rc", "beam", "foundation", "winkler", "soil-springs"],
      metadata: {
        maturity: "partial",
        limitations: [
          "horizontal prismatic beam only",
          "linear bilateral Winkler foundation with tributary lumped springs",
          "compression-only contact and soil nonlinearity are not solved",
          "subgrade modulus and imposed settlements are assigned inputs",
          "cracked long-term deflection iteration is not available on the spring bed",
        ],
      },
    });

    this.analysis = analysis;
  }

  run(input = {}) {
    if (!input.model) {
      throw new Error("ReinforcedConcreteFoundationBeamApplication requires a model.");
    }

    const model = input.model instanceof ReinforcedConcreteFoundationBeamModel
      ? input.model
      : new ReinforcedConcreteFoundationBeamModel(input.model);
    const analysis = this.analysis.analyze(model);
    const settings = model.verification;
    const verification = new ReinforcedConcreteBeamVerification({
      code: settings.code,
      mesh: settings.mesh,
      solver: settings.solver,
      shear: settings.shear,
      torsion: settings.torsion,
      serviceability: settings.serviceability,
      verificationStations: settings.verificationStations,
      metadata: {
        elementType: "foundation-beam",
      },
    }).verify({
      beamId: model.id,
      section: model.section,
      concreteMaterial: model.concreteMaterial,
      reinforcementMaterial: model.reinforcementMaterial,
      analysisResult: analysis,
      beamModel: model,
    });
    const verificationJson = json(verification);
    const contactViolation = [
      ...Object.values(analysis.loadCases),
      ...Object.values(analysis.combinations),
    ].some((result) => result.foundation.contactAssumptionViolated);
    const status = contactViolation
      ? RESULT_STATUS.NOT_SUPPORTED
      : verification.status;

    return new CalculationResult({
      applicationId: this.id,
      status,
      summary: contactViolation
        ? "Foundation-beam analysis completed, but tensile soil reactions exceed the bilateral Winkler model validity."
        : "Foundation-beam analysis and supported local RC checks completed.",
      outputs: {
        modelId: model.id,
        analysis,
        verification: verificationJson,
      },
      warnings: [
        ...analysis.warnings,
        ...(verificationJson.warnings ?? []),
        "Cracked and long-term member deflection iteration is not run for a beam on a spring bed; reported displacements use the assigned elastic section stiffness.",
      ],
      assumptions: [
        ...analysis.assumptions,
        ...(verificationJson.assumptions ?? []),
      ],
      metadata: {
        code: settings.code,
        foundationModel: analysis.foundationModel,
        contactViolation,
      },
    });
  }
}
