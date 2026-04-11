const DEFAULT_UNITS = Object.freeze({ force: "N", length: "mm" });

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function resolveUnits(...sources) {
  for (const source of sources) {
    const unitSystem = source?.units ?? source?.metadata?.unitSystem;

    if (unitSystem?.force && unitSystem?.length) {
      return unitSystem;
    }
  }

  return DEFAULT_UNITS;
}

function resolveConcreteShearModulus(concreteMaterial, poissonRatio = 0.2) {
  if (Number.isFinite(concreteMaterial?.shearModulus)) {
    return concreteMaterial.shearModulus;
  }

  if (Number.isFinite(concreteMaterial?.elasticModulus)) {
    return concreteMaterial.elasticModulus / (2 * (1 + poissonRatio));
  }

  return null;
}

function normalizeStiffnessState(value) {
  return String(value ?? "transformed")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

export class ReinforcedConcreteBeamSectionProvider {
  constructor({
    section,
    concreteMaterial = null,
    reinforcementMaterial = null,
    stiffnessState = "transformed",
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = 5 / 6,
    poissonRatio = 0.2,
    units = null,
    metadata = {},
  } = {}) {
    if (!section) {
      throw new Error("ReinforcedConcreteBeamSectionProvider requires a section.");
    }

    this.section = section;
    this.concreteMaterial = concreteMaterial ?? section.concreteMaterial;
    this.reinforcementMaterial =
      reinforcementMaterial ?? section.reinforcementMaterial;
    this.stiffnessState = normalizeStiffnessState(stiffnessState);
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.poissonRatio = poissonRatio;
    this.units = units ?? resolveUnits(section, this.concreteMaterial);
    this.metadata = { ...metadata };
  }

  resolveSectionForState(context = {}) {
    const state = normalizeStiffnessState(
      context.stiffnessState ?? context.rcStiffnessState ?? this.stiffnessState,
    );

    if (state === "gross" || state === "uncracked_gross") {
      return {
        state: "gross",
        area: this.section.concreteSection?.area ?? this.section.area,
        inertia: this.section.concreteSection?.[this.bendingInertiaAxis] ??
          this.section[this.bendingInertiaAxis],
        shearArea:
          this.section.concreteSection?.[this.shearAreaAxis] ??
          this.section.concreteSection?.area ??
          this.section[this.shearAreaAxis] ??
          this.section.area,
        source: "concrete-gross-section",
      };
    }

    if (state === "transformed" || state === "uncracked_transformed") {
      const transformed = this.section.transformedSection ?? this.section;

      return {
        state: "transformed",
        area: transformed.area,
        inertia: transformed[this.bendingInertiaAxis],
        shearArea:
          this.section.concreteSection?.[this.shearAreaAxis] ??
          this.section.concreteSection?.area ??
          transformed[this.shearAreaAxis] ??
          transformed.area,
        source: "uncracked-transformed-section",
      };
    }

    throw new Error(`Unsupported RC beam stiffnessState: ${state}.`);
  }

  getElasticBeamProperties(context = {}) {
    const elasticModulus = this.concreteMaterial?.elasticModulus;
    const resolved = this.resolveSectionForState(context);
    const shearModulus = resolveConcreteShearModulus(
      this.concreteMaterial,
      this.poissonRatio,
    );

    assertPositive(elasticModulus, "concrete elasticModulus");
    assertPositive(resolved.area, "RC section area");
    assertPositive(resolved.inertia, `RC section ${this.bendingInertiaAxis}`);
    assertPositive(resolved.shearArea, `RC section ${this.shearAreaAxis} or area`);

    return {
      axialRigidity: elasticModulus * resolved.area,
      flexuralRigidity: elasticModulus * resolved.inertia,
      shearRigidity:
        Number.isFinite(shearModulus) ? shearModulus * resolved.shearArea : null,
      shearCorrectionFactor:
        Number.isFinite(shearModulus) ? this.shearCorrectionFactor : null,
      units: this.units,
      metadata: {
        ...this.metadata,
        provider: "ReinforcedConcreteBeamSectionProvider",
        source: resolved.source,
        stiffnessState: resolved.state,
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        concreteStrengthClass: this.concreteMaterial?.strengthClass ?? null,
        concreteElasticModulus: elasticModulus,
        concreteShearModulus: shearModulus,
        reinforcementGrade: this.reinforcementMaterial?.grade ?? null,
        reinforcementArea:
          typeof this.section.totalReinforcementArea === "function"
            ? this.section.totalReinforcementArea()
            : null,
        limitState: context.limitState ?? null,
        cracked: false,
      },
    };
  }
}

export function createReinforcedConcreteBeamSectionProvider(options = {}) {
  return new ReinforcedConcreteBeamSectionProvider(options);
}
