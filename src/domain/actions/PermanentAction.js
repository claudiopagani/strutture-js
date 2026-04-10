import { Action } from "./Action.js";

export class PermanentAction extends Action {
  constructor({
    permanentClass = "G1",
    ...baseProps
  }) {
    super({
      ...baseProps,
      nature: "permanent",
      family: "permanent",
      loadDurationClass: "permanent",
    });

    this.permanentClass = permanentClass;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      permanentClass: this.permanentClass,
    };
  }
}
