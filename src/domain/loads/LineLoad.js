import { Load } from "./Load.js";
import { createUnitResolver } from "../units/UnitSystem.js";

export class LineLoad extends Load {
  constructor({
    type = "line",
    direction = null,
    startValue,
    endValue = null,
    distribution = "uniform",
    referenceSystem = "local",
    length = null,
    units = null,
    ...baseProps
  }) {
    super({
      ...baseProps,
      type,
      dimension: "line",
    });

    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedStartValue = unitResolver.lineLoad(startValue);
    const resolvedEndValue = endValue === null ? null : unitResolver.lineLoad(endValue);
    const resolvedLength = length == null ? length : unitResolver.length(length);

    if (!Number.isFinite(resolvedStartValue)) {
      throw new Error("A finite startValue is required for a line load.");
    }

    if (resolvedEndValue !== null && !Number.isFinite(resolvedEndValue)) {
      throw new Error("The endValue of a line load must be finite when provided.");
    }

    this.direction = direction;
    this.startValue = resolvedStartValue;
    this.endValue = resolvedEndValue ?? resolvedStartValue;
    this.distribution = distribution;
    this.referenceSystem = referenceSystem;
    this.lengthOverride = resolvedLength;
  }

  averageIntensity() {
    return (this.startValue + this.endValue) / 2;
  }

  resolvedLength() {
    if (Number.isFinite(this.lengthOverride)) {
      return this.lengthOverride;
    }

    if (typeof this.target?.length === "function") {
      return this.target.length();
    }

    if (Number.isFinite(this.target?.length)) {
      return this.target.length;
    }

    return null;
  }

  referenceValue() {
    return this.averageIntensity();
  }

  resultant() {
    const length = this.resolvedLength();
    return length === null ? null : this.averageIntensity() * length;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      direction: this.direction,
      startValue: this.startValue,
      endValue: this.endValue,
      distribution: this.distribution,
      referenceSystem: this.referenceSystem,
      length: this.resolvedLength(),
      resultant: this.resultant(),
    };
  }
}
