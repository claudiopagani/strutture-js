import { CrossSection } from "./CrossSection.js";
import { createUnitResolver } from "../units/UnitSystem.js";
import {
  STEEL_PROFILE_AXIS_CONVENTION,
  STEEL_PROFILE_CATALOG_UNITS,
  STEEL_PROFILE_SOURCE_AXIS_CONVENTION,
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
    Iyy: resolver.inertia(data.Iyy),
    Izz: resolver.inertia(data.Izz),
    Wel_strong: resolver.sectionModulus(data.Wel_strong),
    Wel_weak: resolver.sectionModulus(data.Wel_weak),
    Wel_y: resolver.sectionModulus(data.Wel_y),
    Wel_z: resolver.sectionModulus(data.Wel_z),
    Wel_yy: resolver.sectionModulus(data.Wel_yy),
    Wel_zz: resolver.sectionModulus(data.Wel_zz),
    Wpl_strong: resolver.sectionModulus(data.Wpl_strong),
    Wpl_weak: resolver.sectionModulus(data.Wpl_weak),
    Wpl_y: resolver.sectionModulus(data.Wpl_y),
    Wpl_z: resolver.sectionModulus(data.Wpl_z),
    Wpl_yy: resolver.sectionModulus(data.Wpl_yy),
    Wpl_zz: resolver.sectionModulus(data.Wpl_zz),
    WT: resolver.sectionModulus(data.WT),
    Ww: resolver.sectionModulus(data.Ww),
    Av_along_y: resolver.area(data.Av_along_y),
    Av_along_z: resolver.area(data.Av_along_z),
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
    inertiaAboutY:
      overrides.inertiaAboutY == null
        ? overrides.inertiaAboutY
        : resolver.inertia(overrides.inertiaAboutY),
    inertiaAboutZ:
      overrides.inertiaAboutZ == null
        ? overrides.inertiaAboutZ
        : resolver.inertia(overrides.inertiaAboutZ),
    inertiaYY:
      overrides.inertiaYY == null ? overrides.inertiaYY : resolver.inertia(overrides.inertiaYY),
    inertiaZZ:
      overrides.inertiaZZ == null ? overrides.inertiaZZ : resolver.inertia(overrides.inertiaZZ),
    torsionalConstant:
      overrides.torsionalConstant == null
        ? overrides.torsionalConstant
        : resolver.inertia(overrides.torsionalConstant),
    warpingConstant:
      overrides.warpingConstant == null
        ? overrides.warpingConstant
        : resolver.convert(overrides.warpingConstant, { lengthExponent: 6 }),
    shearAreaY:
      overrides.shearAreaY == null ? overrides.shearAreaY : resolver.area(overrides.shearAreaY),
    shearAreaZ:
      overrides.shearAreaZ == null ? overrides.shearAreaZ : resolver.area(overrides.shearAreaZ),
    shearAreaAlongY:
      overrides.shearAreaAlongY == null
        ? overrides.shearAreaAlongY
        : resolver.area(overrides.shearAreaAlongY),
    shearAreaAlongZ:
      overrides.shearAreaAlongZ == null
        ? overrides.shearAreaAlongZ
        : resolver.area(overrides.shearAreaAlongZ),
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
    radiusOfGyrationAboutY:
      overrides.radiusOfGyrationAboutY == null
        ? overrides.radiusOfGyrationAboutY
        : resolver.length(overrides.radiusOfGyrationAboutY),
    radiusOfGyrationAboutZ:
      overrides.radiusOfGyrationAboutZ == null
        ? overrides.radiusOfGyrationAboutZ
        : resolver.length(overrides.radiusOfGyrationAboutZ),
    elasticSectionModulusY:
      overrides.elasticSectionModulusY == null
        ? overrides.elasticSectionModulusY
        : resolver.sectionModulus(overrides.elasticSectionModulusY),
    elasticSectionModulusZ:
      overrides.elasticSectionModulusZ == null
        ? overrides.elasticSectionModulusZ
        : resolver.sectionModulus(overrides.elasticSectionModulusZ),
    elasticSectionModulusAboutY:
      overrides.elasticSectionModulusAboutY == null
        ? overrides.elasticSectionModulusAboutY
        : resolver.sectionModulus(overrides.elasticSectionModulusAboutY),
    elasticSectionModulusAboutZ:
      overrides.elasticSectionModulusAboutZ == null
        ? overrides.elasticSectionModulusAboutZ
        : resolver.sectionModulus(overrides.elasticSectionModulusAboutZ),
    elasticSectionModulusYY:
      overrides.elasticSectionModulusYY == null
        ? overrides.elasticSectionModulusYY
        : resolver.sectionModulus(overrides.elasticSectionModulusYY),
    elasticSectionModulusZZ:
      overrides.elasticSectionModulusZZ == null
        ? overrides.elasticSectionModulusZZ
        : resolver.sectionModulus(overrides.elasticSectionModulusZZ),
    plasticSectionModulusY:
      overrides.plasticSectionModulusY == null
        ? overrides.plasticSectionModulusY
        : resolver.sectionModulus(overrides.plasticSectionModulusY),
    plasticSectionModulusZ:
      overrides.plasticSectionModulusZ == null
        ? overrides.plasticSectionModulusZ
        : resolver.sectionModulus(overrides.plasticSectionModulusZ),
    plasticSectionModulusAboutY:
      overrides.plasticSectionModulusAboutY == null
        ? overrides.plasticSectionModulusAboutY
        : resolver.sectionModulus(overrides.plasticSectionModulusAboutY),
    plasticSectionModulusAboutZ:
      overrides.plasticSectionModulusAboutZ == null
        ? overrides.plasticSectionModulusAboutZ
        : resolver.sectionModulus(overrides.plasticSectionModulusAboutZ),
    plasticSectionModulusYY:
      overrides.plasticSectionModulusYY == null
        ? overrides.plasticSectionModulusYY
        : resolver.sectionModulus(overrides.plasticSectionModulusYY),
    plasticSectionModulusZZ:
      overrides.plasticSectionModulusZZ == null
        ? overrides.plasticSectionModulusZZ
        : resolver.sectionModulus(overrides.plasticSectionModulusZZ),
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
    const inertiaAboutY = firstDefined(
      resolvedOverrides.inertiaAboutY,
      resolvedOverrides.inertiaYY,
      data.Iyy,
      data.Iy,
      data.I_weak,
      null,
    );
    const inertiaAboutZ = firstDefined(
      resolvedOverrides.inertiaAboutZ,
      resolvedOverrides.inertiaZZ,
      data.Izz,
      data.Iz,
      data.I_strong,
      null,
    );
    const elasticSectionModulusAboutY = firstDefined(
      resolvedOverrides.elasticSectionModulusAboutY,
      resolvedOverrides.elasticSectionModulusYY,
      data.Wel_yy,
      data.Wel_y,
      data.Wel_weak,
      null,
    );
    const elasticSectionModulusAboutZ = firstDefined(
      resolvedOverrides.elasticSectionModulusAboutZ,
      resolvedOverrides.elasticSectionModulusZZ,
      data.Wel_zz,
      data.Wel_z,
      data.Wel_strong,
      null,
    );
    const plasticSectionModulusAboutY = firstDefined(
      resolvedOverrides.plasticSectionModulusAboutY,
      resolvedOverrides.plasticSectionModulusYY,
      data.Wpl_yy,
      data.Wpl_y,
      data.Wpl_weak,
      null,
    );
    const plasticSectionModulusAboutZ = firstDefined(
      resolvedOverrides.plasticSectionModulusAboutZ,
      resolvedOverrides.plasticSectionModulusZZ,
      data.Wpl_zz,
      data.Wpl_z,
      data.Wpl_strong,
      null,
    );
    const shearAreaAlongY = firstDefined(
      resolvedOverrides.shearAreaAlongY,
      data.Av_along_y,
      data.Av_y,
      null,
    );
    const shearAreaAlongZ = firstDefined(
      resolvedOverrides.shearAreaAlongZ,
      data.Av_along_z,
      data.Av_z,
      null,
    );
    const radiusOfGyrationAboutY = firstDefined(
      resolvedOverrides.radiusOfGyrationAboutY,
      data.iy,
      null,
    );
    const radiusOfGyrationAboutZ = firstDefined(
      resolvedOverrides.radiusOfGyrationAboutZ,
      data.iz,
      null,
    );

    super({
      id,
      name,
      area: firstDefined(resolvedOverrides.area, data.A),
      // Legacy beam-provider names: inertiaY is the primary vertical-bending
      // inertia, which is the geometric SCA inertia about z-z.
      inertiaY: firstDefined(resolvedOverrides.inertiaY, inertiaAboutZ),
      inertiaZ: firstDefined(resolvedOverrides.inertiaZ, inertiaAboutY),
      torsionalConstant: firstDefined(resolvedOverrides.torsionalConstant, data.IT, null),
      shearAreaY: firstDefined(resolvedOverrides.shearAreaY, shearAreaAlongY),
      shearAreaZ: firstDefined(resolvedOverrides.shearAreaZ, shearAreaAlongZ),
      units: INTERNAL_UNITS,
      metadata: {
        ...metadata,
        profileName,
        family: data.family,
        source: "steel_profile_section_database",
        axisConvention: STEEL_PROFILE_AXIS_CONVENTION,
        sourceAxisConvention: STEEL_PROFILE_SOURCE_AXIS_CONVENTION,
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
    this.warpingConstant = firstDefined(resolvedOverrides.warpingConstant, data.Iw, null);
    this.torsionalSectionModulus = firstDefined(resolvedOverrides.torsionalSectionModulus, data.WT, null);
    this.warpingSectionModulus = firstDefined(resolvedOverrides.warpingSectionModulus, data.Ww, null);
    this.radiusOfGyrationY = firstDefined(resolvedOverrides.radiusOfGyrationY, radiusOfGyrationAboutZ, null);
    this.radiusOfGyrationZ = firstDefined(resolvedOverrides.radiusOfGyrationZ, radiusOfGyrationAboutY, null);
    this.elasticSectionModulusY = firstDefined(resolvedOverrides.elasticSectionModulusY, elasticSectionModulusAboutZ, null);
    this.elasticSectionModulusZ = firstDefined(resolvedOverrides.elasticSectionModulusZ, elasticSectionModulusAboutY, null);
    this.plasticSectionModulusY = firstDefined(resolvedOverrides.plasticSectionModulusY, plasticSectionModulusAboutZ, null);
    this.plasticSectionModulusZ = firstDefined(resolvedOverrides.plasticSectionModulusZ, plasticSectionModulusAboutY, null);
    this.inertiaAboutY = inertiaAboutY;
    this.inertiaAboutZ = inertiaAboutZ;
    this.inertiaYY = inertiaAboutY;
    this.inertiaZZ = inertiaAboutZ;
    this.elasticSectionModulusAboutY = elasticSectionModulusAboutY;
    this.elasticSectionModulusAboutZ = elasticSectionModulusAboutZ;
    this.elasticSectionModulusYY = elasticSectionModulusAboutY;
    this.elasticSectionModulusZZ = elasticSectionModulusAboutZ;
    this.plasticSectionModulusAboutY = plasticSectionModulusAboutY;
    this.plasticSectionModulusAboutZ = plasticSectionModulusAboutZ;
    this.plasticSectionModulusYY = plasticSectionModulusAboutY;
    this.plasticSectionModulusZZ = plasticSectionModulusAboutZ;
    this.shearAreaAlongY = shearAreaAlongY;
    this.shearAreaAlongZ = shearAreaAlongZ;
    this.radiusOfGyrationAboutY = radiusOfGyrationAboutY;
    this.radiusOfGyrationAboutZ = radiusOfGyrationAboutZ;
    this.axisConvention = STEEL_PROFILE_AXIS_CONVENTION;
    this.sourceAxisConvention = STEEL_PROFILE_SOURCE_AXIS_CONVENTION;
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
      inertiaAboutY: this.inertiaAboutY,
      inertiaAboutZ: this.inertiaAboutZ,
      inertiaYY: this.inertiaYY,
      inertiaZZ: this.inertiaZZ,
      elasticSectionModulusAboutY: this.elasticSectionModulusAboutY,
      elasticSectionModulusAboutZ: this.elasticSectionModulusAboutZ,
      elasticSectionModulusYY: this.elasticSectionModulusYY,
      elasticSectionModulusZZ: this.elasticSectionModulusZZ,
      plasticSectionModulusAboutY: this.plasticSectionModulusAboutY,
      plasticSectionModulusAboutZ: this.plasticSectionModulusAboutZ,
      plasticSectionModulusYY: this.plasticSectionModulusYY,
      plasticSectionModulusZZ: this.plasticSectionModulusZZ,
      shearAreaAlongY: this.shearAreaAlongY,
      shearAreaAlongZ: this.shearAreaAlongZ,
      radiusOfGyrationAboutY: this.radiusOfGyrationAboutY,
      radiusOfGyrationAboutZ: this.radiusOfGyrationAboutZ,
      axisConvention: { ...this.axisConvention },
      sourceAxisConvention: { ...this.sourceAxisConvention },
      catalogProperties: { ...this.catalogProperties },
      convertedCatalogProperties: { ...this.convertedCatalogProperties },
    };
  }
}
