import { Action } from "./Action.js";

export class SeismicAction extends Action {
  constructor(baseProps) {
    super({
      ...baseProps,
      nature: "seismic",
      family: "seismic",
      loadDurationClass: "instantaneous",
    });
  }
}
