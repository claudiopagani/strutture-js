import { neutralAxisDirection } from "./RCSectionStrainExtremes.js";

export function createAffineStrainField({ eps0 = 0, kappaY = 0, kappaZ = 0 } = {}) {
  if (!Number.isFinite(eps0) || !Number.isFinite(kappaY) || !Number.isFinite(kappaZ)) {
    throw new Error("StrainField requires finite eps0, kappaY and kappaZ values.");
  }

  return { eps0, kappaY, kappaZ };
}

export function hasStrainFieldCoefficients(strainField) {
  return (
    strainField != null &&
    Number.isFinite(strainField.eps0) &&
    Number.isFinite(strainField.kappaY) &&
    Number.isFinite(strainField.kappaZ)
  );
}

export function strainAtPoint(strainField, point) {
  if (!Number.isFinite(point?.y) || !Number.isFinite(point?.z)) {
    throw new Error("StrainField strainAt requires finite y and z coordinates.");
  }

  if (hasStrainFieldCoefficients(strainField)) {
    return strainField.eps0 + strainField.kappaY * point.z - strainField.kappaZ * point.y;
  }

  if (strainField && typeof strainField.strainAt === "function") {
    return strainField.strainAt(point);
  }

  throw new Error("StrainField strainAt requires a strain field.");
}

export class StrainField {
  constructor({ eps0 = 0, kappaY = 0, kappaZ = 0 } = {}) {
    const coefficients = createAffineStrainField({ eps0, kappaY, kappaZ });

    this.eps0 = coefficients.eps0;
    this.kappaY = coefficients.kappaY;
    this.kappaZ = coefficients.kappaZ;
  }

  strainAt({ y, z }) {
    return strainAtPoint(this, { y, z });
  }

  static fromNeutralAxis({
    theta,
    curvature,
    neutralAxisOffset = 0,
  }) {
    if (
      !Number.isFinite(theta) ||
      !Number.isFinite(curvature) ||
      !Number.isFinite(neutralAxisOffset)
    ) {
      throw new Error(
        "StrainField.fromNeutralAxis requires finite theta, curvature and neutralAxisOffset.",
      );
    }

    const direction = neutralAxisDirection(theta);

    return new StrainField({
      eps0: -curvature * neutralAxisOffset,
      kappaY: -curvature * direction.sin,
      kappaZ: -curvature * direction.cos,
    });
  }
}
