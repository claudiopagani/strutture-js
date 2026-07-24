import test from "node:test";
import assert from "node:assert/strict";

import {
    NTC2018_SHEAR_WALL_REFERENCES,
    NTC2018_STRUCTURAL_BEHAVIOR,
    computeWallBoundaryLength,
    computeWallCapacityShear,
    computeWallConfinementOmegaWd,
    computeWallCriticalZoneHeight,
    computeWallMomentShift,
    createWallSectionAssessment,
    verifyWallBoundaryConfinement,
    verifyWallShear,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// computeWallCriticalZoneHeight
// ---------------------------------------------------------------------------

test("critical zone: tall wall", () => {
    const result = computeWallCriticalZoneHeight({
        wallLength: 3.0,
        wallHeight: 18.0,
    });
    // max(3.0, 18/6) = max(3, 3) = 3; 2*lw = 6; → hCr = 3
    assert.ok(Math.abs(result.hCr - 3.0) < 1e-9);
});

test("critical zone: squat wall", () => {
    const result = computeWallCriticalZoneHeight({
        wallLength: 5.0,
        wallHeight: 9.0,
    });
    // max(5.0, 9/6=1.5) = 5.0; 2*lw = 10; → hCr = 5.0
    assert.ok(Math.abs(result.hCr - 5.0) < 1e-9);
});

test("critical zone: capped by storey height", () => {
    const result = computeWallCriticalZoneHeight({
        wallLength: 4.0,
        wallHeight: 24.0,
        storeyHeight: 3.0,
    });
    // max(4, 24/6=4) = 4; min(2*4=8, 3.0) = 3.0
    assert.ok(Math.abs(result.hCr - 3.0) < 1e-9);
});

// ---------------------------------------------------------------------------
// computeWallMomentShift
// ---------------------------------------------------------------------------

test("moment shift: CD\"A\" = h_cr", () => {
    const result = computeWallMomentShift({
        wallLength: 3.0,
        criticalZoneHeight: 3.0,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });
    // NTC 2018 § 7.4.4.5.1: a_l = h_cr = 3.0
    assert.ok(Math.abs(result.shiftLength - 3.0) < 1e-9);
});

test("moment shift: CD\"B\" = h_cr", () => {
    const result = computeWallMomentShift({
        wallLength: 4.0,
        criticalZoneHeight: 4.0,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
    });
    // NTC 2018 § 7.4.4.5.1: a_l = h_cr = 4.0
    assert.ok(Math.abs(result.shiftLength - 4.0) < 1e-9);
});

test("moment shift: non-dissipative is zero", () => {
    const result = computeWallMomentShift({
        wallLength: 3.0,
        criticalZoneHeight: 3.0,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
    });
    assert.equal(result.shiftLength, 0);
});

// ---------------------------------------------------------------------------
// computeWallCapacityShear
// ---------------------------------------------------------------------------

test("wall capacity shear: slender wall CD\"A\"", () => {
    const result = computeWallCapacityShear({
        baseMomentResistance: 5000,   // M_Rd
        baseMomentDemand: 4000,       // M_Ed
        analysisShear: 100,           // V_Ed,analysis
        qFactor: 4.0,
        cornerPeriod: 0.5,            // T_C
        fundamentalPeriod: 1.0,       // T_1
        spectrumAtCorner: 0.25,       // S_e(T_C)
        spectrumAtT1: 0.10,           // S_e(T_1)
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });
    // gammaRd (wall shear) = 1.20 (CD"A", Tab. 7.2.I)
    // eps = 1.5 * q * (gRd*M_Rd/M_Ed) * (Se(Tc)/Se(T1))^2
    //     = 1.5 * 4.0 * (1.20*5000/4000) * (0.25/0.10)^2
    //     = 1.5 * 4.0 * 1.5 * 6.25 = 56.25
    // V = max(56.25*100, 100) = 5625
    assert.equal(result.gammaRd, 1.20);
    assert.ok(Math.abs(result.amplificationFactor - 56.25) < 1e-6);
    assert.ok(Math.abs(result.shearDemand - 5625) < 1e-6);
});

test("wall capacity shear: floored at analysis shear", () => {
    const result = computeWallCapacityShear({
        baseMomentResistance: 1000,
        baseMomentDemand: 900,
        analysisShear: 500,
        qFactor: 1.0,
        cornerPeriod: 0.5,
        fundamentalPeriod: 1.0,
        spectrumAtCorner: 0.10,
        spectrumAtT1: 0.10,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
    });
    // CD"B" wallShear is null in Tab. 7.2.I → fallback gammaRd = 1.0
    // eps = 1.5 * 1.0 * (1.0*1000/900) * 1^2 = 1.6667
    // eps*V = 833.3 > 500 → V = 833.3
    assert.ok(Math.abs(result.shearDemand - 833.333) < 1e-2);
});

// ---------------------------------------------------------------------------
// verifyWallShear
// ---------------------------------------------------------------------------

test("wall shear: basic check within limits", () => {
    const result = verifyWallShear({
        shearDemand: 200000,    // 200 kN → N
        wallThickness: 300,      // 0.3 m → mm
        wallLength: 3000,        // 3.0 m → mm
        concreteDesignStrength: 14.17, // N/mm² (≈C25/30)
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
    });

    // d = 0.8*3000 = 2400 mm
    // fctd ≈ 0.27 * 14.17^(2/3) ≈ 1.6 N/mm²
    // V_Rd,c = 1.0 * 0.28 * 1.6 * 300 * 2400 = 322560 N ≈ 323 kN > 200 kN
    assert.equal(result.ok, true);
    assert.ok(result.vRd > 0);
    assert.ok(result.compressionOk);
});

test("wall shear: CD\"A\" uses cotTheta = 1.0", () => {
    const result = verifyWallShear({
        shearDemand: 300000,
        wallThickness: 300,
        wallLength: 3000,
        concreteDesignStrength: 14.17,
        horizontalReinforcementArea: 2.0,   // mm²/mm (≈2000 mm²/m)
        reinforcementDesignStrength: 391.3,  // N/mm²
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.equal(result.cotTheta, 1.0);
});

// ---------------------------------------------------------------------------
// verifyWallBoundaryConfinement
// ---------------------------------------------------------------------------

test("boundary confinement: low stress does not require confinement", () => {
    const result = verifyWallBoundaryConfinement({
        axialForce: 500000,     // 500 kN → N
        bendingMoment: 1000000, // 1000 kN·m → N·mm (*1000 → 1e9 N·mm)
        wallLength: 3000,        // 3.0 m → mm
        wallThickness: 300,      // 0.3 m → mm
        concreteDesignStrength: 14.17, // N/mm²
    });
    // area = 3000*300 = 900000 mm²
    // W = 300 * 3000²/6 = 450,000,000 mm³
    // σN = 500000/900000 = 0.556 N/mm²
    // σM = 1e9/4.5e8 = 2.222 N/mm²
    // σ = 2.778 N/mm², 0.20*fcd = 2.834 N/mm² → σ < threshold
    assert.equal(result.confinementRequired, false);
    assert.ok(result.stressRatio < 0.20);
});

test("boundary confinement: high stress requires confinement", () => {
    const result = verifyWallBoundaryConfinement({
        axialForce: 3000000,     // 3000 kN → N
        bendingMoment: 5000000000, // 5000 kN·m → N·mm
        wallLength: 2000,          // 2.0 m → mm
        wallThickness: 250,        // 0.25 m → mm
        concreteDesignStrength: 14.17,
    });
    // area = 2000*250 = 500000 mm²
    // W = 250 * 2000²/6 = 166,666,667 mm³
    // σN = 3e6/5e5 = 6 N/mm², σM = 5e9/1.67e8 = 30 N/mm²
    // σ = 36 N/mm², 0.20*14.17 = 2.834 → confinement required
    assert.equal(result.confinementRequired, true);
});

// ---------------------------------------------------------------------------
// computeWallBoundaryLength
// ---------------------------------------------------------------------------

test("boundary length: basic computation", () => {
    const result = computeWallBoundaryLength({
        normalizedAxialForce: 0.15,
        wallLength: 3.0,
        wallThickness: 0.3,
    });

    assert.ok(result.boundaryLength >= 0.3); // not less than bw
    assert.ok(result.boundaryLength >= 0.5); // lw/6 = 0.5
    assert.ok(result.xu > 0);
});

// ---------------------------------------------------------------------------
// computeWallConfinementOmegaWd
// ---------------------------------------------------------------------------

test("confinement omega: CD\"A\" with high nu", () => {
    const result = computeWallConfinementOmegaWd({
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        normalizedAxialForce: 0.2,
    });
    // computed = 30*9*0.2*0.002 - 0.035 = 0.108 - 0.035 = 0.073
    // max(0.08, 0.073) = 0.08
    assert.ok(result.omegaWd >= 0.08);
});

test("confinement omega: CD\"B\"", () => {
    const result = computeWallConfinementOmegaWd({
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
        normalizedAxialForce: 0.3,
    });
    assert.equal(result.omegaWd, 0.04);
});

test("confinement omega: non-dissipative returns zero", () => {
    const result = computeWallConfinementOmegaWd({
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
        normalizedAxialForce: 0.3,
    });
    assert.equal(result.omegaWd, 0);
});

// ---------------------------------------------------------------------------
// createWallSectionAssessment
// ---------------------------------------------------------------------------

test("wall section assessment: base section CD\"A\"", () => {
    const result = createWallSectionAssessment({
        sectionId: "W1-base",
        elevation: 0,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        actions: {
            axialForce: 2000000,
            shearX: 400000,
            shearY: 100000,
            momentX: 3000000000,
            momentY: 500000000,
        },
        geometry: {
            wallLength: 3000,
            wallThickness: 300,
            wallHeight: 15000,
        },
        materials: {
            fcd: 14.17,
            fywd: 391.3,
        },
        horizontalReinforcementArea: 2.0,
        isBase: true,
    });

    assert.equal(result.sectionId, "W1-base");
    assert.equal(result.isBase, true);
    assert.ok(result.checks.length >= 3); // shear X, shear Y, confinement checks
});

test("wall section assessment: non-base section has fewer checks", () => {
    const result = createWallSectionAssessment({
        sectionId: "W1-mid",
        elevation: 6000,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        actions: { axialForce: 1000000, shearX: 200000, momentX: 1000000000 },
        geometry: { wallLength: 3000, wallThickness: 300 },
        materials: { fcd: 14.17 },
        isBase: false,
    });

    // Should only have shear X check (no boundary at non-base)
    assert.ok(result.checks.length >= 1);
    assert.ok(result.checks.some((c) => c.check === "wall-shear"));
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

test("shear wall references are frozen", () => {
    assert.equal(Object.isFrozen(NTC2018_SHEAR_WALL_REFERENCES), true);
});
