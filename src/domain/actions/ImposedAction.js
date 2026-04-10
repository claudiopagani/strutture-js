import { VariableAction } from "./VariableAction.js";

export class ImposedAction extends VariableAction {
  constructor(baseProps) {
    super({
      ...baseProps,
      family: "imposed",
    });
  }
}
