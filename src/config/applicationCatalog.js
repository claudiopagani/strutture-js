export const APPLICATION_CATALOG = [
  {
    id: "single-beam-design",
    name: "Single Beam Design",
    domain: "beams",
    maturity: "mvp",
    primaryFocus: "End-to-end simple beam analysis, verification and reporting.",
  },
  {
    id: "steel-frames",
    name: "Steel Frames",
    domain: "steel",
    maturity: "partial",
    primaryFocus: "Analysis and checks of steel frames and members.",
  },
  {
    id: "masonry-ring-beams",
    name: "Masonry Ring Beams",
    domain: "masonry",
    maturity: "scaffolded",
    primaryFocus: "Sizing and verification of cerchiature in masonry walls.",
  },
  {
    id: "masonry-piers",
    name: "Masonry Piers",
    domain: "masonry",
    maturity: "partial",
    primaryFocus:
      "Vertical verification of masonry piers and equivalent-frame 2D idealization with rigid end zones.",
  },
  {
    id: "masonry-wall-openings",
    name: "Masonry Wall Openings",
    domain: "masonry",
    maturity: "partial",
    primaryFocus:
      "Geometry sanitization, equivalent-frame extraction, static vertical analysis, aggregated seismic capacity curves, ante/post comparison workflows and reporting for masonry wall alignments with openings.",
  },
  {
    id: "reinforced-concrete-sections",
    name: "RC Sections",
    domain: "reinforced-concrete",
    maturity: "implemented",
    primaryFocus: "Section analysis for axial force and bending.",
  },
  {
    id: "reinforced-concrete-plates",
    name: "RC Plates",
    domain: "reinforced-concrete",
    maturity: "implemented",
    primaryFocus:
      "Local ULS and SLE verification of flat RC plates through rotated Wood-Armer equivalent strips.",
  },
  {
    id: "reinforced-concrete-columns",
    name: "RC Columns",
    domain: "reinforced-concrete",
    maturity: "partial",
    primaryFocus:
      "Local NTC 2018 slenderness screening and biaxial resistance verification of reinforced-concrete columns.",
  },
  {
    id: "reinforced-concrete-isolated-footings",
    name: "RC Isolated Footings",
    domain: "reinforced-concrete",
    maturity: "partial",
    primaryFocus:
      "Local contact, assigned geotechnical resistance and structural verification of centered rectangular isolated footings.",
  },
  {
    id: "reinforced-concrete-foundation-beams",
    name: "RC Foundation Beams",
    domain: "reinforced-concrete",
    maturity: "partial",
    primaryFocus:
      "Linear Winkler-foundation analysis and local section verification of horizontal reinforced-concrete foundation beams.",
  },
  {
    id: "reinforced-concrete-beam-column-joints",
    name: "RC Beam-Column Joints",
    domain: "reinforced-concrete",
    maturity: "partial",
    primaryFocus:
      "Local NTC 2018 joint-panel, confinement and strong-column weak-beam checks from assigned seismic actions and capacities.",
  },
  {
    id: "timber-beams",
    name: "Timber Beams",
    domain: "timber",
    maturity: "partial",
    primaryFocus: "Verification of timber beams in resistance and serviceability.",
  },
  {
    id: "timber-concrete-composite-beams",
    name: "Timber Concrete Composite Beams",
    domain: "timber",
    maturity: "implemented",
    primaryFocus: "Verification of timber beams with collaborating concrete slab.",
  },
  {
    id: "timber-xlam-composite-beams",
    name: "Timber XLAM Composite Beams",
    domain: "timber",
    maturity: "implemented",
    primaryFocus: "Verification of timber beams collaborating with XLAM panels.",
  },
  {
    id: "xlam-panels-out-of-plane",
    name: "XLAM Panels Out Of Plane",
    domain: "timber",
    maturity: "implemented",
    primaryFocus: "Out-of-plane verification of standalone XLAM floor panels.",
  },
  {
    id: "rc-cracked-deflection",
    name: "RC Cracked Deflection",
    domain: "reinforced-concrete",
    maturity: "partial",
    primaryFocus: "Deflection analysis of cracked RC beams.",
  },
  {
    id: "masonry-out-of-plane",
    name: "Masonry Out Of Plane",
    domain: "masonry",
    maturity: "scaffolded",
    primaryFocus: "Local out-of-plane kinematic mechanisms in masonry walls.",
  },
  {
    id: "micropiles-broms",
    name: "Micropiles Broms",
    domain: "geotechnics",
    maturity: "scaffolded",
    primaryFocus: "Micropile lateral analysis based on Broms theory.",
  },
];
