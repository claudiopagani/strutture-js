import sectionDatabase from "../../data/section_database.json" with { type: "json" };

export const STEEL_PROFILE_CATALOG_UNITS = Object.freeze({
  force: "N",
  length: "m",
});

export const STEEL_PROFILE_SOURCE_AXIS_CONVENTION = Object.freeze({
  id: "european-profile-table-y-major-z-minor",
  description:
    "Source profile-table axes use y-y as the usual horizontal major axis and z-z as the usual vertical minor axis.",
});

export const STEEL_PROFILE_AXIS_CONVENTION = Object.freeze({
  id: "sca-y-vertical-z-horizontal-x-longitudinal",
  description:
    "SCA convention: yy is vertical in the section plane, zz is horizontal, and xx is the longitudinal member axis.",
});

function swapPair(data, yKey, zKey) {
  return {
    [yKey]: data[zKey],
    [zKey]: data[yKey],
  };
}

function addAxisAliases(data) {
  return {
    ...data,
    Iyy: data.Iy,
    Izz: data.Iz,
    Wel_yy: data.Wel_y,
    Wel_zz: data.Wel_z,
    Wpl_yy: data.Wpl_y,
    Wpl_zz: data.Wpl_z,
    Av_along_y: data.Av_y,
    Av_along_z: data.Av_z,
  };
}

function normalizeSteelProfileAxisConvention(data) {
  const scaData = {
    ...data,
    ...swapPair(data, "Av_y", "Av_z"),
    ...swapPair(data, "Iy", "Iz"),
    ...swapPair(data, "Wel_y", "Wel_z"),
    ...swapPair(data, "Wpl_y", "Wpl_z"),
    ...swapPair(data, "iy", "iz"),
    sourceAxisConvention: STEEL_PROFILE_SOURCE_AXIS_CONVENTION.id,
    axisConvention: STEEL_PROFILE_AXIS_CONVENTION.id,
  };

  return addAxisAliases(scaData);
}

export const STEEL_PROFILE_SECTION_DATABASE = Object.freeze(
  Object.fromEntries(
    Object.entries(sectionDatabase).map(([profileName, data]) => [
      profileName,
      Object.freeze(normalizeSteelProfileAxisConvention(data)),
    ]),
  ),
);

export const STEEL_PROFILE_SECTION_NAMES = Object.freeze(
  Object.keys(STEEL_PROFILE_SECTION_DATABASE).sort(),
);

export const STEEL_PROFILE_FAMILIES = Object.freeze(
  [...new Set(Object.values(STEEL_PROFILE_SECTION_DATABASE).map((item) => item.family))].sort(),
);

export function getSteelProfileSectionData(profileName) {
  return STEEL_PROFILE_SECTION_DATABASE[profileName] ?? null;
}

export function listSteelProfileSectionsByFamily(family) {
  return STEEL_PROFILE_SECTION_NAMES.filter(
    (profileName) => STEEL_PROFILE_SECTION_DATABASE[profileName].family === family,
  );
}
