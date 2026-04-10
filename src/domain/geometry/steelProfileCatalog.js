import sectionDatabase from "../../data/section_database.json" with { type: "json" };

export const STEEL_PROFILE_SECTION_DATABASE = Object.freeze(sectionDatabase);

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
