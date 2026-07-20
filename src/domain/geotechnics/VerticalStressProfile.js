import { GroundProfile } from "./GroundProfile.js";

function nonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative.`);
  }
  return value;
}

export class VerticalStressProfile {
  constructor({ profile, surcharge = 0 } = {}) {
    if (!(profile instanceof GroundProfile)) {
      throw new Error("VerticalStressProfile requires a GroundProfile.");
    }

    this.profile = profile;
    this.surcharge = nonNegative(Number(surcharge), "surcharge");
  }

  porePressureAt(elevation) {
    if (this.profile.groundwater.model !== "hydrostatic") return 0;

    return this.profile.groundwater.waterUnitWeight * Math.max(
      this.profile.groundwater.waterTableElevation - elevation,
      0,
    );
  }

  unitWeightAt(elevation, material) {
    const groundwater = this.profile.groundwater;
    const isSaturated = groundwater.model === "hydrostatic" &&
      elevation < groundwater.waterTableElevation;

    if (!isSaturated) return material.unitWeight.bulk;
    if (!Number.isFinite(material.unitWeight.saturated)) {
      throw new Error(
        `SoilMaterial ${material.id} requires unitWeight.saturated below the water table.`,
      );
    }

    return material.unitWeight.saturated;
  }

  evaluate(elevation) {
    const z = Number(elevation);
    if (!Number.isFinite(z)) throw new Error("elevation must be finite.");

    const profile = this.profile;
    const tolerance = 1e-10 * Math.max(
      1,
      Math.abs(profile.groundSurfaceElevation),
      Math.abs(profile.bottomElevation),
    );
    if (
      z > profile.groundSurfaceElevation + tolerance ||
      z < profile.bottomElevation - tolerance
    ) {
      throw new Error(`Elevation ${z} lies outside GroundProfile ${profile.id}.`);
    }

    const surfaceWaterPressure = this.porePressureAt(
      profile.groundSurfaceElevation,
    );
    let totalSoilOverburden = 0;

    for (const layer of profile.layers) {
      const intervalTop = Math.min(layer.topElevation, profile.groundSurfaceElevation);
      const intervalBottom = Math.max(layer.bottomElevation, z);
      if (intervalBottom >= intervalTop - tolerance) continue;

      const material = profile.getMaterial(layer.materialId);
      const boundaries = [intervalTop, intervalBottom];
      if (
        profile.groundwater.model === "hydrostatic" &&
        profile.groundwater.waterTableElevation < intervalTop - tolerance &&
        profile.groundwater.waterTableElevation > intervalBottom + tolerance
      ) {
        boundaries.splice(1, 0, profile.groundwater.waterTableElevation);
      }

      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const top = boundaries[index];
        const bottom = boundaries[index + 1];
        const midpoint = (top + bottom) / 2;
        totalSoilOverburden += this.unitWeightAt(midpoint, material) *
          (top - bottom);
      }

      if (z >= layer.bottomElevation - tolerance) break;
    }

    const porePressure = this.porePressureAt(z);
    const totalVerticalStress = this.surcharge + surfaceWaterPressure +
      totalSoilOverburden;
    const effectiveVerticalStress = totalVerticalStress - porePressure;

    return {
      elevation: z,
      depth: profile.groundSurfaceElevation - z,
      surcharge: this.surcharge,
      totalSoilOverburden,
      surfaceWaterPressure,
      totalVerticalStress,
      porePressure,
      effectiveVerticalStress,
      effectiveSoilOverburden: effectiveVerticalStress - this.surcharge,
      units: {
        elevation: "m",
        depth: "m",
        stress: "kN/m2",
      },
    };
  }

  breakpoints({ topElevation, bottomElevation } = {}) {
    const top = topElevation ?? this.profile.groundSurfaceElevation;
    const bottom = bottomElevation ?? this.profile.bottomElevation;
    const values = [
      top,
      bottom,
      ...this.profile.layers.flatMap((layer) => [
        layer.topElevation,
        layer.bottomElevation,
      ]),
    ];

    if (this.profile.groundwater.model === "hydrostatic") {
      values.push(this.profile.groundwater.waterTableElevation);
    }

    return [...new Set(values
      .filter((value) => value <= top && value >= bottom)
      .map((value) => Number(value.toPrecision(14))))]
      .sort((left, right) => right - left);
  }
}
