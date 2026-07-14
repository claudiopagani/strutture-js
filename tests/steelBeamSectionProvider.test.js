import test from "node:test";
import assert from "node:assert/strict";

import {
  SingleBeamAnalysis,
  SteelBeamSectionProvider,
  SteelMemberVerification,
  verifySteelBeamColumnInteractionMy,
  verifySteelBeamColumnInteractionMyMz,
  verifySteelCompressionBuckling,
  verifySteelLateralTorsionalBuckling,
  classifySteelSection,
  createNTC2018StructuralSteelMaterial,
  createDoubleUPNBackToBackSection,
  createSteelBeamSectionProvider,
  createSteelProfileSection,
  getSteelVerificationCapabilities,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const beamUnits = { force: "kN", length: "m" };

const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

function createSteelFixture() {
  const section = createSteelProfileSection({
    profileName: "IPE200",
    units,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });

  return { section, material };
}

test("steel beam provider returns elastic stiffness and resistance metadata", () => {
  const { section, material } = createSteelFixture();
  const provider = new SteelBeamSectionProvider({
    section,
    material,
  });
  const properties = provider.getElasticBeamProperties({ limitState: "ULS" });

  assert.deepEqual(properties.units, { force: "N", length: "mm" });
  approx(properties.axialRigidity, material.elasticModulus * section.area);
  approx(properties.flexuralRigidity, material.elasticModulus * section.inertiaY);
  assert.ok(properties.shearRigidity > 0);
  assert.equal(properties.metadata.provider, "SteelBeamSectionProvider");
  assert.equal(properties.metadata.profileName, "IPE200");
  assert.equal(properties.metadata.grade, "S275");
  approx(properties.metadata.fyd, material.fyd);
  approx(
    properties.metadata.elasticMomentResistance,
    material.fyd * section.catalogProperties.Wel_y * 1e9,
    1e-6,
  );
  approx(
    properties.metadata.plasticMomentResistance,
    material.fyd * section.catalogProperties.Wpl_y * 1e9,
    1e-6,
  );
});

test("steel beam provider can drive SingleBeamAnalysis with Timoshenko model", () => {
  const { section, material } = createSteelFixture();
  const sectionProvider = createSteelBeamSectionProvider({
    section,
    material,
  });
  const result = new SingleBeamAnalysis().analyze({
    id: "steel-beam",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 },
    },
    sectionProvider,
    analysisModel: "timoshenko",
    supports: {
      start: "hinge",
      end: "roller",
    },
    loads: [
      {
        id: "g1",
        actionType: "G1",
        type: "uniform",
        value: -8,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3 },
      },
    ],
    discretization: {
      elementCount: 4,
    },
  });
  const combination = result.combinations.uls;

  assert.equal(combination.sectionProperties.metadata.provider, "SteelBeamSectionProvider");
  assert.equal(combination.sectionProperties.metadata.limitState, "ULS");
  approx(combination.sectionProperties.flexuralRigidity, 4080.3, 1e-9);
  assert.ok(Math.abs(combination.displacements.maxAbsVerticalDisplacement.uy) > 0);
  assert.ok(result.envelopes.uls.maxAbsBendingMoment.value > 0);
});

test("steel member verification checks base resistance from FEM samples", () => {
  const { section, material } = createSteelFixture();
  const sectionProvider = createSteelBeamSectionProvider({
    section,
    material,
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "steel-check",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 },
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
        value: -4,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3 },
      },
    ],
    discretization: {
      elementCount: 4,
    },
  });
  const verification = new SteelMemberVerification().verify({
    memberId: "steel-check",
    section,
    material,
    analysisResult,
  });

  assert.equal(verification.applicationId, "steel-frames");
  assert.equal(verification.status, "ok");
  const classification = verification.checks.find(
    (check) => check.id === "steel-section-classification",
  );

  assert.ok(classification);
  assert.equal(classification.metadata.sectionClass, 1);
  assert.equal(classification.metadata.flangeClass, 1);
  assert.equal(classification.metadata.webClass, 1);
  assert.ok(classification.metadata.mEd > 0);
  assert.ok(classification.metadata.mEdSectionUnits > 0);
  const bending = verification.checks.find((check) => check.id === "steel-bending");
  const ltb = verification.checks.find(
    (check) => check.id === "steel-lateral-torsional-buckling",
  );
  const compressionBuckling = verification.checks.find(
    (check) => check.id === "steel-compression-buckling",
  );
  const beamColumnInteraction = verification.checks.find(
    (check) => check.id === "steel-beam-column-interaction-n-my",
  );

  assert.equal(bending.metadata.resistanceBasis, "plastic");
  assert.ok(bending.capacity > 50.887);
  assert.ok(ltb);
  assert.equal(ltb.metadata.criticalMomentSource, "automatic-simplified");
  assert.ok(compressionBuckling);
  assert.equal(compressionBuckling.metadata.lengthInferenceSource, "inferred-pinned-pinned");
  assert.ok(beamColumnInteraction);
  assert.equal(beamColumnInteraction.metadata.domain, "N+My");
  assert.equal(
    beamColumnInteraction.metadata.excludedActions,
    "Mz, torsion, torsional-interactions",
  );
  assert.ok(verification.checks.some((check) => check.id === "steel-bending"));
  assert.ok(verification.checks.some((check) => check.id === "steel-shear"));
  assert.ok(verification.checks.some((check) => check.id === "steel-axial"));
  assert.ok(verification.checks.some((check) => check.id === "steel-elastic-stress"));
  assert.ok(verification.utilizationRatio < 1);
});

