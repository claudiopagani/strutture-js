import {
  CIRC2019_RC_REFERENCES,
  NTC2018_RC_CHAPTER_4_REFERENCES,
  NTC2018_RC_CHAPTER_7_4_REFERENCES,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../../norms/ntc2018/normativeReferences.js";
import { EN1992_RC_EXTERNAL_REFERENCES } from "../../norms/en1992/normativeReferences.js";

export const NTC2018_RC_COVERAGE_STATUS = Object.freeze({
  AVAILABLE: "available",
  ADAPTER_REQUIRED: "adapter-required",
  NOT_IMPLEMENTED: "not-implemented",
  OUTSIDE_DECLARED_SCOPE: "outside-declared-scope",
});

export const NTC2018_RC_TRACEABILITY_STATUS = Object.freeze({
  COMPUTATIONAL_CONTRACT: "computational-contract",
  OUTSIDE_CURRENT_CORPUS: "outside-current-corpus",
  PARTIAL_CURRENT_CORPUS: "partial-current-corpus",
  RESOLVED_CURRENT_CORPUS: "resolved-current-corpus",
});

const R4 = NTC2018_RC_CHAPTER_4_REFERENCES;
const R7 = NTC2018_RC_CHAPTER_7_4_REFERENCES;
const OUTSIDE = NTC2018_RC_OUTSIDE_CORPUS_REFERENCES;
const CIRC = CIRC2019_RC_REFERENCES;
const EN1992 = EN1992_RC_EXTERNAL_REFERENCES;

const CAPABILITY_TRACEABILITY = Object.freeze({
  "global-fem-contracts": {
    status: NTC2018_RC_TRACEABILITY_STATUS.COMPUTATIONAL_CONTRACT,
    references: [OUTSIDE.globalSeismicAnalysis],
  },
  "solver-neutral-demand-extraction": {
    status: NTC2018_RC_TRACEABILITY_STATUS.COMPUTATIONAL_CONTRACT,
    references: [],
  },
  "structural-behavior-and-q": {
    status: NTC2018_RC_TRACEABILITY_STATUS.PARTIAL_CURRENT_CORPUS,
    references: [
      R7.structuralBehavior,
      R7.structuralTypesAndQ,
      OUTSIDE.globalSeismicAnalysis,
    ],
  },
  regularity: {
    status: NTC2018_RC_TRACEABILITY_STATUS.OUTSIDE_CURRENT_CORPUS,
    references: [
      OUTSIDE.structuralRegularity,
      OUTSIDE.structuralRegularityGuidance,
    ],
  },
  "displacements-and-second-order": {
    status: NTC2018_RC_TRACEABILITY_STATUS.OUTSIDE_CURRENT_CORPUS,
    references: [OUTSIDE.globalSeismicAnalysis],
  },
  "beam-local-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [
      R4.flexureAndAxialForce,
      R4.shearWithoutTransverseReinforcement,
      R4.shearWithTransverseReinforcement,
      R4.beamDetailing,
      R7.beamCapacityShear,
      R7.beamGeometry,
      R7.beamDetailing,
    ],
  },
  "column-local-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [
      R4.flexureAndAxialForce,
      R4.columnSlenderness,
      R4.nominalStiffness,
      R4.columnDetailing,
      R7.columnCapacityDesign,
      R7.columnGeometry,
      R7.columnDetailing,
    ],
  },
  "beam-column-joint-local-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [
      R7.beamColumnJoint,
      R7.jointGeometry,
      R7.jointDetailing,
    ],
  },
  "slab-local-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.PARTIAL_CURRENT_CORPUS,
    references: [
      R4.flexureAndAxialForce,
      R4.shearWithoutTransverseReinforcement,
      R4.crackWidth,
      R4.concreteStressCharacteristic,
      R4.concreteStressQuasiPermanent,
      R4.reinforcementStress,
      R4.deflection,
      CIRC.simplifiedDeflectionSlenderness,
      EN1992.deflection,
    ],
  },
  "punching-supported-geometries": {
    status: NTC2018_RC_TRACEABILITY_STATUS.PARTIAL_CURRENT_CORPUS,
    references: [
      R4.punching,
      EN1992.punching2004,
      EN1992.punching2023,
    ],
  },
  "isolated-footing-local-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.PARTIAL_CURRENT_CORPUS,
    references: [
      R4.flexureAndAxialForce,
      R4.shearWithoutTransverseReinforcement,
      R4.punching,
      R4.anchorage,
      OUTSIDE.foundationDesign,
      EN1992.punching2004,
      EN1992.localBearing,
      EN1992.bondAndAnchorage,
    ],
  },
  "foundation-beam-local-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.PARTIAL_CURRENT_CORPUS,
    references: [
      R4.flexureAndAxialForce,
      R4.shearWithoutTransverseReinforcement,
      R4.deflection,
      OUTSIDE.foundationDesign,
      EN1992.deflection,
    ],
  },
  "wall-section-biaxial-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [R4.flexureAndAxialForce, R7.wall],
  },
  "wall-chapter7-demand-and-detailing-kernels": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [R7.wall, R7.wallDuctility, R7.wallDetailing],
  },
  "capacity-design-kernels": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [
      R7.beamCapacityShear,
      R7.columnCapacityDesign,
      R7.beamColumnJoint,
      R7.wall,
    ],
  },
  "diaphragm-force-amplification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [R7.diaphragm],
  },
  "global-member-axis-mapping": {
    status: NTC2018_RC_TRACEABILITY_STATUS.COMPUTATIONAL_CONTRACT,
    references: [],
  },
  "global-wall-system-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [
      R7.wall,
      R7.wallDuctility,
      R7.wallGeometry,
      R7.wallDetailing,
    ],
  },
  "global-slab-and-punching-orchestration": {
    status: NTC2018_RC_TRACEABILITY_STATUS.PARTIAL_CURRENT_CORPUS,
    references: [
      R4.flexureAndAxialForce,
      R4.punching,
      EN1992.punching2004,
      EN1992.punching2023,
      OUTSIDE.globalSeismicAnalysis,
    ],
  },
  "diaphragm-chapter4-resistance": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [R4.flexureAndAxialForce, R7.diaphragm],
  },
  "global-foundation-orchestration": {
    status: NTC2018_RC_TRACEABILITY_STATUS.OUTSIDE_CURRENT_CORPUS,
    references: [
      OUTSIDE.foundationDesign,
      OUTSIDE.seismicFoundationDesign,
    ],
  },
  "modal-combination-and-accidental-torsion-verification": {
    status: NTC2018_RC_TRACEABILITY_STATUS.OUTSIDE_CURRENT_CORPUS,
    references: [OUTSIDE.globalSeismicAnalysis],
  },
  "coupling-beams-and-special-wall-systems": {
    status: NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    references: [
      R7.wall,
      R7.wallDuctility,
      R7.wallDetailing,
      R7.couplingBeam,
    ],
  },
  "complete-building-orchestration": {
    status: NTC2018_RC_TRACEABILITY_STATUS.PARTIAL_CURRENT_CORPUS,
    references: [
      R4.flexureAndAxialForce,
      R7.structuralBehavior,
      R7.structuralTypesAndQ,
      OUTSIDE.globalSeismicAnalysis,
      OUTSIDE.foundationDesign,
      OUTSIDE.seismicFoundationDesign,
    ],
  },
  "prestressed-precast-and-bridge-rc": {
    status: NTC2018_RC_TRACEABILITY_STATUS.OUTSIDE_CURRENT_CORPUS,
    references: [],
  },
});

