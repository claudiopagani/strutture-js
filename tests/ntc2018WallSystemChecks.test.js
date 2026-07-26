import test from "node:test";
import assert from "node:assert/strict";

import {
  computeMixedSystemWallShearEnvelope,
  computeWallEffectiveFlangeWidth,
  computeWeaklyReinforcedWallAxialDemandRange,
  computeWeaklyReinforcedWallShearDemand,
  createCouplingBeamAssessment,
  createWallHeightSystemAssessment,
  verifyWallCurvatureDuctility,
  verifyWallGeneralDetailing,
} from "../src/index.js";

test("composed-wall flange width uses the minimum of all NTC limits", () => {
  const result = computeWallEffectiveFlangeWidth({
    actualFlangeWidth: 2,
    wallHeightAbove: 6,
    adjacentWebSpacing: 5,
  });

  assert.equal(result.effectiveFlangeWidth, 1.5);
  assert.deepEqual(result.limits, {
    actualFlangeWidth: 2,
    quarterWallHeightAbove: 1.5,
    halfAdjacentWebSpacing: 2.5,
  });
});

test("mixed-system wall shear follows Figure 7.4.5 at and above one third", () => {
  const result = computeMixedSystemWallShearEnvelope({
    wallHeight: 6,
    baseAmplifiedShear: 200,
    analysisShearAtOneThird: 60,
    elevations: [0, 1, 2, 3, 6],
  });

  assert.equal(result.shearAtOneThird, 100);
  assert.deepEqual(
    result.points.map((item) => item.shearDemand),
    [200, 150, 100, 100, 100],
  );
});

test("weakly reinforced walls apply shear and axial dynamic additions", () => {
  const shear = computeWeaklyReinforcedWallShearDemand({
    analysisShear: -100,
    q: 3,
  });
  const axial = computeWeaklyReinforcedWallAxialDemandRange({
    gravityAxialDemand: 1000,
    q: 3,
  });
  const noAxialAddition = computeWeaklyReinforcedWallAxialDemandRange({
    gravityAxialDemand: 1000,
    q: 2,
  });

  assert.equal(shear.amplificationFactor, 2);
  assert.equal(shear.shearDemand, 200);
  assert.deepEqual(
    [axial.minimumAxialDemand, axial.maximumAxialDemand],
    [500, 1500],
  );
  assert.equal(noAxialAddition.additionalDynamicDemand, 0);
});

test("wall detailing applies the 20 cm limit with diagonal coupling bars", () => {
  const result = verifyWallGeneralDetailing({
    wallThickness: 0.20,
    clearStoreyHeight: 3,
    diagonalCouplingReinforcementRequired: true,
    supportedFromFoundationOrRigidBox: true,
    irregularOpeningsIncludedInAnalysis: true,
    verticalReinforcementRatio: 0.005,
    horizontalReinforcementRatio: 0.002,
    maximumConcreteCompressiveStrain: 0.0021,
    maximumBarDiameter: 0.020,
    barsOnBothFaces: true,
    maximumBarSpacing: 0.30,
    tiesPerSquareMetre: 9,
  });

  assert.equal(result.minimumThickness, 0.20);
  assert.equal(result.ok, true);
  assert.equal(result.recommendations[0].applicable, true);
  assert.equal(result.recommendations[0].satisfied, true);
});

test("wall curvature ductility compares independent capacity and demand", () => {
  assert.equal(verifyWallCurvatureDuctility({
    curvatureDuctilityDemand: 6,
    curvatureDuctilityCapacity: 6,
  }).ok, true);
  assert.equal(verifyWallCurvatureDuctility({
    curvatureDuctilityDemand: 6.01,
    curvatureDuctilityCapacity: 6,
  }).ok, false);
});

test("coupling beam uses the ordinary procedure at the exact span ratio limit", () => {
  const result = createCouplingBeamAssessment({
    beamId: "CB-1",
    clearSpan: 1.5,
    sectionHeight: 0.5,
    slabThickness: 0.2,
    width: 0.3,
    effectiveDepth: 0.45,
    shearDemand: 300,
    concreteTensileDesignStrength: 1000,
    chapter4FlexuralVerification: { ok: true },
    ordinaryBeamVerification: { ok: true },
  });

  assert.equal(result.procedure, "ordinary-beam");
  assert.equal(result.status, "ok");
});

test("short highly sheared coupling beam requires diagonal X reinforcement", () => {
  const baseInput = {
    beamId: "CB-2",
    clearSpan: 1,
    sectionHeight: 0.5,
    slabThickness: 0.2,
    width: 0.3,
    effectiveDepth: 0.5,
    shearDemand: 200,
    concreteTensileDesignStrength: 1000,
    chapter4FlexuralVerification: { ok: true },
  };
  const missing = createCouplingBeamAssessment(baseInput);
  const complete = createCouplingBeamAssessment({
    ...baseInput,
    diagonalReinforcement: {
      areaPerDiagonal: 0.0008,
      designYieldStrength: 450000,
      minimumAngle: Math.PI / 4,
      confinementSpacing: 0.10,
      distributedBarDiameter: 0.010,
      distributedBarSpacing: 0.10,
      edgeBarCountPerEdge: 2,
      edgeBarDiameter: 0.016,
      providedAnchorageLength: 0.75,
      nonSeismicAnchorageLength: 0.50,
    },
  });

  assert.equal(missing.status, "not-implemented");
  assert.equal(missing.procedure, "diagonal-X");
  assert.equal(complete.status, "ok");
  assert.ok(complete.checks.some((item) =>
    item.id === "coupling-beam-diagonal-shear"));
});

test("beam as deep as the slab cannot be effective for wall coupling", () => {
  const result = createCouplingBeamAssessment({
    beamId: "CB-SLAB",
    clearSpan: 1.5,
    sectionHeight: 0.2,
    slabThickness: 0.2,
    width: 0.3,
    effectiveDepth: 0.18,
    shearDemand: 10,
    concreteTensileDesignStrength: 1000,
    chapter4FlexuralVerification: { ok: true },
    ordinaryBeamVerification: { ok: true },
  });

  assert.equal(result.effectiveForCoupling, false);
  assert.equal(result.status, "not-verified");
});

test("wall-height assessment remains incomplete when any mapped cut is absent", () => {
  const sectionAssessment = {
    sectionCutId: "CUT-BASE",
    complete: true,
    checks: [{ id: "flexure", ok: true }],
  };
  const incomplete = createWallHeightSystemAssessment({
    wallId: "W1",
    expectedSectionCutIds: ["CUT-BASE", "CUT-L1"],
    sectionStateAssessments: [sectionAssessment],
    detailingAssessment: { checks: [{ id: "detail", ok: true }] },
  });
  const complete = createWallHeightSystemAssessment({
    wallId: "W1",
    expectedSectionCutIds: ["CUT-BASE"],
    sectionStateAssessments: [sectionAssessment],
    detailingAssessment: { checks: [{ id: "detail", ok: true }] },
  });

  assert.equal(incomplete.status, "not-implemented");
  assert.deepEqual(incomplete.missing, ["sectionCut:CUT-L1"]);
  assert.equal(complete.status, "ok");
});
