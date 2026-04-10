import { ClimaticAction } from "./ClimaticAction.js";

export class WindAction extends ClimaticAction {
  constructor(baseProps) {
    super({
      ...baseProps,
      family: "wind",
    });
  }
}
