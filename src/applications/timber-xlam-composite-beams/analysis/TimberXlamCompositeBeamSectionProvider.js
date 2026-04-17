import { applySectionRotationToBeamProperties } from "../../../domain/beams/SectionRotation.js";

const DEFAULT_UNITS = Object.freeze({ force: "N", length: "mm" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function resolveShearModulus(material, fallbackDivisor = null) {
  if (Number.isFinite(material?.shearModulus)) {
    return material.shearModulus;
  }

  if (Number.isFinite(material?.elasticModulus) && Number.isFinite(fallbackDivisor)) {
    return material.elasticModulus / fallbackDivisor;
  }

  return null;
}

function isUltimateContext(context) {
  return String(context.limitState ?? "").toUpperCase() === "ULS";
}

function isFinalServiceContext(context, defaultFinalStiffnessForSle) {
  if (
    context.deformationState === "instant" ||
    context.serviceCombination === "instant"
  ) {
    return false;
  }

  if (
    context.deformationState === "final" ||
    context.serviceCombination === "final" ||
    context.serviceCombination === "quasi-permanent"
  ) {
    return true;
  }

  return defaultFinalStiffnessForSle && !isUltimateContext(context);
}

export class TimberXlamCompositeBeamSectionProvider {
  constructor({
    model,
    defaultFinalStiffnessForSle = false,
    shearCorrectionFactor = 1,
    units = null,
    metadata = {},
  } = {}) {
    if (!model) {
      throw new Error("TimberXlamCompositeBeamSectionProvider requires a model.");
    }

    this.model = model;
    this.defaultFinalStiffnessForSle = defaultFinalStiffnessForSle;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.units = units ?? model.metadata?.unitSystem ?? DEFAULT_UNITS;
    this.metadata = { ...metadata };
  }

  calculateGammaProperties(context = {}) {
    const {
      span,
      xlamSection,
      timberSection,
      xlamMaterial,
      timberMaterial,
      connector,
    } = this.model;
    const ultimate = isUltimateContext(context);
    const finalStiffness = isFinalServiceContext(
      context,
      this.defaultFinalStiffnessForSle,
    );
    const kdef = this.model.kdef();
    const stiffnessReduction =
      finalStiffness && Number.isFinite(kdef) ? 1 + kdef : 1;
    const e1 = xlamMaterial.elasticModulus / stiffnessReduction;
    const e2 = timberMaterial.elasticModulus / stiffnessReduction;
    const a1 = xlamSection.area;
    const a2 = timberSection.area;
    const j1 = this.model.workbookEquivalentXlamInertia();
    const j2 = timberSection.inertiaY;
    const a = this.model.relativeCentroidDistance();
    const connectorStiffness = ultimate ? connector.ku : connector.kser;
    const spacing = connector.spacing;

    assertPositive(span, "Beam span");
    assertPositive(e1, "XLAM elastic modulus");
    assertPositive(e2, "Timber elastic modulus");
    assertPositive(a1, "XLAM area");
    assertPositive(a2, "Timber area");
    assertPositive(j1, "XLAM inertia");
    assertPositive(j2, "Timber inertia");
    assertPositive(a, "Relative centroid distance");
    assertPositive(connectorStiffness, "Connector stiffness");
    assertPositive(spacing, "Connector spacing");

    const gamma1 =
      1 / (1 + (Math.PI ** 2 * e1 * a1 * spacing) / (connectorStiffness * span ** 2));
    const gamma2 =
      1 / (1 + (Math.PI ** 2 * e2 * a2 * spacing) / (connectorStiffness * span ** 2));
    const a2Lever = (gamma1 * e1 * a1 * a) / (gamma1 * e1 * a1 + e2 * a2);
    const a1Lever = a - a2Lever;
    const flexuralRigidity =
      e1 * j1 + e2 * j2 + gamma1 * e1 * a1 * a1Lever ** 2 +
      gamma2 * e2 * a2 * a2Lever ** 2;

    return {
      ultimate,
      finalStiffness,
      kdef,
      stiffnessReduction,
      e1,
      e2,
      a1,
      a2,
      j1,
      j2,
      a,
      connectorStiffness,
      spacing,
      gamma1,
      gamma2,
      a1Lever,
      a2Lever,
      flexuralRigidity,
    };
  }

  getElasticBeamProperties(context = {}) {
    const {
      xlamSection,
      timberSection,
      xlamMaterial,
      timberMaterial,
      kmod,
      gammaXlam,
      gammaTimber,
      gammaConnection,
      serviceClass,
    } = this.model;
    const props = this.calculateGammaProperties(context);
    const xlamShearModulus = resolveShearModulus(xlamMaterial, 16);
    const timberShearModulus = resolveShearModulus(timberMaterial, 16);
    const xlamShearArea = xlamSection.shearAreaY ?? xlamSection.area;
    const timberShearArea = timberSection.shearAreaY ?? timberSection.area;
    const shearRigidity =
      Number.isFinite(xlamShearModulus) &&
      Number.isFinite(timberShearModulus) &&
      Number.isFinite(xlamShearArea) &&
      Number.isFinite(timberShearArea)
        ? xlamShearModulus * xlamShearArea + timberShearModulus * timberShearArea
        : null;

    const properties = {
      axialRigidity: props.e1 * props.a1 + props.e2 * props.a2,
      flexuralRigidity: props.flexuralRigidity,
      shearRigidity,
      shearCorrectionFactor: shearRigidity === null ? null : this.shearCorrectionFactor,
      units: this.units,
      metadata: {
        ...this.metadata,
        provider: "TimberXlamCompositeBeamSectionProvider",
        source: "timber-xlam-gamma-method",
        limitState: props.ultimate ? "ULS" : "SLE",
        finalStiffness: props.finalStiffness,
        stiffnessReduction: props.stiffnessReduction,
        serviceClass,
        kdef: props.kdef,
        kmod,
        gammaXlam,
        gammaTimber,
        gammaConnection,
        gamma1: props.gamma1,
        gamma2: props.gamma2,
        a1Lever: props.a1Lever,
        a2Lever: props.a2Lever,
        ejEffective: props.flexuralRigidity,
        connectorStiffness: props.connectorStiffness,
        connectorSpacing: props.spacing,
        xlamElasticModulus: props.e1,
        timberElasticModulus: props.e2,
        xlamInertia: props.j1,
        timberInertia: props.j2,
        relativeCentroidDistance: props.a,
      },
    };

    return applySectionRotationToBeamProperties({
      properties,
      sectionRotation: context.sectionRotation,
      flexuralRigidityY: props.flexuralRigidity,
      flexuralRigidityZ:
        Number.isFinite(xlamSection.inertiaZ) && Number.isFinite(timberSection.inertiaZ)
          ? props.e1 * xlamSection.inertiaZ + props.e2 * timberSection.inertiaZ
          : null,
      shearRigidityY: shearRigidity,
      shearRigidityZ: shearRigidity,
    });
  }
}

export function createTimberXlamCompositeBeamSectionProvider(options = {}) {
  return new TimberXlamCompositeBeamSectionProvider(options);
}
