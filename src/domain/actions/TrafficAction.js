import { VariableAction } from "./VariableAction.js";

export class TrafficAction extends VariableAction {
  constructor(baseProps) {
    super({
      ...baseProps,
      family: "traffic",
    });
  }
}
