import { ExistingMaterial } from "./ExistingMaterial.js";
import { createUnitResolver } from "../units/UnitSystem.js";

const multiplyFactors = (factors) =>
  Object.values(factors).reduce((acc, value) => acc * value, 1);

export class ExistingMasonryMaterial extends ExistingMaterial {
  constructor({
    masonryType,
    unitType = null,
    mortarType = null,
    baseProperties = {},
    surveyFactors = {},
    improvementFactors = {},
    ntcReference = "NTC 2018",
    units = null,
    ...baseProps
  }) {
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "masonry",
      units,
      ...baseProps,
    });

    this.masonryType = masonryType;
    this.unitType = unitType;
    this.mortarType = mortarType;
    this.baseProperties = {
      ...baseProperties,
      fm: unitResolver.stress(baseProperties.fm),
      tau0: unitResolver.stress(baseProperties.tau0),
      fv0: unitResolver.stress(baseProperties.fv0),
      E: unitResolver.stress(baseProperties.E),
      G: unitResolver.stress(baseProperties.G),
      w: unitResolver.volumeLoad(baseProperties.w),
    };
    this.surveyFactors = {
      geometry: 1,
      connections: 1,
      workmanship: 1,
      degradation: 1,
      ...surveyFactors,
    };
    this.improvementFactors = {
      groutInjection: 1,
      reinforcedPlaster: 1,
      jacketing: 1,
      ties: 1,
      ...improvementFactors,
    };
    this.ntcReference = ntcReference;
  }

  correctionFactor() {
    return multiplyFactors(this.surveyFactors);
  }

  improvementFactor() {
    return multiplyFactors(this.improvementFactors);
  }

  adjustedProperty(propertyName) {
    const value = this.baseProperties[propertyName];

    if (value == null) {
      return null;
    }

    return value * this.correctionFactor() * this.improvementFactor();
  }

  adjustedProperties() {
    return Object.keys(this.baseProperties).reduce((acc, key) => {
      acc[key] = this.adjustedProperty(key);
      return acc;
    }, {});
  }

  toJSON() {
    return {
      ...super.toJSON(),
      masonryType: this.masonryType,
      unitType: this.unitType,
      mortarType: this.mortarType,
      baseProperties: { ...this.baseProperties },
      surveyFactors: { ...this.surveyFactors },
      improvementFactors: { ...this.improvementFactors },
      ntcReference: this.ntcReference,
      adjustedProperties: this.adjustedProperties(),
    };
  }
}
