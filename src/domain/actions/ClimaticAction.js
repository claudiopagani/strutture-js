import { VariableAction } from "./VariableAction.js";

export class ClimaticAction extends VariableAction {
  constructor(baseProps) {
    super({
      ...baseProps,
      family: "climatic",
    });
  }
}
