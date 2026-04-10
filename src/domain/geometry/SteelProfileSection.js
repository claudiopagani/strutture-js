import { CrossSection } from "./CrossSection.js";
import { getSteelProfileSectionData } from "./steelProfileCatalog.js";

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
    const data = profileData ?? getSteelProfileSectionData(profileName);

    if (!data) {
      throw new Error(`Unsupported steel profile section: ${profileName}.`);
    }

    super({
      id,
      name,
      area: overrides.area ?? data.A,
      inertiaY: overrides.inertiaY ?? data.Iy ?? data.I_strong ?? null,
      inertiaZ: overrides.inertiaZ ?? data.Iz ?? data.I_weak ?? null,
      torsionalConstant: overrides.torsionalConstant ?? data.IT ?? null,
      shearAreaY: overrides.shearAreaY ?? data.Av_y ?? null,
      shearAreaZ: overrides.shearAreaZ ?? data.Av_z ?? null,
      units,
      metadata: {
        ...metadata,
        profileName,
        family: data.family,
        source: "steel_profile_section_database",
      },
    });

    this.profileName = profileName;
    this.family = data.family ?? null;
    this.height = overrides.height ?? data.h ?? null;
    this.width = overrides.width ?? data.b ?? null;
    this.webThickness = overrides.webThickness ?? data.tw ?? null;
    this.flangeThickness = overrides.flangeThickness ?? data.tf ?? null;
    this.rootRadius = overrides.rootRadius ?? data.r ?? null;
    this.massPerLength = overrides.massPerLength ?? data.mass_per_length ?? null;
    this.perimeter = overrides.perimeter ?? data.perimeter ?? null;
    this.warpingConstant = overrides.warpingConstant ?? data.Iw ?? null;
    this.torsionalSectionModulus = overrides.torsionalSectionModulus ?? data.WT ?? null;
    this.warpingSectionModulus = overrides.warpingSectionModulus ?? data.Ww ?? null;
    this.radiusOfGyrationY = overrides.radiusOfGyrationY ?? data.iy ?? null;
    this.radiusOfGyrationZ = overrides.radiusOfGyrationZ ?? data.iz ?? null;
    this.elasticSectionModulusY = overrides.elasticSectionModulusY ?? data.Wel_y ?? data.Wel_strong ?? null;
    this.elasticSectionModulusZ = overrides.elasticSectionModulusZ ?? data.Wel_z ?? data.Wel_weak ?? null;
    this.plasticSectionModulusY = overrides.plasticSectionModulusY ?? data.Wpl_y ?? data.Wpl_strong ?? null;
    this.plasticSectionModulusZ = overrides.plasticSectionModulusZ ?? data.Wpl_z ?? data.Wpl_weak ?? null;
    this.catalogProperties = { ...data };
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
    };
  }
}
