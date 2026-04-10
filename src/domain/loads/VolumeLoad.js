import { Load } from "./Load.js";
import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";

export class VolumeLoad extends Load {
  constructor({
    type = "volume",
    direction = null,
    intensity,
    volume = null,
    referenceSystem = "global",
    units = null,
    ...baseProps
  }) {
    super({
      ...baseProps,
      type,
      dimension: "volume",
    });

    assertExplicitUnitSystem(units, "VolumeLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedIntensity = unitResolver.volumeLoad(intensity);

    if (!Number.isFinite(resolvedIntensity)) {
      throw new Error("A finite volume load intensity is required.");
    }

    this.direction = direction;
    this.intensity = resolvedIntensity;
    this.volumeOverride = volume == null ? volume : unitResolver.volume(volume);
    this.referenceSystem = referenceSystem;
  }

  resolvedVolume() {
    if (Number.isFinite(this.volumeOverride)) {
      return this.volumeOverride;
    }

    if (typeof this.target?.volume === "function") {
      return this.target.volume();
    }

    if (Number.isFinite(this.target?.volume)) {
      return this.target.volume;
    }

    return null;
  }

  referenceValue() {
    return this.intensity;
  }

  resultant() {
    const volume = this.resolvedVolume();
    return volume === null ? null : this.intensity * volume;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      direction: this.direction,
      intensity: this.intensity,
      volume: this.resolvedVolume(),
      referenceSystem: this.referenceSystem,
      resultant: this.resultant(),
    };
  }
}
