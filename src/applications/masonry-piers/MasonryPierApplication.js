import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { uniqueStrings } from "../../core/results/checkUtils.js";
import { MasonryPierEquivalentFrameBuilder } from "./analysis/MasonryPierEquivalentFrameBuilder.js";
import { MasonryPierVerticalVerification } from "./checks/MasonryPierVerticalVerification.js";
import { MasonryPierModel } from "./models/MasonryPierModel.js";

export class MasonryPierApplication extends StructuralApplication {
  constructor() {
    super({
      id: "masonry-piers",
      name: "Masonry Piers",
      description:
        "Vertical verification of masonry piers under axial load and eccentricities, with an equivalent-frame 2D idealization ready for future wall assemblies.",
      domain: "masonry",
      supportedCodes: ["NTC2018", "Circolare 2019"],
      tags: [
        "existing-buildings",
        "masonry",
        "equivalent-frame",
        "vertical-loads",
        "compression",
      ],
      metadata: {
        maturity: "partial",
        plannedCapabilities: [
          "integration into equivalent-frame wall assemblies",
          "combined in-plane shear and flexural checks",
          "member extraction from wall-level FEM results",
        ],
      },
    });
  }

  run(input = {}) {
    const model =
      input.model instanceof MasonryPierModel
        ? input.model
        : new MasonryPierModel(input.model ?? input);
    const verification = new MasonryPierVerticalVerification({
      code: input.code ?? "NTC2018",
    }).verify({ model });

    try {
      const idealization = new MasonryPierEquivalentFrameBuilder().build({ model });

      verification.outputs.equivalentFrameIdealization = idealization.snapshot;
      verification.assumptions.push(...idealization.assumptions);
      verification.warnings.push(...idealization.warnings);
    } catch (error) {
      verification.warnings.push(
        `Equivalent-frame idealization was not generated: ${error.message}`,
      );
    }

    verification.metadata = {
      ...verification.metadata,
      modelId: model.id,
    };
    verification.warnings = uniqueStrings(verification.warnings);
    verification.assumptions = uniqueStrings(verification.assumptions);

    return verification;
  }
}
