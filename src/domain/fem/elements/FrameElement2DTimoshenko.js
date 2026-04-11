import { FrameElement2DEulerBernoulli } from "./FrameElement2DEulerBernoulli.js";

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`FrameElement2DTimoshenko requires a positive ${label}.`);
  }
}

function resolveShearArea(crossSection, shearAreaAxis) {
  const shearArea = crossSection?.[shearAreaAxis];

  if (Number.isFinite(shearArea)) {
    assertPositive(shearArea, `cross-section ${shearAreaAxis}`);
    return { area: shearArea, usesEffectiveShearArea: true };
  }

  const area = crossSection?.area;

  assertPositive(area, "cross-section area");

  return { area, usesEffectiveShearArea: false };
}

export class FrameElement2DTimoshenko extends FrameElement2DEulerBernoulli {
  constructor({
    id,
    startNode,
    endNode,
    material = null,
    crossSection = null,
    axialRigidity = null,
    flexuralRigidity = null,
    shearRigidity = null,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = null,
    metadata = {},
  }) {
    super({
      id,
      startNode,
      endNode,
      material,
      crossSection,
      axialRigidity,
      flexuralRigidity,
      bendingInertiaAxis,
      metadata,
    });

    this.type = "frame-2d-timoshenko";
    this.shearRigidity = shearRigidity;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
  }

  resolvedShearCorrectionFactor({ usesEffectiveShearArea = false } = {}) {
    const correctionFactor =
      this.shearCorrectionFactor ?? (usesEffectiveShearArea ? 1 : 5 / 6);

    assertPositive(correctionFactor, "shearCorrectionFactor");

    return correctionFactor;
  }

  resolvedEffectiveShearRigidity() {
    if (Number.isFinite(this.shearRigidity)) {
      assertPositive(this.shearRigidity, "shearRigidity");

      return (
        this.shearRigidity *
        this.resolvedShearCorrectionFactor({ usesEffectiveShearArea: false })
      );
    }

    const shearModulus = this.material?.shearModulus;
    const { area, usesEffectiveShearArea } = resolveShearArea(
      this.crossSection,
      this.shearAreaAxis,
    );

    assertPositive(shearModulus, "material shear modulus");

    return (
      shearModulus *
      area *
      this.resolvedShearCorrectionFactor({ usesEffectiveShearArea })
    );
  }

  resolvedShearRigidity() {
    return this.resolvedEffectiveShearRigidity();
  }

  shearFlexibilityCoefficient() {
    const { length } = this.directionCosines();
    const ei = this.resolvedFlexuralRigidity();
    const kga = this.resolvedEffectiveShearRigidity();

    return (12 * ei) / (kga * length ** 2);
  }

  lockingDiagnostics() {
    return {
      formulation: "closed-form-timoshenko",
      shearFlexibilityCoefficient: this.shearFlexibilityCoefficient(),
      shearLockingControlled: true,
    };
  }

  localStiffness() {
    const { length } = this.directionCosines();
    const ea = this.resolvedAxialRigidity();
    const ei = this.resolvedFlexuralRigidity();
    const phi = this.shearFlexibilityCoefficient();
    const l = length;
    const axial = ea / l;
    const bending = ei / (l ** 3 * (1 + phi));

    return [
      [axial, 0, 0, -axial, 0, 0],
      [0, 12 * bending, 6 * l * bending, 0, -12 * bending, 6 * l * bending],
      [
        0,
        6 * l * bending,
        (4 + phi) * l ** 2 * bending,
        0,
        -6 * l * bending,
        (2 - phi) * l ** 2 * bending,
      ],
      [-axial, 0, 0, axial, 0, 0],
      [0, -12 * bending, -6 * l * bending, 0, 12 * bending, -6 * l * bending],
      [
        0,
        6 * l * bending,
        (2 - phi) * l ** 2 * bending,
        0,
        -6 * l * bending,
        (4 + phi) * l ** 2 * bending,
      ],
    ];
  }

  toJSON() {
    return {
      ...super.toJSON(),
      shearRigidity: this.shearRigidity,
      shearAreaAxis: this.shearAreaAxis,
      shearCorrectionFactor: this.shearCorrectionFactor,
    };
  }
}
