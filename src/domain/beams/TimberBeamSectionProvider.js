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

function resolveShearModulus(material) {
  if (Number.isFinite(material?.shearModulus)) {
    return material.shearModulus;
  }

  if (Number.isFinite(material?.gMean)) {
    return material.gMean;
  }

  if (Number.isFinite(material?.g0Mean)) {
    return material.g0Mean;
  }

  if (Number.isFinite(material?.elasticModulus)) {
    return material.elasticModulus / 16;
  }

  return null;
}

function normalizeTimberMaterialType(materialType) {
  const normalized = String(materialType ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");

  const aliases = {
    solid_timber: "solid_timber",
    solid: "solid_timber",
    glulam: "glulam",
    glued_laminated_timber: "glulam",
    lvl: "lvL",
    lv_l: "lvL",
    wood_based_panels: "wood_based_panels",
    panel: "wood_based_panels",
  };

  return aliases[normalized] ?? normalized;
}

function resolveKmod({
  context,
  material,
  kmod,
  kmodByDuration,
  kmodResolver,
  serviceClass,
  materialType,
}) {
  const loadDurationClass =
    context.governingLoadDurationClass ??
    context.loadDurationClass ??
    material.loadDurationClass ??
    "medium";

  if (typeof kmodResolver === "function") {
    return {
      kmod: kmodResolver({
        context,
        material,
        serviceClass,
        materialType,
        loadDurationClass,
      }),
      loadDurationClass,
    };
  }

  if (kmodByDuration && Number.isFinite(kmodByDuration[loadDurationClass])) {
    return {
      kmod: kmodByDuration[loadDurationClass],
      loadDurationClass,
    };
  }

  return {
    kmod: kmod ?? material.kmod ?? null,
    loadDurationClass,
  };
}

function designStrength(value, kmod, gammaM) {
  if (!Number.isFinite(value) || !Number.isFinite(kmod) || !Number.isFinite(gammaM)) {
    return null;
  }

  return (kmod * value) / gammaM;
}

export class TimberBeamSectionProvider {
  constructor({
    section,
    material,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = null,
    serviceClass = null,
    materialType = null,
    gammaM = null,
    kdef = null,
    kmod = null,
    kmodByDuration = null,
    kmodResolver = null,
    useFinalStiffness = false,
    units = null,
    metadata = {},
  } = {}) {
    if (!section) {
      throw new Error("TimberBeamSectionProvider requires a section.");
    }

    if (!material) {
      throw new Error("TimberBeamSectionProvider requires a material.");
    }

    this.section = section;
    this.material = material;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.serviceClass = serviceClass ?? material.serviceClass ?? 1;
    this.materialType = normalizeTimberMaterialType(
      materialType ?? material.metadata?.timberType ?? material.timberType,
    );
    this.gammaM = gammaM ?? material.metadata?.gammaM ?? null;
    this.kdef = kdef ?? material.kdef ?? material.metadata?.kdef ?? null;
    this.kmod = kmod;
    this.kmodByDuration = kmodByDuration ? { ...kmodByDuration } : null;
    this.kmodResolver = kmodResolver;
    this.useFinalStiffness = useFinalStiffness;
    this.units = units ?? resolveUnits(section, material);
    this.metadata = { ...metadata };
  }

  getElasticBeamProperties(context = {}) {
    const area = this.section.area;
    const inertia = this.section[this.bendingInertiaAxis];
    const elasticModulus = this.material.elasticModulus;
    const shearModulus = resolveShearModulus(this.material);
    const shearArea = this.section[this.shearAreaAxis] ?? this.section.area;
    const finalStiffness =
      context.deformationState === "final" ||
      context.serviceCombination === "final" ||
      context.serviceCombination === "quasi-permanent" ||
      this.useFinalStiffness;
    const stiffnessReduction =
      finalStiffness && Number.isFinite(this.kdef) ? 1 + this.kdef : 1;
    const effectiveElasticModulus = elasticModulus / stiffnessReduction;
    const effectiveShearModulus =
      Number.isFinite(shearModulus) ? shearModulus / stiffnessReduction : null;
    const { kmod, loadDurationClass } = resolveKmod({
      context,
      material: this.material,
      kmod: this.kmod,
      kmodByDuration: this.kmodByDuration,
      kmodResolver: this.kmodResolver,
      serviceClass: this.serviceClass,
      materialType: this.materialType,
    });

    assertPositive(area, "timber section area");
    assertPositive(inertia, `timber section ${this.bendingInertiaAxis}`);
    assertPositive(elasticModulus, "timber material elasticModulus");
    assertPositive(shearArea, `timber section ${this.shearAreaAxis} or area`);

    return {
      axialRigidity: effectiveElasticModulus * area,
      flexuralRigidity: effectiveElasticModulus * inertia,
      shearRigidity:
        Number.isFinite(effectiveShearModulus)
          ? effectiveShearModulus * shearArea
          : null,
      shearCorrectionFactor: this.shearCorrectionFactor ?? 5 / 6,
      units: this.units,
      metadata: {
        ...this.metadata,
        provider: "TimberBeamSectionProvider",
        source: "timber-simple-section",
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        materialType: this.materialType,
        serviceClass: this.serviceClass,
        loadDurationClass,
        governingLoadDurationClass: context.governingLoadDurationClass ?? loadDurationClass,
        kmod,
        kdef: this.kdef,
        gammaM: this.gammaM,
        finalStiffness,
        stiffnessReduction,
        fmD: designStrength(this.material.fmK, kmod, this.gammaM),
        fvD: designStrength(this.material.fvK, kmod, this.gammaM),
        fc0D: designStrength(this.material.fc0K, kmod, this.gammaM),
        ft0D: designStrength(this.material.ft0K, kmod, this.gammaM),
      },
    };
  }
}

export function createTimberBeamSectionProvider(options = {}) {
  return new TimberBeamSectionProvider(options);
}
