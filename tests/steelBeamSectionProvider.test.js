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
  createSteelBeamSectionProvider,
  createSteelProfileSection,
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

  assert.equal(verification.status, "not-verified");
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