test("steel member verification checks rotated weak-axis moment with N+My+Mz stability", () => {
  const { section, material } = createSteelFixture();
  const sectionProvider = createSteelBeamSectionProvider({
    section,
    material,
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "steel-rotated-check",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 },
    },
    sectionRotation: {
      alpha: 10,
      units: "deg",
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
        value: -2,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3 },
      },
    ],
    discretization: {
      elementCount: 4,
    },
  });
  const verification = new SteelMemberVerification().verify({
    memberId: "steel-rotated-check",
    section,
    material,
    analysisResult,
  });

  const interaction = verification.checks.find(
    (check) => check.id === "steel-beam-column-interaction-n-my-mz",
  );

  assert.equal(verification.status, "ok");
  assert.ok(interaction);
  assert.equal(interaction.metadata.domain, "N+My+Mz");
  assert.ok(Math.abs(interaction.metadata.mzEdSectionUnits) > 0);
  assert.ok(Number.isFinite(interaction.metadata.kyz));
  assert.ok(Number.isFinite(interaction.metadata.kzz));
  assert.ok(interaction.metadata.equationY > 0);
  assert.ok(interaction.metadata.equationZ > 0);
  assert.ok(!verification.warnings.some((warning) => warning.includes("N-Mx-My")));
});

test("steel lateral-torsional buckling supports automatic I/H Mcr and user Mcr for UPN", () => {
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });
  const ipe = createSteelProfileSection({
    profileName: "IPE200",
    units,
  });
  const upn = createSteelProfileSection({
    profileName: "UPN200",
    units,
  });
  const ipeCheck = verifySteelLateralTorsionalBuckling({
    section: ipe,
    material,
    mEd: 5e6,
    sectionClass: 1,
    bendingSectionModulus: ipe.catalogProperties.Wpl_y * 1e9,
    unbracedLength: 2500,
  });
  const upnCheck = verifySteelLateralTorsionalBuckling({
    section: upn,
    material,
    mEd: 5e6,
    sectionClass: 1,
    bendingSectionModulus: upn.catalogProperties.Wpl_y * 1e9,
    unbracedLength: 3000,
    criticalMoment: 120e6,
  });

  assert.equal(ipeCheck.status, "ok");
  assert.ok(ipeCheck.check.capacity > 0);
  assert.equal(ipeCheck.check.metadata.criticalMomentSource, "automatic-simplified");
  assert.equal(upnCheck.status, "ok");
  assert.equal(upnCheck.check.metadata.family, "UPN");
  assert.equal(upnCheck.check.metadata.criticalMomentSource, "user-provided");
  assert.equal(upnCheck.check.metadata.criticalMoment, 120e6);
});

