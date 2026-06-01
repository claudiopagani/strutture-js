import { BaseMaterial } from "./BaseMaterial.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";
import { resolveExistingMaterialState } from "./existingMaterialConfidence.js";

export class SteelMaterial extends BaseMaterial {
  constructor({
    grade,
    fyMean = null,
    ftMean = null,
    fyk = null,
    fyd = null,
    ftk = null,
    ductilityClass = null,
    elongationCharacteristic = null,
    ultimateStrain = null,
    existing = false,
    knowledgeLevel = "LC1",
    confidenceFactor = null,
    units = null,
    ...baseProps
  }) {
    assertExplicitUnitSystem(units, "SteelMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "steel",
      units,
      ...baseProps,
    });

    this.grade = grade;
    this.fyMean = unitResolver.stress(fyMean);
    this.ftMean = unitResolver.stress(ftMean);
    this.fyk = unitResolver.stress(fyk);
    this.fyd = unitResolver.stress(fyd);
    this.ftk = unitResolver.stress(ftk);
    this.ductilityClass = ductilityClass;
    this.elongationCharacteristic = elongationCharacteristic;
    this.ultimateStrain =
      ultimateStrain ??
      (Number.isFinite(elongationCharacteristic)
        ? 0.9 * elongationCharacteristic
        : null);
    const existingState = resolveExistingMaterialState({
      existing,
      knowledgeLevel,
      confidenceFactor,
    });

    this.existing = existingState.existing;
    this.knowledgeLevel = existingState.knowledgeLevel;
    this.confidenceFactor = existingState.confidenceFactor;
    this.knowledgeLevelDescription = existingState.knowledgeLevelDescription;
  }

  isExistingMaterial() {
    return this.existing === true;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      grade: this.grade,
      fyMean: this.fyMean,
      ftMean: this.ftMean,
      fyk: this.fyk,
      fyd: this.fyd,
      ftk: this.ftk,
      ductilityClass: this.ductilityClass,
      elongationCharacteristic: this.elongationCharacteristic,
      ultimateStrain: this.ultimateStrain,
      existing: this.existing,
      knowledgeLevel: this.knowledgeLevel,
      confidenceFactor: this.confidenceFactor,
      knowledgeLevelDescription: this.knowledgeLevelDescription,
    };
  }
}
