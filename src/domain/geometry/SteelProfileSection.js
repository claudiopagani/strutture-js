import { CrossSection } from "./CrossSection.js";
import { createUnitResolver } from "../units/UnitSystem.js";
import {
  STEEL_PROFILE_CATALOG_UNITS,
  getSteelProfileSectionData,
} from "./steelProfileCatalog.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function convertCatalogData(data) {
  const resolver = createUnitResolver(STEEL_PROFILE_CATALOG_UNITS, INTERNAL_UNITS);

  return {
    ...data,
    A: resolver.area(data.A),
    Av_y: resolver.area(data.Av_y),
    Av_z: resolver.area(data.Av_z),
    IT: resolver.inertia(data.IT),
    Iw: resolver.convert(data.Iw, { lengthExponent: 6 }),
    I_strong: resolver.inertia(data.I_strong),
    I_weak: resolver.inertia(data.I_weak),
    Iy: resolver.inertia(data.Iy),
    Iz: resolver.inertia(data.Iz),
    Wel_strong: resolver.sectionModulus(data.Wel_strong),
    Wel_weak: resolver.sectionModulus(data.Wel_weak),
    Wel_y: resolver.sectionModulus(data.Wel_y),
    Wel_z: resolver.sectionModulus(data.Wel_z),
    Wpl_strong: resolver.sectionModulus(data.Wpl_strong),
    Wpl_weak: resolver.sectionModulus(data.Wpl_weak),
    Wpl_y: resolver.sectionModulus(data.Wpl_y),
    Wpl_z: resolver.sectionModulus(data.Wpl_z),
    WT: resolver.sectionModulus(data.WT),
    Ww: resolver.sectionModulus(data.Ww),
    b: resolver.length(data.b),
    h: resolver.length(data.h),
    iy: resolver.length(data.iy),
    iz: resolver.length(data.iz),
    perimeter: resolver.length(data.perimeter),
    r: resolver.length(data.r),
    tf: resolver.length(data.tf),
    tw: resolver.length(data.tw),
  };
}

function convertOverrides(overrides, units) {
  const resolver = createUnitResolver(units, INTERNAL_UNITS);

  return {
    ...overrides,
    area: overrides.area == null ? overrides.area : resolver.area(overrides.area),
    inertiaY: overrides.inertiaY == null ? overrides.inertiaY : resolver.inertia(overrides.inertiaY),
    inertiaZ: overrides.inertiaZ == null ? overrides.inertiaZ : resolver.inertia(overrides.inertiaZ),
    torsionalConstant:
      overrides.torsionalConstant == null
        ? overrides.torsionalConstant
        : resolver.inertia(overrides.torsionalConstant),
    shearAreaY:
      overrides.shearAreaY == null ? overrides.shearAreaY : resolver.area(overrides.shearAreaY),
    shearAreaZ:
      overrides.shearAreaZ == null ? overrides.shearAreaZ : resolver.area(overrides.shearAreaZ),
    height: overrides.height == null ? overrides.height : resolver.length(overrides.height),
    width: overrides.width == null ? overrides.width : resolver.length(overrides.width),
    webThickness:
      overrides.webThickness == null
        ? overrides.webThickness
        : resolver.length(overrides.webThickness),
    flangeThickness:
      overrides.flangeThickness == null
        ? overrides.flangeThickness
        : resolver.length(overrides.flangeThickness),
    rootRadius:
      overrides.rootRadius == null ? overrides.rootRadius : resolver.length(overrides.rootRadius),
    perimeter:
      overrides.perimeter == null ? overrides.perimeter : resolver.length(overrides.perimeter),
    radiusOfGyrationY:
      overrides.radiusOfGyrationY == null
        ? overrides.radiusOfGyrationY
        : resolver.length(overrides.radiusOfGyrationY),
    radiusOfGyrationZ:
      overrides.radiusOfGyrationZ == null
        ? overrides.radiusOfGyrationZ
        : resolver.length(overrides.radiusOfGyrationZ),
    elasticSectionModulusY:
      overrides.elasticSectionModulusY == null
        ? overrides.elasticSectionModulusY
        : resolver.sectionModulus(overrides.elasticSectionModulusY),
    elasticSectionModulusZ:
      overrides.elasticSectionModulusZ == null
        ? overrides.elasticSectionModulusZ
        : resolver.sectionModulus(overrides.elasticSectionModulusZ),
    plasticSectionModulusY:
      overrides.plasticSectionModulusY == null
        ? overrides.plasticSectionModulusY
        : resolver.sectionModulus(overrides.plasticSectionModulusY),
    plasticSectionModulusZ:
      overrides.plasticSectionModulusZ == null
        ? overrides.plasticSectionModulusZ
        : resolver.sectionModulus(overrides.plasticSectionModulusZ),
    torsionalSectionModulus:
      overrides.torsionalSectionModulus == null
        ? overrides.torsionalSectionModulus
        : resolver.sectionModulus(overrides.torsionalSectionModulus),
    warpingSectionModulus:
      overrides.warpingSectionModulus == null
        ? overrides.warpingSectionModulus
        : resolver.sectionModulus(overrides.warpingSectionModulus),
  };
}