test("steel compression buckling and N+My Method B work as standalone checks", () => {
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });
  const ipe = createSteelProfileSection({
    profileName: "IPE200",
    units,
  });
  const compression = verifySteelCompressionBuckling({
    section: ipe,
    material,
    nEd: 50e3,
    sectionClass: 1,
    lengthY: 5000,
    lengthZ: 5000,
  });
  const interaction = verifySteelBeamColumnInteractionMy({
    section: ipe,
    material,
    nEd: 50e3,
    myEd: 10e6,
    sectionClass: 1,
    bendingSectionModulus: ipe.catalogProperties.Wpl_y * 1e9,
    compressionBucklingResult: compression,
    chiLT: 1,
  });
  const biaxialInteraction = verifySteelBeamColumnInteractionMyMz({
    section: ipe,
    material,
    nEd: 50e3,
    myEd: 10e6,
    mzEd: 2e6,
    sectionClass: 1,
    bendingSectionModulusY: ipe.catalogProperties.Wpl_y * 1e9,
    bendingSectionModulusZ: ipe.catalogProperties.Wpl_z * 1e9,
    compressionBucklingResult: compression,
    chiLT: 1,
  });

  assert.equal(compression.status, "ok");
  assert.equal(compression.check.metadata.curveY, "a");
  assert.equal(compression.check.metadata.curveZ, "b");
  assert.ok(compression.check.metadata.axisZResistance < compression.check.metadata.axisYResistance);
  assert.equal(interaction.status, "ok");
  assert.equal(interaction.check.metadata.method, "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my");
  assert.equal(interaction.check.metadata.domain, "N+My");
  assert.ok(interaction.check.metadata.kyy > 1);
  assert.equal(
    interaction.check.metadata.excludedActions,
    "Mz, torsion, torsional-interactions",
  );
  assert.equal(biaxialInteraction.status, "ok");
  assert.equal(
    biaxialInteraction.check.metadata.method,
    "circolare-ntc2018-c4.2.4.1.3.3.2-method-b-n-my-mz",
  );
  assert.equal(biaxialInteraction.check.metadata.domain, "N+My+Mz");
  assert.equal(
    biaxialInteraction.check.metadata.excludedActions,
    "torsion, torsional-interactions",
  );
  assert.ok(biaxialInteraction.check.metadata.bendingRatioZ > 0);
  assert.ok(Number.isFinite(biaxialInteraction.check.metadata.kyz));
  assert.ok(Number.isFinite(biaxialInteraction.check.metadata.kzz));
});

test("steel section classification supports I/H and UPN profiles", () => {
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });
  const ipe = createSteelProfileSection({
    profileName: "IPE200",
    units,
  });
  const upn = createSteelProfileSection({
    profileName: "UPN200",
    units,
  });
  const ipeClassification = classifySteelSection({
    section: ipe,
    material,
    nEd: 0,
    mEd: 2e7,
  });
  const upnClassification = classifySteelSection({
    section: upn,
    material,
    nEd: 0,
    mEd: 2e7,
  });
  const tinyActionClassification = classifySteelSection({
    section: ipe,
    material,
    nEd: 0,
    mEd: 1e-12,
  });

  assert.equal(ipeClassification.status, "ok");
  assert.equal(ipeClassification.class, 1);
  assert.equal(
    ipeClassification.parts.find((part) => part.id === "flange").class,
    1,
  );
  assert.equal(
    ipeClassification.parts.find((part) => part.id === "web").class,
    1,
  );
  assert.equal(upnClassification.status, "ok");
  assert.equal(upnClassification.family, "UPN");
  assert.equal(upnClassification.class, 1);
  assert.equal(
    tinyActionClassification.parts.find((part) => part.id === "web").compression,
    false,
  );
});

test("steel section classification supports extended catalog profile families", () => {
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });
  const cases = [
    ["CHS114.3X5", "CHS", "wall"],
    ["SHS100X100X5", "SHS", "flange"],
    ["RHS200X100X6.3", "RHS", "web"],
    ["L60X60X6", "L", "leg"],
    ["LU100X75X8", "LU", "long-leg"],
    ["T100X100X11", "T", "stem"],
    ["FL100X10", "FLAT", "flat"],
    ["RD40", "ROUND", "solid-round"],
  ];

  for (const [profileName, family, partId] of cases) {
    const section = createSteelProfileSection({ profileName, units });
    const classification = classifySteelSection({
      section,
      material,
      nEd: 10e3,
      mEd: 1e6,
      mzEd: 0.25e6,
    });

    assert.equal(classification.status, "ok", profileName);
    assert.equal(classification.family, family);
    assert.ok(classification.class <= 3, profileName);
    assert.ok(
      classification.parts.some((part) => part.id === partId),
      `${profileName} exposes ${partId}`,
    );
  }
});

