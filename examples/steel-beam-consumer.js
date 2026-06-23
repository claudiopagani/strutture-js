import {
  STEEL_PROFILE_FAMILIES,
  SingleBeamAnalysis,
  SteelMemberVerification,
  createDoubleUPNBackToBackSection,
  createNTC2018StructuralSteelMaterial,
  createSteelBeamSectionProvider,
  createSteelProfileSection,
  getSteelVerificationCapabilities,
  listSteelProfileSectionsByFamily,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const material = createNTC2018StructuralSteelMaterial({
  grade: "S275",
  units,
});
const rhs = createSteelProfileSection({
  profileName: "RHS200X100X6.3",
  units,
});
const sectionProvider = createSteelBeamSectionProvider({
  section: rhs,
  material,
});

const analysisResult = new SingleBeamAnalysis().analyze({
  id: "steel-rhs-consumer-example",
  units,
  geometry: {
    start: { x: 0, y: 0 },
    end: { x: 4, y: 0 },
  },
  sectionProvider,
  supports: {
    start: "hinge",
    end: "roller",
  },
  loads: [
    {
      id: "g1",
      actionType: "G1",
      type: "uniform",
      value: -1,
    },
  ],
  combinations: [
    {
      id: "uls",
      limitState: "ULS",
      factors: { G1: 1.3 },
    },
    {
      id: "sle",
      limitState: "SLE",
      factors: { G1: 1 },
    },
  ],
  discretization: {
    elementCount: 4,
  },
});

const verification = new SteelMemberVerification({
  deflectionLimitRatio: 250,
}).verify({
  memberId: "steel-rhs-consumer-example",
  section: rhs,
  material,
  analysisResult,
});

const doubleUpn = createDoubleUPNBackToBackSection({
  profileName: "UPN200",
  gap: 0.02,
  units,
});

const output = {
  catalog: {
    families: STEEL_PROFILE_FAMILIES,
    sampleUPN: listSteelProfileSectionsByFamily("UPN").slice(0, 5),
    sampleRHS: listSteelProfileSectionsByFamily("RHS").slice(0, 5),
  },
  rhsBeam: {
    profileName: rhs.profileName,
    family: rhs.family,
    capabilities: getSteelVerificationCapabilities({ section: rhs }),
    verification: {
      status: verification.status,
      utilizationRatio: verification.utilizationRatio,
      governingCheckId: verification.metadata.governingCheckId,
      warnings: verification.warnings,
    },
  },
  compoundSection: {
    profileName: doubleUpn.profileName,
    family: doubleUpn.family,
    layout: doubleUpn.metadata.layout,
    area: doubleUpn.area,
    inertiaY: doubleUpn.inertiaY,
    inertiaZ: doubleUpn.inertiaZ,
    width: doubleUpn.width,
    height: doubleUpn.height,
    massPerLength: doubleUpn.massPerLength,
    capabilities: getSteelVerificationCapabilities({ section: doubleUpn }),
  },
};

console.log(JSON.stringify(output, null, 2));
