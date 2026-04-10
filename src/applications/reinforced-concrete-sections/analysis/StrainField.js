export class StrainField {
  constructor({ eps0 = 0, kappaY = 0, kappaZ = 0 } = {}) {
    if (!Number.isFinite(eps0) || !Number.isFinite(kappaY) || !Number.isFinite(kappaZ)) {
      throw new Error("StrainField requires finite eps0, kappaY and kappaZ values.");
    }

    this.eps0 = eps0;
    this.kappaY = kappaY;
    this.kappaZ = kappaZ;
  }

  strainAt({ y, z }) {
    if (!Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error("StrainField strainAt requires finite y and z coordinates.");
    }

    return this.eps0 + this.kappaY * z - this.kappaZ * y;
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

    const normalY = Math.cos(theta);
    const normalZ = Math.sin(theta);

    return new StrainField({
      eps0: -curvature * neutralAxisOffset,
      kappaY: curvature * normalZ,
      kappaZ: -curvature * normalY,
    });
  }
}