function normativeTraceability(capabilityId) {
  const traceability = CAPABILITY_TRACEABILITY[capabilityId];

  if (!traceability) {
    throw new Error(`Missing normative traceability for ${capabilityId}.`);
  }

  return Object.freeze({
    status: traceability.status,
    corpusWorkflowStatus: "extracted",
    normativeReferences: Object.freeze([...traceability.references]),
  });
}

function capability(id, status, references, evidence) {
  return Object.freeze({
    id,
    status,
    references: Object.freeze(references),
    evidence: Object.freeze(evidence),
    normativeTraceability: normativeTraceability(id),
  });
}

/**
 * Factual implementation inventory for ordinary cast-in-place RC buildings.
 * It is intentionally narrower than the whole of NTC chapters 4 and 7.
 */
export const NTC2018_RC_BUILDING_CAPABILITIES = Object.freeze([
  capability(
    "global-fem-contracts",
    "available",
    ["NTC 2018 §§ 7.2-7.3"],
    ["Global FEM v0 validation and JSON round-trip tests"],
  ),
  capability(
    "solver-neutral-demand-extraction",
    "available",
    ["NTC 2018 §§ 4.1, 7.2-7.4"],
    [
      "Concurrent member, joint, shell, section-cut and reaction state tests",
      "Two-producer conformance test",
    ],
  ),
  capability(
    "structural-behavior-and-q",
    "available",
    ["NTC 2018 §§ 7.2.2, 7.3.1-7.3.2, 7.4.1, 7.4.3"],
    ["Independent topology and q-factor tests"],
  ),
  capability(
    "regularity",
    "available",
    ["NTC 2018 § 7.2.1"],
    ["Explicit plan and elevation criterion tests"],
  ),
  capability(
    "displacements-and-second-order",
    "available",
    ["NTC 2018 §§ 7.2.1, 7.3.1, 7.3.6.1"],
    ["Drift, separation and P-Delta interval tests"],
  ),
  capability(
    "beam-local-verification",
    "available",
    ["NTC 2018 §§ 4.1, 7.4.4.1, 7.4.6.1"],
    ["Beam validation campaign and local application tests"],
  ),
  capability(
    "column-local-verification",
    "available",
    ["NTC 2018 §§ 4.1.2.3.9, 7.4.4.2, 7.4.6.2"],
    ["Biaxial-domain, stability, shear and detailing tests"],
  ),
  capability(
    "beam-column-joint-local-verification",
    "available",
    ["NTC 2018 §§ 7.4.4.3, 7.4.6.2.3"],
    ["Concurrent 3D joint application tests"],
  ),
  capability(
    "slab-local-verification",
    "available",
    ["NTC 2018 § 4.1"],
    ["Plate and Wood-Armer application tests"],
  ),
  capability(
    "punching-supported-geometries",
    "available",
    ["NTC 2018 § 4.1.2.3.5.4"],
    ["Punching validation campaign in its declared geometry scope"],
  ),
  capability(
    "isolated-footing-local-verification",
    "available",
    ["NTC 2018 §§ 4.1, 6.4"],
    ["Footing contact and structural verification tests"],
  ),
  capability(
    "foundation-beam-local-verification",
    "available",
    ["NTC 2018 §§ 4.1, 6.4"],
    ["Foundation-beam analysis and verification tests"],
  ),
  capability(
    "wall-section-biaxial-verification",
    "available",
    ["NTC 2018 §§ 4.1.2.3.9, 7.4.4.5.1"],
    ["Asymmetric dense-domain validation by independent bisection"],
  ),
  capability(
    "wall-chapter7-demand-and-detailing-kernels",
    "available",
    ["NTC 2018 §§ 7.4.4.5, 7.4.6.2.4"],
    ["Independent wall demand, critical-zone and confinement tests"],
  ),
  capability(
    "capacity-design-kernels",
    "available",
    ["NTC 2018 § 7.4.4"],
    ["Beam, column, joint and wall capacity-design tests"],
  ),
  capability(
    "diaphragm-force-amplification",
    "available",
    ["NTC 2018 § 7.4.4.4.1"],
    ["Signed 1.30 action-amplification tests"],
  ),
  capability(
    "global-member-axis-mapping",
    "available",
    ["NTC 2018 §§ 4.1, 7.4"],
    [
      "Explicit proper-orthogonal resistance-axis transformations",
      "Member, joint and wall section-cut projection tests",
    ],
  ),
  capability(
    "global-wall-system-verification",
    "available",
    [
      "NTC 2018 §§ 7.4.4.5, 7.4.6.1.4, 7.4.6.2.4",
    ],
    [
      "Every mapped section-cut state is transformed and assessed",
      "Wall-height completeness and detailing orchestration tests",
      "Mixed-system and weakly-reinforced wall demand tests",
    ],
  ),
  capability(
    "global-slab-and-punching-orchestration",
    "available",
    ["NTC 2018 §§ 4.1.2.3.5, 7.2.6"],
    [
      "Explicit shell tensor transformations to slab resistance axes",
      "Every concurrent ULS/SLS shell state is assessed",
      "Punching connections map slabs, nodes, shells and supporting member ends",
      "Ultimate-combination punching completeness tests",
    ],
  ),
  capability(
    "diaphragm-chapter4-resistance",
    "available",
    ["NTC 2018 §§ 4.1, 7.4.4.4.1"],
    [
      "Signed 1.30 membrane-action transformation",
      "Chapter-4 capacity checks are required for every seismic shell state",
      "Building-level diaphragm orchestration tests",
    ],
  ),
  capability(
    "global-foundation-orchestration",
    "available",
    ["NTC 2018 §§ 6.4, 7.11"],
    [
      "Every model support maps to exactly one foundation entity",
      "Proper reaction-axis transformations and concurrent grouping tests",
      "Structural, geotechnical, SLS, connection and seismic families are mandatory",
    ],
  ),
  capability(
    "modal-combination-and-accidental-torsion-verification",
    "available",
    ["NTC 2018 §§ 7.2.6, 7.3.3, 7.3.3.1, 7.3.5"],
    [
      "Strict modal participating-mass threshold tests",
      "CQC, 100-30-30 and signed accidental-eccentricity assessment tests",
      "Solver-neutral building orchestration test",
    ],
  ),
  capability(
    "coupling-beams-and-special-wall-systems",
    "available",
    [
      "NTC 2018 §§ 7.4.4.5, 7.4.4.6 e 7.4.6.2.4",
    ],
    [
      "Ordinary-versus-diagonal coupling-beam branch tests",
      "Equation [7.4.24] and diagonal detailing boundary tests",
      "Weakly-reinforced axial and shear amplification tests",
    ],
  ),
  capability(
    "complete-building-orchestration",
    "available",
    ["NTC 2018 §§ 4.1, 7.2-7.4, 7.11"],
    [
      "Positive end-to-end ordinary-building fixture",
      "All readiness families must close before a positive result",
      "Two independent FEM producers yield the same building decision",
    ],
  ),
  capability(
    "prestressed-precast-and-bridge-rc",
    "outside-declared-scope",
    ["NTC 2018 §§ 4.1.8, 4.1.10, 7.4.5, 7.9"],
    ["Current scope is ordinary cast-in-place RC buildings"],
  ),
]);

