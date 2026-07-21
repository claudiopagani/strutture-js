export const GROUND_ANCHOR_BOND_CATALOG_REFERENCE = Object.freeze({
  title: "FHWA GEC 4, Ground Anchors and Anchored Systems",
  publication: "FHWA-IF-99-015",
  year: 1999,
  sections: ["5.3.6", "Tables 6 and 8"],
  url: "https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf",
});

const ENTRIES = Object.freeze([
  ["sand-gravel-loose", "Sand and gravel, loose", "soil", 145, 2],
  ["sand-gravel-medium-dense", "Sand and gravel, medium dense", "soil", 220, 2],
  ["sand-gravel-dense", "Sand and gravel, dense", "soil", 290, 2],
  ["sand-loose", "Sand, loose", "soil", 100, 2],
  ["sand-medium-dense", "Sand, medium dense", "soil", 145, 2],
  ["sand-dense", "Sand, dense", "soil", 190, 2],
  ["sand-silt-loose", "Sand and silt, loose", "soil", 70, 2],
  ["sand-silt-medium-dense", "Sand and silt, medium dense", "soil", 100, 2],
  ["sand-silt-dense", "Sand and silt, dense", "soil", 130, 2],
  [
    "low-plasticity-silt-clay-stiff",
    "Low-plasticity silt-clay mixture or fine micaceous sand/silt, stiff",
    "soil",
    30,
    2,
  ],
  [
    "low-plasticity-silt-clay-hard",
    "Low-plasticity silt-clay mixture or fine micaceous sand/silt, hard",
    "soil",
    60,
    2,
  ],
  ["granite-basalt", "Granite or basalt", "competent-rock", 730, 3],
  [
    "dolomitic-limestone",
    "Dolomitic limestone",
    "competent-rock",
    580,
    3,
  ],
  ["soft-limestone", "Soft limestone", "competent-rock", 440, 3],
  ["sandstone", "Sandstone", "competent-rock", 440, 3],
  ["slate-hard-shale", "Slate or hard shale", "competent-rock", 360, 3],
  ["soft-shale", "Soft shale", "competent-rock", 150, 3],
].map(([id, name, groundClass, ultimateTransferLoad, capacityDivisor]) =>
  Object.freeze({
    id,
    name,
    model: "small-diameter-straight-shaft-gravity-grouted",
    groundClass,
    ultimateTransferLoad,
    capacityDivisor,
    units: "kN/m",
    status: "presumptive-preliminary-design",
    reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
  })));

export const GROUND_ANCHOR_BOND_CATALOG = Object.freeze(
  Object.fromEntries(ENTRIES.map((entry) => [entry.id, entry])),
);

export const GROUND_ANCHOR_BOND_CATALOG_IDS = Object.freeze(
  ENTRIES.map(({ id }) => id),
);

export function listGroundAnchorBondCatalogEntries() {
  return ENTRIES.map((entry) => structuredClone(entry));
}

export function getGroundAnchorBondCatalogEntry(id) {
  const entry = GROUND_ANCHOR_BOND_CATALOG[id];
  if (!entry) throw new Error(`Unknown ground-anchor bond catalog id: ${id}.`);
  return structuredClone(entry);
}
