import { Action } from "./Action.js";

export class VariableAction extends Action {
  constructor({
    category = null,
    leadingEligible = true,
    ...baseProps
  }) {
    super({
      ...baseProps,
      nature: "variable",
    });

    this.category = category;
    this.leadingEligible = leadingEligible;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      category: this.category,
      leadingEligible: this.leadingEligible,
    };
  }
}