export function getNTC2018RcBuildingCoverage() {
  return JSON.parse(JSON.stringify({
    schema: "strutture-js/ntc2018-rc-building-coverage",
    version: 0,
    declaredScope: "ordinary-cast-in-place-reinforced-concrete-buildings",
    declaredScopeCoverageComplete: true,
    declaredScopeImplementationCoverageComplete: true,
    normativeTraceabilityComplete: false,
    normativeConformityClaimed: false,
    normativeAssurance:
      "Implementation availability is not a conformity declaration. " +
      "The pinned corpus is extracted and some required chapters are outside it.",
    wholeChapter4And7CoverageClaimed: false,
    capabilities: NTC2018_RC_BUILDING_CAPABILITIES,
  }));
}

export function evaluateNTC2018RcBuildingCompleteness({
  requiredCapabilityIds = NTC2018_RC_BUILDING_CAPABILITIES
    .filter((item) => item.status !== "outside-declared-scope")
    .map((item) => item.id),
} = {}) {
  const index = new Map(NTC2018_RC_BUILDING_CAPABILITIES.map((item) => [
    item.id,
    item,
  ]));
  const unknown = requiredCapabilityIds.filter((id) => !index.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown RC building capability ids: ${unknown.join(", ")}.`);
  }
  const required = requiredCapabilityIds.map((id) => index.get(id));
  const blocking = required.filter((item) =>
    item.status !== NTC2018_RC_COVERAGE_STATUS.AVAILABLE);
  const normativeBlocking = required.filter((item) =>
    ![
      NTC2018_RC_TRACEABILITY_STATUS.COMPUTATIONAL_CONTRACT,
      NTC2018_RC_TRACEABILITY_STATUS.RESOLVED_CURRENT_CORPUS,
    ].includes(item.normativeTraceability.status));

  return {
    schema: "strutture-js/ntc2018-rc-building-completeness",
    version: 0,
    status: blocking.length === 0 ? "complete" : "not-implemented",
    complete: blocking.length === 0,
    evaluationBasis: "implementation-availability",
    normativeTraceabilityComplete: normativeBlocking.length === 0,
    normativeConformityClaimed: false,
    requiredCapabilityIds: [...requiredCapabilityIds],
    blockingCapabilities: blocking.map((item) => ({
      id: item.id,
      status: item.status,
    })),
    normativeBlockingCapabilities: normativeBlocking.map((item) => ({
      id: item.id,
      status: item.normativeTraceability.status,
    })),
  };
}
