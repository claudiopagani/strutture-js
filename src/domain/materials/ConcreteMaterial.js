import { BaseMaterial } from "./BaseMaterial.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";
import { resolveExistingMaterialState } from "./existingMaterialConfidence.js";

export class ConcreteMaterial extends BaseMaterial {
  constructor({
    strengthClass,
    fck = null,
    fcm = null,
    fcd = null,
    fctm = null,
    existing = false,
    knowledgeLevel = "LC1",
    confidenceFactor = null,
    meanProperties = {},
    units = null,
    ...baseProps
  }) {
    assertExplicitUnitSystem(units, "ConcreteMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "concrete",
      units,
      ...baseProps,
    });

    this.strengthClass = strengthClass;
    this.fck = unitResolver.stress(fck);
    this.fcm = unitResolver.stress(fcm);
    this.fcd = unitResolver.stress(fcd);
    this.fctm = unitResolver.stress(fctm);
    const existingState = resolveExistingMaterialState({
      existing,
      knowledgeLevel,
      confidenceFactor,
    });

    this.existing = existingState.existing;
    this.knowledgeLevel = existingState.knowledgeLevel;
    this.confidenceFactor = existingState.confidenceFactor;
    this.knowledgeLevelDescription = existingState.knowledgeLevelDescription;
    this.meanProperties = {
      ...meanProperties,
      fcm: unitResolver.stress(meanProperties.fcm),
      fctm: unitResolver.stress(meanProperties.fctm),
      elasticModulus: unitResolver.stress(meanProperties.elasticModulus),
    };
  }

  isExistingMaterial() {
    return this.existing === true;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      strengthClass: this.strengthClass,
      fck: this.fck,
      fcm: this.fcm,
      fcd: this.fcd,
      fctm: this.fctm,
      existing: this.existing,
      knowledgeLevel: this.knowledgeLevel,
      confidenceFactor: this.confidenceFactor,
      knowledgeLevelDescription: this.knowledgeLevelDescription,
      meanProperties: { ...this.meanProperties },
    };
  }
}