test("extended RHS profiles support compression buckling, automatic Mcr and Method B interaction", () => {
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });
  const section = createSteelProfileSection({
    profileName: "RHS200X100X6.3",
    units,
  });
  const classification = classifySteelSection({
    section,
    material,
    nEd: 20e3,
    mEd: 4e6,
    mzEd: 1e6,
  });
  const compression = verifySteelCompressionBuckling({
    section,
    material,
    nEd: 20e3,
    sectionClass: classification.class,
    lengthY: 3000,
    lengthZ: 3000,
  });
  const ltb = verifySteelLateralTorsionalBuckling({
    section,
    material,
    mEd: 4e6,
    sectionClass: classification.class,
    bendingSectionModulus: section.plasticSectionModulusY,
    unbracedLength: 3000,
  });
  const interaction = verifySteelBeamColumnInteractionMyMz({
    section,
    material,
    nEd: 20e3,
    myEd: 4e6,
    mzEd: 1e6,
    sectionClass: classification.class,
    bendingSectionModulusY: section.plasticSectionModulusY,
    bendingSectionModulusZ: section.plasticSectionModulusZ,
    compressionBucklingResult: compression,
    chiLT: ltb.check.metadata.chiLT,
  });

  assert.equal(classification.status, "ok");
  assert.equal(compression.status, "ok");
  assert.equal(compression.check.metadata.family, "RHS");
  assert.equal(compression.check.metadata.curveSource, "conservative-hollow-section-default-curve-c");
  assert.equal(ltb.status, "ok");
  assert.equal(ltb.check.metadata.family, "RHS");
  assert.equal(ltb.check.metadata.criticalMomentSource, "automatic-simplified");
  assert.equal(interaction.status, "ok");
  assert.equal(interaction.check.metadata.family, "RHS");
  assert.equal(interaction.check.metadata.domain, "N+My+Mz");
});

test("axisymmetric profiles bypass classic LTB while open unsymmetric profiles stay guarded", () => {
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });
  const chs = createSteelProfileSection({
    profileName: "CHS114.3X5",
    units,
  });
  const tee = createSteelProfileSection({
    profileName: "T100X100X11",
    units,
  });
  const chsClassification = classifySteelSection({
    section: chs,
    material,
    nEd: 0,
    mEd: 2e6,
  });
  const chsLtb = verifySteelLateralTorsionalBuckling({
    section: chs,
    material,
    mEd: 2e6,
    sectionClass: chsClassification.class,
    bendingSectionModulus: chs.plasticSectionModulusY,
    unbracedLength: 3000,
  });
  const teeClassification = classifySteelSection({
    section: tee,
    material,
    nEd: 20e3,
    mEd: 1e6,
  });
  const guardedCompression = verifySteelCompressionBuckling({
    section: tee,
    material,
    nEd: 20e3,
    sectionClass: teeClassification.class,
    lengthY: 3000,
    lengthZ: 3000,
  });
  const flexuralOnlyCompression = verifySteelCompressionBuckling({
    section: tee,
    material,
    nEd: 20e3,
    sectionClass: teeClassification.class,
    lengthY: 3000,
    lengthZ: 3000,
    allowOpenSectionFlexuralBuckling: true,
  });

  assert.equal(chsLtb.status, "ok");
  assert.equal(chsLtb.check.metadata.criticalMomentSource, "not-required");
  assert.equal(chsLtb.check.metadata.chiLT, 1);
  assert.equal(guardedCompression.status, "not-supported");
  assert.equal(flexuralOnlyCompression.status, "ok");
  assert.ok(
    flexuralOnlyCompression.warnings.some((warning) =>
      warning.includes("flexural-torsional buckling"),
    ),
  );
});

test("steel verification capabilities describe automatic and guarded checks", () => {
  const rhs = getSteelVerificationCapabilities({
    profileName: "RHS200X100X6.3",
    units,
  });
  const upn = getSteelVerificationCapabilities({
    profileName: "UPN200",
    units,
  });
  const compound = createDoubleUPNBackToBackSection({
    profileName: "UPN200",
    gap: 0.02,
    units,
  });
  const compoundCapabilities = getSteelVerificationCapabilities({
    section: compound,
  });
  const unknown = getSteelVerificationCapabilities({
    profileName: "XYZ999",
    units,
  });

  assert.equal(rhs.status, "supported");
  assert.equal(rhs.checks.classification.status, "supported");
  assert.equal(rhs.checks.compressionBuckling.status, "automatic");
  assert.equal(rhs.checks.lateralTorsionalBuckling.status, "automatic");
  assert.equal(rhs.checks.beamColumnInteraction.status, "automatic");
  assert.equal(upn.status, "supported");
  assert.equal(upn.checks.lateralTorsionalBuckling.status, "requires-input");
  assert.equal(upn.checks.beamColumnInteraction.status, "requires-override");
  assert.equal(compoundCapabilities.status, "partially-supported");
  assert.equal(compoundCapabilities.family, "COMPOUND");
  assert.equal(compoundCapabilities.compound.geometry, "supported");
  assert.equal(compoundCapabilities.checks.classification.status, "not-supported");
  assert.equal(unknown.status, "not-supported");
  assert.equal(unknown.checks.classification.status, "not-supported");
});

