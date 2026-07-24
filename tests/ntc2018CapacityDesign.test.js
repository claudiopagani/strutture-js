import test from "node:test";
import assert from "node:assert/strict";

import {
    NTC2018_CAPACITY_DESIGN_REFERENCES,
    NTC2018_STRUCTURAL_BEHAVIOR,
    computeBeamCapacityShear,
    computeColumnCapacityShear,
    computeJointCapacityShear,
    createCapacityDesignAssessment,
    verifyBeamColumnHierarchy,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// verifyBeamColumnHierarchy
// ---------------------------------------------------------------------------

test("beam-column hierarchy: CD\"A\" with sufficient column resistance", () => {
    const result = verifyBeamColumnHierarchy({
        beamMomentResistancePositive: 100,
        beamMomentResistanceNegative: 80,
        columnMomentResistance: 250,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    // gammaRd = 1.20, demand = 1.20 * (100 + 80) = 216 ≤ 250
    assert.equal(result.gammaRd, 1.20);
    assert.ok(Math.abs(result.demand - 216) < 1e-9);
    assert.equal(result.capacity, 250);
    assert.ok(result.utilizationRatio < 1);
    assert.equal(result.ok, true);
    assert.equal(result.check, "capacity-design-beam-column-hierarchy");
});

test("beam-column hierarchy: CD\"A\" with insufficient column resistance", () => {
    const result = verifyBeamColumnHierarchy({
        beamMomentResistancePositive: 150,
        beamMomentResistanceNegative: 120,
        columnMomentResistance: 250,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    // demand = 1.20 * 270 = 324 > 250
    assert.ok(result.demand > result.capacity);
    assert.equal(result.ok, false);
    assert.ok(result.utilizationRatio > 1);
});

test("beam-column hierarchy: CD\"B\" gammaRd is 1.10 (beam shear)", () => {
    const result = verifyBeamColumnHierarchy({
        beamMomentResistancePositive: 100,
        beamMomentResistanceNegative: 80,
        columnMomentResistance: 200,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
    });

    // gammaRd (beam shear) in CD"B" = 1.10 (Tab. 7.2.I)
    // demand = 1.10 * 180 = 198 ≤ 200
    assert.equal(result.gammaRd, 1.10);
    assert.ok(Math.abs(result.demand - 198) < 1e-9);
    assert.equal(result.ok, true);
});

test("beam-column hierarchy: zero column resistance gives infinite ratio", () => {
    const result = verifyBeamColumnHierarchy({
        beamMomentResistancePositive: 10,
        beamMomentResistanceNegative: 10,
        columnMomentResistance: 0,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.equal(result.ok, false);
    assert.equal(result.utilizationRatio, Infinity);
});

test("beam-column hierarchy: rejects negative moments", () => {
    assert.throws(
        () =>
            verifyBeamColumnHierarchy({
                beamMomentResistancePositive: -10,
                beamMomentResistanceNegative: 80,
                columnMomentResistance: 200,
                behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
            }),
        /beamMomentResistancePositive/,
    );
});

// ---------------------------------------------------------------------------
// computeBeamCapacityShear
// ---------------------------------------------------------------------------

test("beam capacity shear: CD\"A\" basic case", () => {
    const result = computeBeamCapacityShear({
        momentResistancePositive: 200,
        momentResistanceNegative: 150,
        clearLength: 5,
        gravityShear: 30,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    // gammaRd (beam shear) = 1.20, shear from moments = 1.20 * 350 / 5 = 84
    // total shear = |84 + 30| = 114
    assert.equal(result.gammaRd, 1.20);
    assert.ok(Math.abs(result.shearFromMoments - 84) < 1e-9);
    assert.ok(Math.abs(result.shearDemand - 114) < 1e-9);
});

test("beam capacity shear: CD\"B\" without gravity shear", () => {
    const result = computeBeamCapacityShear({
        momentResistancePositive: 200,
        momentResistanceNegative: 150,
        clearLength: 5,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
    });

    // gammaRd = 1.10, shear = 1.10 * 350 / 5 = 77
    assert.equal(result.gammaRd, 1.10);
    assert.ok(Math.abs(result.shearDemand - 77) < 1e-9);
});

test("beam capacity shear: rejects zero clear length", () => {
    assert.throws(
        () =>
            computeBeamCapacityShear({
                momentResistancePositive: 200,
                momentResistanceNegative: 150,
                clearLength: 0,
                behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
            }),
        /clearLength/,
    );
});

// ---------------------------------------------------------------------------
// computeColumnCapacityShear
// ---------------------------------------------------------------------------

test("column capacity shear: CD\"A\"", () => {
    const result = computeColumnCapacityShear({
        momentResistanceTop: 300,
        momentResistanceBottom: 250,
        clearLength: 3,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    // gammaRd = 1.30, shear = 1.30 * (300 + 250) / 3 = 238.333...
    assert.equal(result.gammaRd, 1.30);
    assert.ok(Math.abs(result.shearDemand - 1.30 * 550 / 3) < 1e-9);
});

test("column capacity shear: CD\"B\"", () => {
    const result = computeColumnCapacityShear({
        momentResistanceTop: 300,
        momentResistanceBottom: 250,
        clearLength: 3,
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
    });

    // gammaRd = 1.10
    assert.equal(result.gammaRd, 1.10);
    assert.ok(Math.abs(result.shearDemand - 1.10 * 550 / 3) < 1e-9);
});

// ---------------------------------------------------------------------------
// computeJointCapacityShear
// ---------------------------------------------------------------------------

test("joint capacity shear: CD\"A\" internal joint", () => {
    const result = computeJointCapacityShear({
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        topReinforcementArea: 1000,
        bottomReinforcementArea: 800,
        reinforcementDesignStrength: 391.3,
        columnShearAbove: 50,
        jointType: "internal",
    });

    // gammaRd = 1.20
    // Vjbd = |1.20 * (1000 + 800) * 391.3 - 50| = |1.20 * 1800 * 391.3 - 50|
    const expected = Math.abs(1.20 * 1800 * 391.3 - 50);
    assert.equal(result.gammaRd, 1.20);
    assert.ok(Math.abs(result.shearDemand - expected) < 1e-9);
    assert.equal(result.jointType, "internal");
});

test("joint capacity shear: CD\"A\" external joint", () => {
    const result = computeJointCapacityShear({
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        topReinforcementArea: 1000,
        bottomReinforcementArea: 800,
        reinforcementDesignStrength: 391.3,
        columnShearAbove: 50,
        jointType: "external",
    });

    // Vjbd = |1.20 * 1000 * 391.3 - 50| (only top reinforcement)
    const expected = Math.abs(1.20 * 1000 * 391.3 - 50);
    assert.ok(Math.abs(result.shearDemand - expected) < 1e-9);
});

test("joint capacity shear: CD\"B\" gammaRd is 1.10", () => {
    const result = computeJointCapacityShear({
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
        topReinforcementArea: 1000,
        bottomReinforcementArea: 800,
        reinforcementDesignStrength: 391.3,
        jointType: "internal",
    });

    assert.equal(result.gammaRd, 1.10);
});

test("joint capacity shear: rejects invalid joint type", () => {
    assert.throws(
        () =>
            computeJointCapacityShear({
                behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
                topReinforcementArea: 1000,
                bottomReinforcementArea: 800,
                reinforcementDesignStrength: 391.3,
                jointType: "corner",
            }),
        /jointType/,
    );
});

// ---------------------------------------------------------------------------
// createCapacityDesignAssessment
// ---------------------------------------------------------------------------

test("createCapacityDesignAssessment: CD\"A\" complete joint", () => {
    const assessment = createCapacityDesignAssessment({
        jointId: "J1",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        hierarchy: {
            beamMomentResistancePositive: 100,
            beamMomentResistanceNegative: 80,
            columnMomentResistance: 250,
        },
        beamShear: {
            momentResistancePositive: 200,
            momentResistanceNegative: 150,
            clearLength: 5,
            gravityShear: 30,
        },
        columnShear: {
            momentResistanceTop: 300,
            momentResistanceBottom: 250,
            clearLength: 3,
        },
        jointShear: {
            topReinforcementArea: 1000,
            bottomReinforcementArea: 800,
            reinforcementDesignStrength: 391.3,
            columnShearAbove: 50,
            jointType: "internal",
        },
    });

    assert.equal(assessment.jointId, "J1");
    assert.equal(assessment.isDissipative, true);
    assert.equal(assessment.checks.length, 4);
    // First check: hierarchy (full result with ok)
    assert.equal(assessment.checks[0].check, "capacity-design-beam-column-hierarchy");
    assert.equal(assessment.checks[0].ok, true);
    // Remaining checks: shear demands (ok = null, need V_Rd from local verifier)
    assert.equal(assessment.checks[1].check, "capacity-design-beam-shear");
    assert.equal(assessment.checks[1].ok, null);
});

test("createCapacityDesignAssessment: non-dissipative skips checks", () => {
    const assessment = createCapacityDesignAssessment({
        jointId: "J1",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
    });

    assert.equal(assessment.isDissipative, false);
    assert.equal(assessment.checks.length, 1);
    assert.equal(assessment.checks[0].check, "capacity-design-not-applicable");
    assert.equal(assessment.checks[0].ok, true);
});

test("createCapacityDesignAssessment: includes references", () => {
    const assessment = createCapacityDesignAssessment({
        jointId: "J1",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.ok(Array.isArray(assessment.references));
    assert.ok(assessment.references.length > 0);
});

test("createCapacityDesignAssessment: partial inputs produce only relevant checks", () => {
    const assessment = createCapacityDesignAssessment({
        jointId: "J1",
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        hierarchy: {
            beamMomentResistancePositive: 100,
            beamMomentResistanceNegative: 80,
            columnMomentResistance: 250,
        },
    });

    // Only hierarchy check should be present (no beam/column/joint shear)
    assert.equal(assessment.checks.length, 1);
    assert.equal(assessment.checks[0].check, "capacity-design-beam-column-hierarchy");
});

// ---------------------------------------------------------------------------
// Catalog checks
// ---------------------------------------------------------------------------

test("capacity design references are frozen", () => {
    assert.equal(Object.isFrozen(NTC2018_CAPACITY_DESIGN_REFERENCES), true);
    assert.ok(NTC2018_CAPACITY_DESIGN_REFERENCES.length >= 2);
});
