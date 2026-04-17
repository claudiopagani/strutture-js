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

  if (
    Number.isFinite(material?.elasticModulus) &&
    Number.isFinite(material?.poissonRatio)
  ) {
    return material.elasticModulus / (2 * (1 + material.poissonRatio));
  }

  if (Number.isFinite(material?.elasticModulus) && Number.isFinite(fallbackDivisor)) {
    return material.elasticModulus / fallbackDivisor;
  }

  return null;
}

function resolveShearArea(section) {
  return section?.shearAreaY ?? section?.area ?? null;
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

export class TimberConcreteCompositeBeamSectionProvider {
  constructor({
    model,
    defaultFinalStiffnessForSle = true,
    shearCorrectionFactor = 1,
    units = null,
    metadata = {},
  } = {}) {
    if (!model) {
      throw new Error("TimberConcreteCompositeBeamSectionProvider requires a model.");
    }

    this.model = model;
    this.defaultFinalStiffnessForSle = defaultFinalStiffnessForSle;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.units = units ?? model.metadata?.unitSystem ?? DEFAULT_UNITS;
    this.metadata = { ...metadata };
  }

  calculateGammaProperties() {
    const {
      span,
      slabSection,
      timberSection,
      timberMaterial,
      concreteMaterial,
      connector,
      connectorSpacing,
    } = this.model;

    assertPositive(span, "Beam span");
    assertPositive(connectorSpacing, "Connector spacing");
    assertPositive(timberMaterial?.elasticModulus, "Timber elastic modulus");
    assertPositive(concreteMaterial?.elasticModulus, "Concrete elastic modulus");
    assertPositive(connector?.kser, "Connector service stiffness kser");
    assertPositive(connector?.ku, "Connector ultimate stiffness ku");

    const idealComposite = this.model.createIdealCompositeSection();
    const ew = timberMaterial.elasticModulus;
    const ec = concreteMaterial.elasticModulus;
    const n = ec / ew;
    const timberCentroid = this.model.timberCentroidY();
    const slabCentroid = this.model.slabCentroidY();
    const centroidDistance = slabCentroid - timberCentroid;
    const disconnectedInertia = timberSection.inertiaY + n * slabSection.inertiaY;
    const idealInertia = idealComposite.inertiaY;
    const collaborationInertia = idealInertia - disconnectedInertia;

    assertPositive(centroidDistance, "Composite centroid distance");
    assertPositive(disconnectedInertia, "Disconnected transformed inertia");
    assertPositive(idealInertia, "Ideal transformed inertia");
    assertPositive(collaborationInertia, "Collaboration inertia contribution");

    const gammaUls =
      1 /
      (1 +
        (Math.PI ** 2 * ew * collaborationInertia * connectorSpacing) /
          (connector.ku * span ** 2 * centroidDistance ** 2));
    const gammaSle =
      1 /
      (1 +
        (Math.PI ** 2 * ew * collaborationInertia * connectorSpacing) /
          (connector.kser * span ** 2 * centroidDistance ** 2));

    return {
      idealComposite,
      ew,
      ec,
      n,
      timberCentroid,
      slabCentroid,
      centroidDistance,
      disconnectedInertia,
      idealInertia,
      collaborationInertia,
      gammaUls,
      gammaSle,
      inertiaEffUls: disconnectedInertia + gammaUls * collaborationInertia,
      inertiaEffSle: disconnectedInertia + gammaSle * collaborationInertia,
    };
  }

  getElasticBeamProperties(context = {}) {
    const {
      slabSection,
      timberSection,
      timberMaterial,
      concreteMaterial,
      connector,
      connectorSpacing,
      kdef,
      kmod,
      gammaTimber,
      gammaConcrete,
      gammaConnector,
    } = this.model;
    const gammaProperties = this.calculateGammaProperties();
    const ultimate = isUltimateContext(context);
    const finalStiffness = isFinalServiceContext(
      context,
      this.defaultFinalStiffnessForSle,
    );
    const stiffnessReduction =
      finalStiffness && Number.isFinite(kdef) ? 1 + kdef : 1;
    const effectiveTimberModulus = timberMaterial.elasticModulus / stiffnessReduction;
    const inertiaEffective = ultimate
      ? gammaProperties.inertiaEffUls
      : gammaProperties.inertiaEffSle;
    const gamma = ultimate ? gammaProperties.gammaUls : gammaProperties.gammaSle;
    const connectorStiffness = ultimate ? connector.ku : connector.kser;
    const timberShearModulus = resolveShearModulus(timberMaterial, 16);
    const concreteShearModulus = resolveShearModulus(concreteMaterial);
    const timberShearArea = resolveShearArea(timberSection);
    const slabShearArea = resolveShearArea(slabSection);
    const shearRigidity =
      Number.isFinite(timberShearModulus) &&
      Number.isFinite(concreteShearModulus) &&
      Number.isFinite(timberShearArea) &&
      Number.isFinite(slabShearArea)
        ? timberShearModulus * timberShearArea +
          concreteShearModulus * slabShearArea
        : null;

    assertPositive(gammaProperties.idealComposite.area, "Ideal transformed area");

    const properties = {
      axialRigidity: effectiveTimberModulus * gammaProperties.idealComposite.area,
      flexuralRigidity: effectiveTimberModulus * inertiaEffective,
      shearRigidity,
      shearCorrectionFactor: shearRigidity === null ? null : this.shearCorrectionFactor,
      units: this.units,
      metadata: {
        ...this.metadata,
        provider: "TimberConcreteCompositeBeamSectionProvider",
        source: "timber-concrete-gamma-method",
        limitState: ultimate ? "ULS" : "SLE",
        finalStiffness,
        stiffnessReduction,
        kdef,
        kmod,
        gammaTimber,
        gammaConcrete,
        gammaConnector,
        connectorSpacing,
        connectorStiffness,
        modularRatio: gammaProperties.n,
        gamma,
        gammaUls: gammaProperties.gammaUls,
        gammaSle: gammaProperties.gammaSle,
        inertiaEffective,
        inertiaEffUls: gammaProperties.inertiaEffUls,
        inertiaEffSle: gammaProperties.inertiaEffSle,
        disconnectedInertia: gammaProperties.disconnectedInertia,
        idealInertia: gammaProperties.idealInertia,
        collaborationInertia: gammaProperties.collaborationInertia,
        timberCentroid: gammaProperties.timberCentroid,
        slabCentroid: gammaProperties.slabCentroid,
        centroidDistance: gammaProperties.centroidDistance,
      },
    };

    return applySectionRotationToBeamProperties({
      properties,
      sectionRotation: context.sectionRotation,
      flexuralRigidityY: effectiveTimberModulus * inertiaEffective,
      flexuralRigidityZ:
        Number.isFinite(gammaProperties.idealComposite.inertiaZ)
          ? effectiveTimberModulus * gammaProperties.idealComposite.inertiaZ
          : null,
      shearRigidityY: shearRigidity,
      shearRigidityZ: shearRigidity,
    });
  }
}

export function createTimberConcreteCompositeBeamSectionProvider(options = {}) {
  return new TimberConcreteCompositeBeamSectionProvider(options);
}