test("steel member verification runs RHS stability and interaction without user Mcr", () => {
  const section = createSteelProfileSection({
    profileName: "RHS200X100X6.3",
    units,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S275",
    units,
  });
  const sectionProvider = createSteelBeamSectionProvider({
    section,
    material,
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "rhs-steel-check",
    units: beamUnits,
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
    ],
    discretization: {
      elementCount: 4,
    },
  });
  const verification = new SteelMemberVerification().verify({
    memberId: "rhs-steel-check",
    section,
    material,
    analysisResult,
  });
  const ltb = verification.checks.find(
    (check) => check.id === "steel-lateral-torsional-buckling",
  );
  const compression = verification.checks.find(
    (check) => check.id === "steel-compression-buckling",
  );
  const interaction = verification.checks.find(
    (check) => check.id === "steel-beam-column-interaction-n-my",
  );

  assert.equal(verification.status, "ok");
  assert.equal(ltb.metadata.family, "RHS");
  assert.equal(ltb.metadata.criticalMomentSource, "automatic-simplified");
  assert.equal(compression.metadata.family, "RHS");
  assert.equal(interaction.metadata.family, "RHS");
});

test("steel member verification blocks class 4 sections until effective properties exist", () => {
  const section = createSteelProfileSection({
    profileName: "IPE200",
    units,
    width: 0.3,
    height: 0.8,
    webThickness: 0.001,
    flangeThickness: 0.001,
    rootRadius: 0,
    area: 0.0012,
    inertiaY: 6e-5,
    shearAreaY: 0.0008,
    elasticSectionModulusY: 0.00015,
  });
  const material = createNTC2018StructuralSteelMaterial({
    grade: "S355",
    units,
  });
  const sectionProvider = createSteelBeamSectionProvider({
    section,
    material,
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "steel-class4-check",
    units: beamUnits,
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
        value: -0.2,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3 },
      },
    ],
    discretization: {
      elementCount: 2,
      stations: [2],
    },
  });
  const verification = new SteelMemberVerification().verify({
    memberId: "steel-class4-check",
    section,
    material,
    analysisResult,
  });
  const classification = verification.checks.find(
    (check) => check.id === "steel-section-classification",
  );

  assert.equal(verification.status, "not-supported");
  assert.equal(classification.metadata.sectionClass, 4);
  assert.equal(classification.ok, false);
  assert.ok(
    verification.warnings.some((warning) =>
      warning.includes("effective section properties"),
    ),
  );
});

test("steel member verification checks SLE deflection from FEM results", () => {
  const { section, material } = createSteelFixture();
  const sectionProvider = createSteelBeamSectionProvider({
    section,
    material,
  });
  const analysisResult = new SingleBeamAnalysis().analyze({
    id: "steel-sle-check",
    units: beamUnits,
    geometry: {
      start: { x: 0, y: 0 },
      end: { x: 5, y: 0 },
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
        value: -3,
      },
      {
        id: "q",
        actionType: "Qk",
        type: "uniform",
        value: -2,
      },
    ],
    combinations: [
      {
        id: "uls",
        limitState: "ULS",
        factors: { G1: 1.3, Qk: 1.5 },
      },
      {
        id: "sle-rare",
        limitState: "SLE",
        combinationType: "SLE_RARE",
        factors: { G1: 1, Qk: 1 },
      },
    ],
    discretization: {
      elementCount: 4,
      stations: [2.5],
    },
  });
  const verification = new SteelMemberVerification().verify({
    memberId: "steel-sle-check",
    section,
    material,
    analysisResult,
  });
  const deflection = verification.checks.find(
    (check) => check.id === "steel-sle-deflection",
  );

  assert.equal(verification.status, "ok");
  assert.ok(deflection);
  approx(deflection.capacity, 0.02);
  assert.equal(deflection.metadata.deflectionLimitRatio, 250);
  assert.equal(verification.outputs.serviceability.checkCount, 1);
});
