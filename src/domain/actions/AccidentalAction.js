import { Action } from "./Action.js";

export class AccidentalAction extends Action {
  constructor(baseProps) {
    super({
      ...baseProps,
      nature: "accidental",
      family: "accidental",
      loadDurationClass: "instantaneous",
    });
  }
}