export class SteelProfileSection extends CrossSection {
  constructor({
    profileName,
    id = profileName,
    name = profileName,
    profileData = null,
    units = null,
    metadata = {},
    ...overrides
  }) {
    const rawData = profileData ?? getSteelProfileSectionData(profileName);

    if (!rawData) {
      throw new Error(`Unsupported steel profile section: ${profileName}.`);
    }

    const data = convertCatalogData(rawData);
    const resolvedOverrides = convertOverrides(overrides, units);

    super({
      id,
      name,
      area: firstDefined(resolvedOverrides.area, data.A),
      inertiaY: firstDefined(resolvedOverrides.inertiaY, data.Iy, data.I_strong, null),
      inertiaZ: firstDefined(resolvedOverrides.inertiaZ, data.Iz, data.I_weak, null),
      torsionalConstant: firstDefined(resolvedOverrides.torsionalConstant, data.IT, null),
      shearAreaY: firstDefined(resolvedOverrides.shearAreaY, data.Av_y, null),
      shearAreaZ: firstDefined(resolvedOverrides.shearAreaZ, data.Av_z, null),
      units: INTERNAL_UNITS,
      metadata: {
        ...metadata,
        profileName,
        family: data.family,
        source: "steel_profile_section_database",
        catalogUnitSystem: STEEL_PROFILE_CATALOG_UNITS,
        sourceUnitSystem: units,
      },
    });

    this.profileName = profileName;
    this.family = data.family ?? null;
    this.height = firstDefined(resolvedOverrides.height, data.h, null);
    this.width = firstDefined(resolvedOverrides.width, data.b, null);
    this.webThickness = firstDefined(resolvedOverrides.webThickness, data.tw, null);
    this.flangeThickness = firstDefined(resolvedOverrides.flangeThickness, data.tf, null);
    this.rootRadius = firstDefined(resolvedOverrides.rootRadius, data.r, null);
    this.massPerLength = firstDefined(overrides.massPerLength, data.mass_per_length, null);
    this.perimeter = firstDefined(resolvedOverrides.perimeter, data.perimeter, null);
    this.warpingConstant = firstDefined(overrides.warpingConstant, data.Iw, null);
    this.torsionalSectionModulus = firstDefined(resolvedOverrides.torsionalSectionModulus, data.WT, null);
    this.warpingSectionModulus = firstDefined(resolvedOverrides.warpingSectionModulus, data.Ww, null);
    this.radiusOfGyrationY = firstDefined(resolvedOverrides.radiusOfGyrationY, data.iy, null);
    this.radiusOfGyrationZ = firstDefined(resolvedOverrides.radiusOfGyrationZ, data.iz, null);
    this.elasticSectionModulusY = firstDefined(resolvedOverrides.elasticSectionModulusY, data.Wel_y, data.Wel_strong, null);
    this.elasticSectionModulusZ = firstDefined(resolvedOverrides.elasticSectionModulusZ, data.Wel_z, data.Wel_weak, null);
    this.plasticSectionModulusY = firstDefined(resolvedOverrides.plasticSectionModulusY, data.Wpl_y, data.Wpl_strong, null);
    this.plasticSectionModulusZ = firstDefined(resolvedOverrides.plasticSectionModulusZ, data.Wpl_z, data.Wpl_weak, null);
    this.catalogProperties = { ...rawData };
    this.convertedCatalogProperties = { ...data };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      profileName: this.profileName,
      family: this.family,
      height: this.height,
      width: this.width,
      webThickness: this.webThickness,
      flangeThickness: this.flangeThickness,
      rootRadius: this.rootRadius,
      massPerLength: this.massPerLength,
      perimeter: this.perimeter,
      warpingConstant: this.warpingConstant,
      torsionalSectionModulus: this.torsionalSectionModulus,
      warpingSectionModulus: this.warpingSectionModulus,
      radiusOfGyrationY: this.radiusOfGyrationY,
      radiusOfGyrationZ: this.radiusOfGyrationZ,
      elasticSectionModulusY: this.elasticSectionModulusY,
      elasticSectionModulusZ: this.elasticSectionModulusZ,
      plasticSectionModulusY: this.plasticSectionModulusY,
      plasticSectionModulusZ: this.plasticSectionModulusZ,
      catalogProperties: { ...this.catalogProperties },
      convertedCatalogProperties: { ...this.convertedCatalogProperties },
    };
  }
}
