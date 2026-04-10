import { BaseMaterial } from "./BaseMaterial.js";

export class ExistingMaterial extends BaseMaterial {
  constructor({
    conditionLevel = "unknown",
    knowledgeLevel = null,
    confidenceFactor = 1,
    testResults = [],
    interventions = [],
    ...baseProps
  }) {
    super(baseProps);

    this.conditionLevel = conditionLevel;
    this.knowledgeLevel = knowledgeLevel;
    this.confidenceFactor = confidenceFactor;
    this.testResults = [...testResults];
    this.interventions = [...interventions];
  }

  isExistingMaterial() {
    return true;
  }

  addTestResult(testResult) {
    this.testResults.push(testResult);
    return this;
  }

  addIntervention(intervention) {
    this.interventions.push(intervention);
    return this;
  }

  designValue(characteristicValue) {
    return characteristicValue / this.confidenceFactor;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      conditionLevel: this.conditionLevel,
      knowledgeLevel: this.knowledgeLevel,
      confidenceFactor: this.confidenceFactor,
      testResults: [...this.testResults],
      interventions: [...this.interventions],
    };
  }
}
