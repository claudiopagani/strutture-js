import test from "node:test";
import assert from "node:assert/strict";
import {
  SteelMemberVerification,
  createSteelMemberFem3DResult,
  validateSteelMemberFem3DResult,
  verifySteelConcentratedWebLoad,
  verifySteelWebShearBuckling,
  calculateSteelMomentDiagramFactor,
  verifySteelBeamColumnInteractionMyMz,
  verifySteelCompressionBuckling,
  verifySteelLateralTorsionalBuckling,
} from "../src/applications/steel-frames/index.js";
import { createSteelProfileSection } from "../src/domain/geometry/createSteelProfileSection.js";
import { createNTC2018StructuralSteelMaterial } from "../src/norms/ntc2018/index.js";

const units = { force: "N", length: "mm" };

function fixture() {
  return {
    section: createSteelProfileSection({ profileName: "IPE200", units }),
    material: createNTC2018StructuralSteelMaterial({ grade: "S275", units }),
  };
}

function station(stationValue, actions = {}, displacements = {}) {
  return {
    station: stationValue,
    coordinates: { x: stationValue, y: 0, z: 0 },
    N: actions.N ?? 100000,
    Vy: actions.Vy ?? 40000,
    Vz: actions.Vz ?? 5000,
    My: actions.My ?? 30e6,
    Mz: actions.Mz ?? 2e6,
    T: actions.T ?? 0,
    B: actions.B ?? 0,
    u: displacements.u ?? 0,
    v: displacements.v ?? 0,
    w: displacements.w ?? 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
  };
}

function fem3d({ bimoment = 0, includePanel = true, includeLoad = true } = {}) {
  return {
    units,
    fem3d: {
      member: {
        id: "M1",
        length: 6000,
        ends: {
          start: { coordinates: { x: 0, y: 0, z: 0 }, restraints: { ux: true, uy: true, uz: true } },
          end: { coordinates: { x: 6000, y: 0, z: 0 }, restraints: { uy: true, uz: true } },
        },
        stability: {
          sway: false,
          nonSway: true,
          effectiveLengthFactorY: 1,
          effectiveLengthFactorZ: 1,
        },
        restraintSegments: [
          { id: "R1", from: 0, to: 3000, lateral: true, torsional: true, momentDiagram: { type: "linear" } },
          { id: "R2", from: 3000, to: 6000, lateral: true, torsional: true, momentDiagram: { type: "linear" } },
        ],
        webPanels: includePanel ? [
          { id: "P1", from: 0, to: 3000, length: 3000, endPost: "rigid", stiffeners: [{ station: 3000, rigid: true }] },
          { id: "P2", from: 3000, to: 6000, length: 3000, endPost: "non-rigid" },
        ] : [],
        concentratedLoads: includeLoad ? [
          { id: "F1", combinationId: "ULS-1", station: 3000, force: 60000, bearingLength: 100, loadType: "internal" },
        ] : [],
      },
      combinations: [
        {
          id: "ULS-1",
          limitState: "SLU",
          combinationType: "fundamental",
          stations: [
            station(0, { My: 20e6, B: bimoment }),
            station(3000, { My: 40e6, Vy: 70000, B: bimoment }),
            station(6000, { My: -10e6, B: bimoment }),
          ],
        },
        {
          id: "SLE-rare",
          limitState: "SLE",
          combinationType: "rare",
          stations: [
            station(0, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 }, { v: 0 }),
            station(3000, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 }, { v: -12 }),
            station(6000, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 }, { v: 0 }),
          ],
        },
      ],
    },
  };
}

test("steel FEM 3D contract validates, normalizes and remains JSON serializable", () => {
  const validation = validateSteelMemberFem3DResult(fem3d(), { strict: true });
  assert.equal(validation.ok, true, validation.errors.join(" | "));
  assert.equal(validation.value.combinations[0].stations[1].actions.My, 40e6);
  assert.equal(validation.value.member.webPanels[0].stiffeners.length, 1);
  const dto = createSteelMemberFem3DResult(fem3d());
  assert.equal(JSON.parse(JSON.stringify(dto)).schema, "strutture-js/steel-member-fem-3d");
});

test("Method B moment factor is derived from sampled FEM end moments", () => {
  const factor = calculateSteelMomentDiagramFactor([
    { station: 0, mY: 100 },
    { station: 3, mY: 60 },
    { station: 6, mY: -50 },
  ], "My");
  assert.equal(factor.psi, -0.5);
  assert.equal(factor.factor, 0.4);
});

