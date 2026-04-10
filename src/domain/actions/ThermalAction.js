import { ClimaticAction } from "./ClimaticAction.js";

export class ThermalAction extends ClimaticAction {
  constructor(baseProps) {
    super({
      ...baseProps,
      family: "thermal",
    });
  }
}
