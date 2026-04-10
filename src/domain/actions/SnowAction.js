import { ClimaticAction } from "./ClimaticAction.js";

export class SnowAction extends ClimaticAction {
  constructor(baseProps) {
    super({
      ...baseProps,
      family: "snow",
    });
  }
}