test("HEA compression, LTB and biaxial beam-column Method B checks are numerical", () => {
  const section = createSteelProfileSection({ profileName: "HEA200", units });
  const material = createNTC2018StructuralSteelMaterial({ grade: "S275", units });
  const compression = verifySteelCompressionBuckling({
    section,
    material,
    nEd: 250000,
    sectionClass: 1,
    lengthY: 5000,
    lengthZ: 5000,
  });
  const ltb = verifySteelLateralTorsionalBuckling({
    section,
    material,
    mEd: 60e6,
    sectionClass: 1,
    bendingSectionModulus: section.plasticSectionModulusY,
    unbracedLength: 3000,
  });
  const interaction = verifySteelBeamColumnInteractionMyMz({
    section,
    material,
    nEd: 250000,
    myEd: 60e6,
    mzEd: 8e6,
    sectionClass: 1,
    bendingSectionModulusY: section.plasticSectionModulusY,
    bendingSectionModulusZ: section.plasticSectionModulusZ,
    compressionBucklingResult: compression,
    chiLT: ltb.check.metadata.chiLT,
    alphaMy: 0.8,
    alphaMz: 0.9,
    alphaMLT: 0.8,
  });
  assert.ok(compression.check.capacity > 0);
  assert.ok(ltb.check.capacity > 0);
  assert.ok(Number.isFinite(interaction.check.utilizationRatio));
  assert.equal(interaction.check.metadata.domain, "N+My+Mz");
});

test("slender I/H web shear buckling accounts for transverse stiffener spacing", () => {
  const section = { family: "IPE", height: 1000, width: 300, webThickness: 4, flangeThickness: 20, rootRadius: 0 };
  const material = { fyk: 275, E: 210000, metadata: { gammaM1: 1.05 } };
  const unstiffened = verifySteelWebShearBuckling({ section, material, vEd: 300000, panel: { id: "long", length: 5000, endPost: "non-rigid" } });
  const stiffened = verifySteelWebShearBuckling({ section, material, vEd: 300000, panel: { id: "short", length: 700, endPost: "rigid", stiffeners: [{ rigid: true }] } });
  assert.ok(unstiffened.check.metadata.relativeWebSlenderness > 1);
  assert.ok(stiffened.check.capacity > unstiffened.check.capacity);
  assert.equal(stiffened.check.metadata.panelId, "short");
});

test("concentrated transverse web load returns a numerical EN 1993-1-5 resistance", () => {
  const { section, material } = fixture();
  const result = verifySteelConcentratedWebLoad({
    section,
    material,
    load: { id: "bearing", force: 80000, bearingLength: 100, loadType: "internal" },
    panel: { id: "panel", length: 3000 },
  });
  assert.ok(result.check.capacity > 0);
  assert.ok(Number.isFinite(result.check.metadata.effectiveLoadedLength));
  assert.equal(result.check.metadata.reference.includes("1993-1-5"), true);
});

test("SteelMemberVerification consumes a 3D FEM result and emits uniform advanced output", () => {
  const { section, material } = fixture();
  const result = new SteelMemberVerification().verify({ section, material, analysisResult: fem3d() });
  assert.equal(result.outputs.contractValidation.ok, true);
  assert.ok(result.checks.some((check) => check.id === "steel-web-shear-buckling"));
  assert.ok(result.checks.some((check) => check.id === "steel-concentrated-web-load"));
  assert.ok(result.checks.some((check) => check.id === "steel-bending-shear-interaction"));
  assert.equal(
    result.checks.find((check) => check.id === "steel-beam-column-interaction-n-my-mz")
      .metadata.momentDiagramFactorYSource,
    "fem-end-moment-diagram",
  );
  assert.ok(result.checks.some((check) => check.id === "steel-sle-deflection"));
  assert.equal(result.outputs.vibration.status, "requires-input");
  assert.ok(result.checks.every((check) => Array.isArray(check.warnings) && Array.isArray(check.assumptions)));
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});

test("insufficient 3D FEM data and bimoment return NOT_SUPPORTED without invented capacity", () => {
  const { section, material } = fixture();
  const incomplete = fem3d();
  delete incomplete.fem3d.combinations[0].stations[0].B;
  const invalidResult = new SteelMemberVerification().verify({ section, material, analysisResult: incomplete });
  assert.equal(invalidResult.status, "not-supported");
  assert.equal(invalidResult.checks[0].capacity, null);
  assert.ok(invalidResult.checks[0].metadata.missingInputs.some((item) => item.includes("action B")));

  const warpingResult = new SteelMemberVerification().verify({ section, material, analysisResult: fem3d({ bimoment: 10e6 }) });
  const warping = warpingResult.checks.find((check) => check.id === "steel-warping-torsion");
  assert.equal(warpingResult.status, "not-supported");
  assert.equal(warping.capacity, null);
  assert.equal(warping.utilizationRatio, null);
  assert.ok(warping.metadata.missingInputs.length > 0);
});
