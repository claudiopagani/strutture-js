import { SlabLoad } from "./SlabLoad.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class VariableLoad extends SlabLoad {
  static nextVariableId = 1;

  constructor({
    description,
    value,
    psi0,
    psi1,
    psi2,
    category = null,
    units = null,
  }) {
    super({
      description,
      loadGroup: "Qk",
      effect: "unfavourable",
      units,
    });

    assertExplicitUnitSystem(units, "VariableLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedValue = unitResolver.areaLoad(value);

    if (![resolvedValue, psi0, psi1, psi2].every(Number.isFinite)) {
      throw new Error("Finite Qk, psi0, psi1 and psi2 values are required.");
    }

    this.variableLoadId = VariableLoad.nextVariableId++;
    this.category = category;
    this._value = resolvedValue;
    this.psi0 = psi0;
    this.psi1 = psi1;
    this.psi2 = psi2;
    this.intensity = resolvedValue;
  }

  get value() {
    return this._value;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      variableLoadId: this.variableLoadId,
      category: this.category,
      psi0: this.psi0,
      psi1: this.psi1,
      psi2: this.psi2,
    };
  }
}
