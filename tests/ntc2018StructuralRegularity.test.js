import test from "node:test";
import assert from "node:assert/strict";

import {
    NTC2018_ELEVATION_REGULARITY,
    NTC2018_PLAN_REGULARITY,
    NTC2018_REGULARITY_REDUCTION,
    NTC2018_REGULARITY_REFERENCES,
    NTC2018_STRUCTURAL_BEHAVIOR,
    createNTC2018RegularityAssessment,
    evaluateNTC2018ElevationRegularity,
    evaluateNTC2018PlanRegularity,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Plan regularity – evaluateNTC2018PlanRegularity
// ---------------------------------------------------------------------------

test("plan regularity: compact rectangular building is regular", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 15,
    });

    assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.REGULAR);
    assert.ok(result.slenderness <= 4);
    assert.equal(result.reentrantRatioX, null);
    assert.equal(result.reentrantRatioY, null);
});

test("plan regularity: slenderness exceeding 4 is non-regular", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 50,
        planLengthY: 10,
    });

    // Lmax/Lmin = 50/10 = 5 > 4
    assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
    assert.ok(result.slenderness > 4);
    assert.ok(
        result.checks.some(
            (c) => c.check === "plan-slenderness" && c.ok === false,
        ),
    );
});

test("plan regularity: re-entrant corners within limit are ok", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 15,
        maxReentrantX: 5, // 5/20 = 25%
        maxReentrantY: 3, // 3/15 = 20%
    });

    assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.REGULAR);
    assert.ok(result.reentrantRatioX <= 0.25);
    assert.ok(result.reentrantRatioY <= 0.25);
});

test("plan regularity: re-entrant corner exceeding 25% is non-regular", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 15,
        maxReentrantX: 7, // 7/20 = 35% > 25%
    });

    assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
    assert.ok(result.reentrantRatioX > 0.25);
});

test("plan regularity: eccentricity within 0.3 r is ok", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 15,
        eccentricityX: 1.5,
        torsionalRadiusX: 6.0, // 1.5/6.0 = 0.25 ≤ 0.3
    });

    assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.REGULAR);
    assert.ok(result.eccentricityRatioX <= 0.3);
});

test("plan regularity: eccentricity exceeding 0.3 r is non-regular", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 15,
        eccentricityX: 3.0,
        torsionalRadiusX: 6.0, // 3.0/6.0 = 0.5 > 0.3
    });

    assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
    assert.ok(result.eccentricityRatioX > 0.3);
});

test("plan regularity: non-rigid diaphragms cause non-regular", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 15,
        hasRigidDiaphragms: false,
    });

    assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
});

test("plan regularity: large floor openings cause non-regular", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 15,
        floorOpeningRatio: 0.40, // 40% > 25%
    });

    assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
});

test("plan regularity: all checks have references", () => {
    const result = evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 15,
        eccentricityX: 3.0,
        torsionalRadiusX: 6.0,
    });

    for (const check of result.checks) {
        assert.ok(check.reference, `Missing reference for check ${check.check}`);
    }
});

test("plan regularity: rejects non-positive dimensions", () => {
    assert.throws(
        () => evaluateNTC2018PlanRegularity({ planLengthX: 0, planLengthY: 10 }),
        /planLengthX/,
    );
    assert.throws(
        () => evaluateNTC2018PlanRegularity({ planLengthX: -5, planLengthY: 10 }),
        /planLengthX/,
    );
});

// ---------------------------------------------------------------------------
// Elevation regularity – evaluateNTC2018ElevationRegularity
// ---------------------------------------------------------------------------

function makeStoreys(...overrides) {
    return overrides.map((o, i) => ({
        storeyId: `S${i + 1}`,
        elevation: i * 3.0,
        height: 3.0,
        mass: 200,
        stiffnessX: 50000,
        stiffnessY: 50000,
        resistanceX: 800,
        resistanceY: 800,
        planLengthX: 20,
        planLengthY: 15,
        ...o,
    }));
}

test("elevation regularity: uniform building is regular", () => {
    const storeys = makeStoreys({}, {}, {}, {});
    const result = evaluateNTC2018ElevationRegularity({ storeys });

    assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.REGULAR);
    assert.equal(result.storeyDetails.length, 3); // 3 inter-storey comparisons
    // All inter-storey checks should pass
    for (const detail of result.storeyDetails) {
        for (const c of detail.checks) {
            assert.ok(c.ok, `${c.check} failed: ${c.detail}`);
        }
    }
});

test("elevation regularity: mass variation > 25% is non-regular", () => {
    const storeys = makeStoreys(
        { mass: 200 },
        { mass: 160 }, // 160/200 = 0.80, ok
        { mass: 100 }, // 100/160 = 0.625 < 0.75 → non-regular
        {},
    );
    const result = evaluateNTC2018ElevationRegularity({ storeys });

    assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
    assert.ok(
        result.storeyDetails.some((d) =>
            d.checks.some((c) => c.check === "elevation-mass-variation" && !c.ok),
        ),
    );
});

test("elevation regularity: resistance ratio < 0.8 is non-regular", () => {
    const storeys = makeStoreys(
        { resistanceX: 1000, resistanceY: 1000 },
        { resistanceX: 700, resistanceY: 700 }, // 700/1000 = 0.70 < 0.80
        {},
    );
    const result = evaluateNTC2018ElevationRegularity({ storeys });

    assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
    assert.ok(
        result.storeyDetails.some((d) =>
            d.checks.some((c) => c.check === "elevation-resistance-x" && !c.ok),
        ),
    );
});

