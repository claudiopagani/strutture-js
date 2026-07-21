export const APPLICATION_CATALOG = [
  {
    id: "single-beam-design",
    name: "Single Beam Design",
    domain: "beams",
    maturity: "implemented-local",
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
      "Vertical verification, NTC 2018/Circular 2019 bilinear in-plane capacity envelope, cyclic physical macroelement and equivalent-frame idealization.",
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
    id: "reinforced-concrete-punching",
    name: "RC Punching",
    domain: "reinforced-concrete",
    maturity: "implemented",
    primaryFocus:
      "Local punching verification of RC slabs through a serializable connection, action-state and control-perimeter contract.",
  },
  {
    id: "reinforced-concrete-columns",
    name: "RC Columns",
    domain: "reinforced-concrete",
    maturity: "implemented-local",
    primaryFocus:
      "Local NTC 2018 second-order, biaxial resistance, shear, confinement and ductility verification of RC columns.",
  },
  {
    id: "reinforced-concrete-isolated-footings",
    name: "RC Isolated Footings",
    domain: "reinforced-concrete",
    maturity: "implemented-local",
    primaryFocus:
      "Rigid compression-only contact, assigned geotechnical resistance, crushing, anchorage and structural checks of rectangular isolated footings.",
  },
  {
    id: "reinforced-concrete-foundation-beams",
    name: "RC Foundation Beams",
    domain: "reinforced-concrete",
    maturity: "implemented-local",
    primaryFocus:
      "Compression-only Winkler analysis with iterative cracked stiffness and local RC verification of horizontal foundation beams.",
  },
  {
    id: "reinforced-concrete-beam-column-joints",
    name: "RC Beam-Column Joints",
    domain: "reinforced-concrete",
    maturity: "implemented-local",
    primaryFocus:
      "Directional and concurrent-3D NTC 2018 joint checks including anchorage, corner joints and eccentric transfer.",
  },
  {
    id: "reinforced-concrete-strut-and-tie",
    name: "RC Strut-and-Tie Models",
    domain: "reinforced-concrete",
    maturity: "partial",
    primaryFocus:
      "Analysis and EN 1992 verification of assigned two-dimensional strut-and-tie topologies for D-regions.",
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
    maturity: "implemented",
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
    maturity: "deprecated-compatibility",
    primaryFocus:
      "Deprecated compatibility scaffold; new calculations use geotechnical-lateral-piles with Broms as a selectable method.",
  },
  {
    id: "geotechnical-deep-foundations",
    name: "Geotechnical Deep Foundations",
    domain: "geotechnics",
    maturity: "implemented-local",
    primaryFocus:
      "Method-neutral static axial capacity of a single vertical pile, with layer-by-layer shaft resistance and distinct compression/tension contracts.",
  },
  {
    id: "geotechnical-embedded-retaining-walls",
    name: "Geotechnical Embedded Retaining Walls",
    domain: "geotechnics",
    maturity: "implemented-local",
    primaryFocus:
      "Staged static and assigned-pseudostatic response of embedded wall strips on nonlinear two-sided soil springs with anchors and struts.",
  },
  {
    id: "geotechnical-ground-anchors",
    name: "Geotechnical Ground Anchors",
    domain: "geotechnics",
    maturity: "implemented-local",
    primaryFocus:
      "FHWA-based design of cement-grouted ground anchors including wall-demand conversion, stratified bond resistance, tendon, corrosion, field-test acceptance and a global-stability action contract.",
  },
  {
    id: "geotechnical-lateral-piles",
    name: "Geotechnical Lateral Piles",
    domain: "geotechnics",
    maturity: "implemented-local",
    primaryFocus:
      "Static Broms capacity and nonlinear single-pile response as an Euler-Bernoulli beam on assigned depth-dependent p-y curves, with structural/FEM state transfer.",
  },
  {
    id: "geotechnical-earth-pressures",
    name: "Geotechnical Earth Pressures",
    domain: "geotechnics",
      maturity: "implemented-local",
      primaryFocus:
        "Serializable layered static pressure diagrams, planar Coulomb actions, restricted Mononobe-Okabe thrusts and layered pseudostatic trial-wedge resultants.",
  },
  {
    id: "geotechnical-shallow-foundations",
    name: "Geotechnical Shallow Foundations",
    domain: "geotechnics",
    maturity: "implemented-local",
    primaryFocus:
      "Static ULS bearing/sliding plus immediate SLS settlement, rigid-foundation rotation and differential-movement analysis connected to GroundModel.",
  },
  {
    id: "geotechnical-retaining-walls",
    name: "Geotechnical Retaining Walls",
    domain: "geotechnics",
    maturity: "implemented-local",
    primaryFocus:
      "Method-neutral 2D wall actions, sliding, overturning, base contact, uplift and explicit coupling to bearing and circular global-stability analyses.",
  },
  {
    id: "geotechnical-slope-stability",
    name: "Geotechnical Slope Stability",
      domain: "geotechnics",
      maturity: "implemented-local",
      primaryFocus:
        "Static and pseudostatic circular slip-surface analysis with Spencer, static Bishop/Ordinary diagnostics, bounded search and FHWA ground-anchor mobilization.",
  },
];
