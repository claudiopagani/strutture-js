import { createUnitResolver } from "../units/UnitSystem.js";

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

  if (
    Number.isFinite(material?.elasticModulus) &&
    Number.isFinite(material?.poissonRatio)
  ) {
    return material.elasticModulus / (2 * (1 + material.poissonRatio));
  }

  if (Number.isFinite(material?.elasticModulus)) {
    return material.elasticModulus / (2 * (1 + 0.3));
  }

  return null;
}

function designStrength(material, gammaM0) {
  if (Number.isFinite(material?.fyd)) {
    return material.fyd;
  }

  if (Number.isFinite(material?.fyk) && Number.isFinite(gammaM0)) {
    return material.fyk / gammaM0;
  }

  return null;
}

function catalogKeyForSectionModulus(axis) {
  const aliases = {
    elasticSectionModulusY: ["Wel_y", "Wel_strong"],
    elasticSectionModulusZ: ["Wel_z", "Wel_weak"],
    plasticSectionModulusY: ["Wpl_y", "Wpl_strong"],
    plasticSectionModulusZ: ["Wpl_z", "Wpl_weak"],
  };

  return aliases[axis] ?? [];
}

function resolveSectionModulus(section, axis) {
  for (const key of catalogKeyForSectionModulus(axis)) {
    const value = section.catalogProperties?.[key];

    if (Number.isFinite(value) && section.metadata?.unitSystem) {
      return createUnitResolver(section.metadata.unitSystem, DEFAULT_UNITS).sectionModulus(value);
    }
  }

  return section[axis];
}

export class SteelBeamSectionProvider {
  constructor({
    section,
    material,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    elasticSectionModulusAxis = "elasticSectionModulusY",
    plasticSectionModulusAxis = "plasticSectionModulusY",
    shearCorrectionFactor = null,
    gammaM0 = null,
    units = null,
    metadata = {},
  } = {}) {
    if (!section) {
      throw new Error("SteelBeamSectionProvider requires a section.");
    }

    if (!material) {
      throw new Error("SteelBeamSectionProvider requires a material.");
    }

    this.section = section;
    this.material = material;
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.elasticSectionModulusAxis = elasticSectionModulusAxis;
    this.plasticSectionModulusAxis = plasticSectionModulusAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.gammaM0 = gammaM0 ?? material.metadata?.gammaM0 ?? null;
    this.units = units ?? resolveUnits(section, material);
    this.metadata = { ...metadata };
  }

  getElasticBeamProperties(context = {}) {
    const area = this.section.area;
    const inertia = this.section[this.bendingInertiaAxis];
    const elasticModulus = this.material.elasticModulus;
    const shearModulus = resolveShearModulus(this.material);
    const shearArea = this.section[this.shearAreaAxis] ?? this.section.area;
    const fyd = designStrength(this.material, this.gammaM0);
    const elasticSectionModulus = resolveSectionModulus(
      this.section,
      this.elasticSectionModulusAxis,
    );
    const plasticSectionModulus = resolveSectionModulus(
      this.section,
      this.plasticSectionModulusAxis,
    );

    assertPositive(area, "steel section area");
    assertPositive(inertia, `steel section ${this.bendingInertiaAxis}`);
    assertPositive(elasticModulus, "steel material elasticModulus");
    assertPositive(shearArea, `steel section ${this.shearAreaAxis} or area`);

    return {
      axialRigidity: elasticModulus * area,
      flexuralRigidity: elasticModulus * inertia,
      shearRigidity:
        Number.isFinite(shearModulus) ? shearModulus * shearArea : null,
      shearCorrectionFactor: this.shearCorrectionFactor ?? 1,
      units: this.units,
      metadata: {
        ...this.metadata,
        provider: "SteelBeamSectionProvider",
        source: "steel-elastic-section",
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        elasticSectionModulusAxis: this.elasticSectionModulusAxis,
        plasticSectionModulusAxis: this.plasticSectionModulusAxis,
        profileName: this.section.profileName ?? null,
        family: this.section.family ?? null,
        grade: this.material.grade ?? null,
        fyk: this.material.fyk ?? null,
        fyd,
        gammaM0: this.gammaM0,
        elasticMomentResistance:
          Number.isFinite(fyd) && Number.isFinite(elasticSectionModulus)
            ? fyd * elasticSectionModulus
            : null,
        plasticMomentResistance:
          Number.isFinite(fyd) && Number.isFinite(plasticSectionModulus)
            ? fyd * plasticSectionModulus
            : null,
        shearResistance:
          Number.isFinite(fyd) && Number.isFinite(shearArea)
            ? (fyd * shearArea) / Math.sqrt(3)
            : null,
        limitState: context.limitState ?? null,
      },
    };
  }
}

export function createSteelBeamSectionProvider(options = {}) {
  return new SteelBeamSectionProvider(options);
}