test("elevation regularity: setback > 20% is non-regular", () => {
    const storeys = makeStoreys(
        {},
        { setbackX: 6, planLengthX: 20 }, // 6/20 = 30% > 20%
        {},
    );
    const result = evaluateNTC2018ElevationRegularity({ storeys });

    assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

test("elevation regularity: discontinuous vertical systems is non-regular", () => {
    const storeys = makeStoreys({}, {}, {});
    const result = evaluateNTC2018ElevationRegularity({
        storeys,
        continuousVerticalSystems: false,
    });

    assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

test("elevation regularity: inclined elements cause non-regular", () => {
    const storeys = makeStoreys({}, {}, {});
    const result = evaluateNTC2018ElevationRegularity({
        storeys,
        hasInclinedElements: true,
    });

    assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

test("elevation regularity: rejects fewer than 2 storeys", () => {
    assert.throws(
        () => evaluateNTC2018ElevationRegularity({ storeys: [makeStoreys({})[0]] }),
        /At least two storeys/,
    );
});

test("elevation regularity: all checks have references", () => {
    const storeys = makeStoreys({}, {}, {});
    const result = evaluateNTC2018ElevationRegularity({ storeys });

    for (const check of result.checks) {
        assert.ok(check.reference, `Missing reference for ${check.check}`);
    }
});

// ---------------------------------------------------------------------------
// createNTC2018RegularityAssessment
// ---------------------------------------------------------------------------

test("createNTC2018RegularityAssessment: full regular CD\"A\" frame", () => {
    const storeys = makeStoreys({}, {}, {}, {});

    const assessment = createNTC2018RegularityAssessment({
        planInput: { planLengthX: 20, planLengthY: 15 },
        elevationInput: { storeys },
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
        t1X: 0.5,
        t1Y: 0.5,
        tc: 0.5,
    });

    assert.equal(assessment.planRegularity, NTC2018_PLAN_REGULARITY.REGULAR);
    assert.equal(
        assessment.elevationRegularity,
        NTC2018_ELEVATION_REGULARITY.REGULAR,
    );
    assert.equal(assessment.reductionFactorKr, 1.0);
    assert.equal(assessment.analysisMethodsX.linearStaticAllowed, true);
    assert.equal(assessment.analysisMethodsY.linearStaticAllowed, true);
    assert.ok(Array.isArray(assessment.checks));
    assert.ok(assessment.checks.length > 0);
    assert.ok(Array.isArray(assessment.references));
});

test("createNTC2018RegularityAssessment: non-regular elevation gives kr=0.8", () => {
    const storeys = makeStoreys(
        { mass: 200 },
        { mass: 100 }, // 100/200 = 0.50 < 0.75 → non-regular
        {},
    );

    const assessment = createNTC2018RegularityAssessment({
        planInput: { planLengthX: 20, planLengthY: 15 },
        elevationInput: { storeys },
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_A,
    });

    assert.equal(
        assessment.elevationRegularity,
        NTC2018_ELEVATION_REGULARITY.NON_REGULAR,
    );
    assert.equal(assessment.reductionFactorKr, 0.8);
    // Linear static not allowed for non-regular elevation
    assert.equal(assessment.analysisMethodsX.linearStaticAllowed, false);
});

test("createNTC2018RegularityAssessment: planDetails present", () => {
    const storeys = makeStoreys({}, {});
    const assessment = createNTC2018RegularityAssessment({
        planInput: { planLengthX: 20, planLengthY: 15 },
        elevationInput: { storeys },
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
    });

    assert.equal(assessment.planDetails.slenderness, 20 / 15);
    assert.equal(assessment.planDetails.reentrantRatioX, null);
});

test("createNTC2018RegularityAssessment: elevationDetails present", () => {
    const storeys = makeStoreys({}, {}, {});
    const assessment = createNTC2018RegularityAssessment({
        planInput: { planLengthX: 20, planLengthY: 15 },
        elevationInput: { storeys },
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.CD_B,
    });

    assert.equal(assessment.elevationDetails.length, 2);
    assert.equal(assessment.elevationDetails[0].storeyId, "S2");
    assert.equal(assessment.elevationDetails[0].comparedTo, "S1");
});

test("createNTC2018RegularityAssessment: non-dissipative", () => {
    const storeys = makeStoreys({}, {});
    const assessment = createNTC2018RegularityAssessment({
        planInput: { planLengthX: 20, planLengthY: 15 },
        elevationInput: { storeys },
        behavior: NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE,
    });

    assert.equal(assessment.reductionFactorKr, 1.0);
    assert.equal(assessment.analysisMethodsX.linearStaticAllowed, true);
});

// ---------------------------------------------------------------------------
// Catalog checks
// ---------------------------------------------------------------------------

test("regularity references are frozen and complete", () => {
    assert.equal(Object.isFrozen(NTC2018_REGULARITY_REFERENCES), true);
    assert.ok(NTC2018_REGULARITY_REFERENCES.length >= 2);
});

test("kr values are correct", () => {
    assert.equal(NTC2018_REGULARITY_REDUCTION.regular, 1.0);
    assert.equal(NTC2018_REGULARITY_REDUCTION["non-regular"], 0.8);
});
