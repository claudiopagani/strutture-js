import test from "node:test";
import assert from "node:assert/strict";

import {
    NTC2018_DISPLACEMENT_REFERENCES,
    NTC2018_DRIFT_INFILL_CATEGORY,
    NTC2018_DRIFT_LIMITS,
    NTC2018_PDELTA_THRESHOLDS,
    NTC2018_STRUCTURAL_BEHAVIOR,
    computePDeltaCoefficient,
    computeSeismicJointWidth,
    computeStoreyDrift,
    createDisplacementAssessment,
    verifyPDelta,
    verifyStoreyDisplacements,
    verifyStoreyDrift,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Catalog checks
// ---------------------------------------------------------------------------

test("drift limits catalog is frozen", () => {
    assert.equal(Object.isFrozen(NTC2018_DRIFT_LIMITS), true);
    assert.equal(NTC2018_DRIFT_LIMITS.sle["rigidly-connected"], 0.005);
    assert.equal(NTC2018_DRIFT_LIMITS.sle["no-infill"], 0.01);
    assert.equal(NTC2018_DRIFT_LIMITS.slu, 0.01);
});

test("P-Delta thresholds are correct", () => {
    assert.equal(NTC2018_PDELTA_THRESHOLDS.negligible, 0.1);
    assert.equal(NTC2018_PDELTA_THRESHOLDS.moderate, 0.2);
});

test("displacement references are frozen", () => {
    assert.equal(Object.isFrozen(NTC2018_DISPLACEMENT_REFERENCES), true);
});

// ---------------------------------------------------------------------------
// computeStoreyDrift
// ---------------------------------------------------------------------------

test("storey drift: basic computation", () => {
    const result = computeStoreyDrift({
        displacementTop: 0.025,
        displacementBottom: 0.005,
        storeyHeight: 3.0,
    });

    assert.ok(Math.abs(result.drift - 0.020) < 1e-9);
    assert.ok(Math.abs(result.driftRatio - 0.020 / 3.0) < 1e-9);
});

test("storey drift: zero drift", () => {
    const result = computeStoreyDrift({
        displacementTop: 0.01,
        displacementBottom: 0.01,
        storeyHeight: 3.0,
    });

    assert.equal(result.drift, 0);
    assert.equal(result.driftRatio, 0);
});

// ---------------------------------------------------------------------------
// verifyStoreyDrift
// ---------------------------------------------------------------------------

test("verifyStoreyDrift: SLE rigidly-connected within limit", () => {
    const result = verifyStoreyDrift({
        driftRatio: 0.004,
        limitState: "SLE",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        infillCategory: "rigidly-connected",
    });

    assert.equal(result.ok, true);
    assert.equal(result.limit, 0.005);
    assert.equal(result.check, "drift-sle");
});

test("verifyStoreyDrift: SLE rigidly-connected exceeding limit", () => {
    const result = verifyStoreyDrift({
        driftRatio: 0.007,
        limitState: "SLE",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        infillCategory: "rigidly-connected",
    });

    assert.equal(result.ok, false);
});

test("verifyStoreyDrift: SLE no-infill within limit", () => {
    const result = verifyStoreyDrift({
        driftRatio: 0.009,
        limitState: "SLE",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.equal(result.ok, true);
    assert.equal(result.limit, 0.01);
});

test("verifyStoreyDrift: SLU dissipative within limit", () => {
    const result = verifyStoreyDrift({
        driftRatio: 0.008,
        limitState: "SLU",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.equal(result.ok, true);
    assert.equal(result.limit, 0.01);
    assert.equal(result.check, "drift-slu");
});

test("verifyStoreyDrift: SLU dissipative exceeding limit", () => {
    const result = verifyStoreyDrift({
        driftRatio: 0.015,
        limitState: "SLU",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.equal(result.ok, false);
});

test("verifyStoreyDrift: SLU non-dissipative uses SLE limits", () => {
    const result = verifyStoreyDrift({
        driftRatio: 0.008,
        limitState: "SLU",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
    });

    assert.equal(result.ok, true);
    assert.equal(result.limit, 0.01);
    assert.equal(result.check, "drift-non-dissipative");
});

// ---------------------------------------------------------------------------
// computePDeltaCoefficient
// ---------------------------------------------------------------------------

test("P-Delta: negligible", () => {
    const result = computePDeltaCoefficient({
        storeyWeight: 1000,
        drift: 0.02,
        storeyShear: 200,
        storeyHeight: 3.0,
    });

    // theta = 1000 * 0.02 / (200 * 3) = 20 / 600 = 0.0333...
    assert.ok(result.theta < 0.1);
    assert.equal(result.status, "negligible");
    assert.equal(result.amplificationFactor, null);
});

test("P-Delta: moderate", () => {
    const result = computePDeltaCoefficient({
        storeyWeight: 1000,
        drift: 0.08,
        storeyShear: 200,
        storeyHeight: 3.0,
    });

    // theta = 1000 * 0.08 / (200 * 3) = 80 / 600 = 0.1333...
    assert.ok(result.theta > 0.1 && result.theta <= 0.2);
    assert.equal(result.status, "moderate");
    assert.ok(result.amplificationFactor !== null);
    assert.ok(Math.abs(result.amplificationFactor - 1 / (1 - result.theta)) < 1e-9);
});

test("P-Delta: nonlinear required", () => {
    const result = computePDeltaCoefficient({
        storeyWeight: 1000,
        drift: 0.15,
        storeyShear: 200,
        storeyHeight: 3.0,
    });

    // theta = 1000 * 0.15 / (200 * 3) = 150 / 600 = 0.25
    assert.ok(result.theta > 0.2);
    assert.equal(result.status, "nonlinear-required");
});

// ---------------------------------------------------------------------------
// verifyPDelta
// ---------------------------------------------------------------------------

test("verifyPDelta: ok for negligible", () => {
    const result = verifyPDelta({
        storeyWeight: 500,
        drift: 0.01,
        storeyShear: 200,
        storeyHeight: 3.0,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "negligible");
});

test("verifyPDelta: ok for moderate", () => {
    const result = verifyPDelta({
        storeyWeight: 1000,
        drift: 0.08,
        storeyShear: 200,
        storeyHeight: 3.0,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "moderate");
});

test("verifyPDelta: not ok for nonlinear required", () => {
    const result = verifyPDelta({
        storeyWeight: 1000,
        drift: 0.15,
        storeyShear: 200,
        storeyHeight: 3.0,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "nonlinear-required");
});

// ---------------------------------------------------------------------------
// computeSeismicJointWidth
// ---------------------------------------------------------------------------

test("seismic joint: dissipative buildings", () => {
    const result = computeSeismicJointWidth({
        buildingHeightA: 15,
        buildingHeightB: 12,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    // minA = 0.01 * 15 = 0.15, minB = 0.01 * 12 = 0.12, joint = 0.27
    assert.ok(Math.abs(result.jointWidth - 0.27) < 1e-9);
    assert.ok(Math.abs(result.dA - 0.15) < 1e-9);
    assert.ok(Math.abs(result.dB - 0.12) < 1e-9);
});

test("seismic joint: with SLV displacements larger than minimum", () => {
    const result = computeSeismicJointWidth({
        buildingHeightA: 10,
        buildingHeightB: 10,
        slvDisplacementA: 0.20,
        slvDisplacementB: 0.15,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    // minA = 0.10, slvA = 0.20 → dA = 0.20
    // minB = 0.10, slvB = 0.15 → dB = 0.15
    assert.ok(Math.abs(result.dA - 0.20) < 1e-9);
    assert.ok(Math.abs(result.dB - 0.15) < 1e-9);
    assert.ok(Math.abs(result.jointWidth - 0.35) < 1e-9);
});

test("seismic joint: non-dissipative returns zero", () => {
    const result = computeSeismicJointWidth({
        buildingHeightA: 15,
        buildingHeightB: 12,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
    });

    assert.equal(result.jointWidth, 0);
    assert.equal(result.isDissipative, false);
});

// ---------------------------------------------------------------------------
// verifyStoreyDisplacements
// ---------------------------------------------------------------------------

test("verifyStoreyDisplacements: SLE with no P-Delta", () => {
    const result = verifyStoreyDisplacements({
        storey: {
            storeyId: "S1",
            height: 3.0,
            displacementX: 0.015,
            displacementXBelow: 0.0,
            weight: 1000,
        },
        limitState: "SLE",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        checkPDelta: false,
    });

    assert.equal(result.storeyId, "S1");
    assert.ok(result.driftX.ok);
    assert.equal(result.driftY, null);
    assert.equal(result.pDeltaX, null);
});

test("verifyStoreyDisplacements: SLU with P-Delta", () => {
    const result = verifyStoreyDisplacements({
        storey: {
            storeyId: "S1",
            height: 3.0,
            displacementX: 0.02,
            displacementXBelow: 0.0,
            weight: 1000,
            shearX: 200,
        },
        limitState: "SLU",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.ok(result.driftX.ok);
    assert.ok(result.pDeltaX !== null);
    assert.equal(result.pDeltaX.status, "negligible");
});

// ---------------------------------------------------------------------------
// createDisplacementAssessment
// ---------------------------------------------------------------------------

test("createDisplacementAssessment: full building SLU", () => {
    const assessment = createDisplacementAssessment({
        storeys: [
            {
                storeyId: "S1",
                height: 3.0,
                displacementX: 0.02,
                displacementXBelow: 0.0,
                displacementY: 0.015,
                displacementYBelow: 0.0,
                weight: 3000,
                shearX: 400,
                shearY: 350,
            },
            {
                storeyId: "S2",
                height: 3.0,
                displacementX: 0.045,
                displacementXBelow: 0.02,
                displacementY: 0.035,
                displacementYBelow: 0.015,
                weight: 2000,
                shearX: 300,
                shearY: 280,
            },
        ],
        limitState: "SLU",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.equal(assessment.limitState, "SLU");
    assert.equal(assessment.storeyResults.length, 2);
    assert.ok(assessment.governingDriftX !== null);
    assert.ok(assessment.governingDriftY !== null);
    assert.ok(assessment.governingThetaX !== null);
    assert.ok(assessment.allChecksOk);
    assert.ok(Array.isArray(assessment.checks));
});

test("createDisplacementAssessment: non-dissipative", () => {
    const assessment = createDisplacementAssessment({
        storeys: [
            {
                storeyId: "S1",
                height: 3.0,
                displacementX: 0.03,
                displacementXBelow: 0.0,
                weight: 1000,
                shearX: 100,
            },
        ],
        limitState: "SLU",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
    });

    // drift = 0.03/3.0 = 0.01 → limit is 0.01 (SLE limit for non-dissipative)
    assert.equal(assessment.allChecksOk, true);
    assert.equal(assessment.storeyResults[0].driftX.limit, 0.01);
});

test("createDisplacementAssessment: rejects empty storeys", () => {
    assert.throws(
        () =>
            createDisplacementAssessment({
                storeys: [],
                limitState: "SLE",
                behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
            }),
        /At least one storey/,
    );
});

test("createDisplacementAssessment: governing values track maximums", () => {
    const assessment = createDisplacementAssessment({
        storeys: [
            {
                storeyId: "S1",
                height: 3.0,
                displacementX: 0.01,
                displacementXBelow: 0.0,
                weight: 1000,
                shearX: 100,
            },
            {
                storeyId: "S2",
                height: 3.0,
                displacementX: 0.04,
                displacementXBelow: 0.01,
                weight: 500,
                shearX: 80,
            },
        ],
        limitState: "SLU",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    // S1 drift = 0.01/3 = 0.00333, S2 drift = 0.03/3 = 0.01
    // Governing should be S2
    assert.equal(assessment.governingDriftX.storeyId, "S2");
    assert.ok(Math.abs(assessment.governingDriftX.driftRatio - 0.01) < 1e-9);
});
