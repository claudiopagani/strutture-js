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
      verificationStations: verification.verificationStations ??
        input.verificationStations ??
        null,
    };
  }
}
