import { VariableAction } from "./VariableAction.js";

export class ClimaticAction extends VariableAction {
  constructor({ family = "climatic", ...baseProps } = {}) {
    super({
      ...baseProps,
      family,
    });
  }
}
