import { ReinforcedConcreteBeamSectionProvider } from "../../domain/beams/ReinforcedConcreteBeamSectionProvider.js";
import { FoundationBeamModel } from "../../domain/foundations/FoundationBeamModel.js";

export class ReinforcedConcreteFoundationBeamModel extends FoundationBeamModel {
  constructor({
    section,
    concreteMaterial = null,
    reinforcementMaterial = null,
    stiffnessState = "transformed",
    verification = {},
    ...input
  } = {}) {
    if (!section) {
      throw new Error("ReinforcedConcreteFoundationBeamModel requires a section.");
    }

    const resolvedConcrete = concreteMaterial ?? section.concreteMaterial;
    const resolvedReinforcement = reinforcementMaterial ?? section.reinforcementMaterial;

    if (!resolvedConcrete || !resolvedReinforcement) {
      throw new Error(
        "ReinforcedConcreteFoundationBeamModel requires concrete and reinforcement materials.",
      );
    }

    super({
      ...input,
      foundation: {
        ...input.foundation,
        contactModel: input.foundation?.contactModel ?? "compression-only",
      },
      sectionProvider: new ReinforcedConcreteBeamSectionProvider({
        section,
        concreteMaterial: resolvedConcrete,
        reinforcementMaterial: resolvedReinforcement,
        stiffnessState,
        units: section.metadata?.unitSystem ?? input.units,
      }),
    });

    this.section = section;
    this.concreteMaterial = resolvedConcrete;
    this.reinforcementMaterial = resolvedReinforcement;
    this.stiffnessState = stiffnessState;
    this.verification = {
      code: verification.code ?? "NTC2018",
      mesh: { ...verification.mesh },
      solver: { ...verification.solver },
      shear: verification.shear ?? null,
      torsion: verification.torsion ?? null,
      serviceability: verification.serviceability === false
        ? false
        : {
            ...(verification.serviceability ?? {}),
            deflection: false,
          },
      crackedStiffness: verification.crackedStiffness === false
        ? false
        : {
            enabled: true,
            modularRatio: verification.crackedStiffness?.modularRatio ?? 15,
            creepCoefficient:
              verification.crackedStiffness?.creepCoefficient ??
              verification.serviceability?.deflection?.creepCoefficient ??
              2,
            betaShortTerm:
              verification.crackedStiffness?.betaShortTerm ?? 1,
            betaLongTerm:
              verification.crackedStiffness?.betaLongTerm ?? 0.5,
            momentSamples:
              verification.crackedStiffness?.momentSamples ?? 40,
            axialForceTolerance:
              verification.crackedStiffness?.axialForceTolerance ?? 10000,
          },
      verificationStations: verification.verificationStations ??
        input.verificationStations ??
        null,
    };
  }
}
