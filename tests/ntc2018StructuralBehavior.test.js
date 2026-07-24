import test from "node:test";
import assert from "node:assert/strict";

import {
    NTC2018_ANALYSIS_METHOD,
    NTC2018_BASE_Q_FACTORS,
    NTC2018_DEFAULT_FRAME_ALPHA_RATIO,
    NTC2018_DEFAULT_WALL_ALPHA_RATIO,
    NTC2018_ELEVATION_REGULARITY,
    NTC2018_OVERSTRENGTH_FACTORS,
    NTC2018_PLAN_REGULARITY,
    NTC2018_REGULARITY_REDUCTION,
    NTC2018_STRUCTURAL_BEHAVIOR,
    NTC2018_STRUCTURAL_BEHAVIOR_REFERENCES,
    NTC2018_STRUCTURAL_TYPE,
    checkNonDissipativeAdmissibility,
    computeNTC2018EffectiveQFactor,
    createNTC2018StructuralBehavior,
    normalizeNTC2018StructuralBehavior,
    normalizeNTC2018StructuralType,
    selectNTC2018AllowedAnalysisMethods,
    selectNTC2018BaseQFactor,
    selectNTC2018OverstrengthFactors,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Catalogs are frozen
// ---------------------------------------------------------------------------

test("structural behavior catalogs are frozen", () => {
    assert.equal(Object.isFrozen(NTC2018_STRUCTURAL_BEHAVIOR), true);
    assert.equal(Object.isFrozen(NTC2018_STRUCTURAL_TYPE), true);
    assert.equal(Object.isFrozen(NTC2018_PLAN_REGULARITY), true);
    assert.equal(Object.isFrozen(NTC2018_ELEVATION_REGULARITY), true);
    assert.equal(Object.isFrozen(NTC2018_ANALYSIS_METHOD), true);
    assert.equal(Object.isFrozen(NTC2018_OVERSTRENGTH_FACTORS), true);
    assert.equal(Object.isFrozen(NTC2018_REGULARITY_REDUCTION), true);
    assert.equal(Object.isFrozen(NTC2018_BASE_Q_FACTORS), true);
});

// ---------------------------------------------------------------------------
// normalizeNTC2018StructuralBehavior
// ---------------------------------------------------------------------------

test("normalizeNTC2018StructuralBehavior accepts valid values", () => {
    assert.equal(
        normalizeNTC2018StructuralBehavior("non-dissipative"),
        "non-dissipative",
    );
    assert.equal(normalizeNTC2018StructuralBehavior("cd-a"), "cd-a");
    assert.equal(normalizeNTC2018StructuralBehavior("cd-b"), "cd-b");
    assert.equal(normalizeNTC2018StructuralBehavior("CD-A"), "cd-a");
    assert.equal(normalizeNTC2018StructuralBehavior("CD\"A\""), "cd-a");
    assert.equal(normalizeNTC2018StructuralBehavior("  cd-b  "), "cd-b");
});

test("normalizeNTC2018StructuralBehavior rejects invalid values", () => {
    assert.throws(
        () => normalizeNTC2018StructuralBehavior("cd-c"),
        /structuralBehavior/,
    );
    assert.throws(
        () => normalizeNTC2018StructuralBehavior(""),
        /structuralBehavior/,
    );
    assert.throws(
        () => normalizeNTC2018StructuralBehavior(),
        /structuralBehavior/,
    );
});

// ---------------------------------------------------------------------------
// normalizeNTC2018StructuralType
// ---------------------------------------------------------------------------

test("normalizeNTC2018StructuralType accepts valid values", () => {
    assert.equal(normalizeNTC2018StructuralType("frame"), "frame");
    assert.equal(normalizeNTC2018StructuralType("wall"), "wall");
    assert.equal(normalizeNTC2018StructuralType("coupled-wall"), "coupled-wall");
    assert.equal(normalizeNTC2018StructuralType("dual"), "dual");
    assert.equal(normalizeNTC2018StructuralType("core"), "core");
    assert.equal(
        normalizeNTC2018StructuralType("inverted-pendulum"),
        "inverted-pendulum",
    );
    assert.equal(normalizeNTC2018StructuralType("FRAME"), "frame");
});

test("normalizeNTC2018StructuralType rejects invalid values", () => {
    assert.throws(
        () => normalizeNTC2018StructuralType("truss"),
        /structuralType/,
    );
});

// ---------------------------------------------------------------------------
// checkNonDissipativeAdmissibility
// ---------------------------------------------------------------------------

test("non-dissipative admissible in zone 3", () => {
    const result = checkNonDissipativeAdmissibility({ seismicZone: 3 });
    assert.equal(result.admissible, true);
});

test("non-dissipative admissible in zone 4", () => {
    const result = checkNonDissipativeAdmissibility({ seismicZone: 4 });
    assert.equal(result.admissible, true);
});

test("non-dissipative not admissible in zone 2 with ag >= 0.075g", () => {
    const result = checkNonDissipativeAdmissibility({
        seismicZone: 2,
        ag: 0.15,
    });
    assert.equal(result.admissible, false);
});

test("non-dissipative admissible with ag < 0.075g", () => {
    const result = checkNonDissipativeAdmissibility({ ag: 0.05 });
    assert.equal(result.admissible, true);
});

test("non-dissipative with insufficient data returns admissible with warning", () => {
    const result = checkNonDissipativeAdmissibility({});
    assert.equal(result.admissible, true);
    assert.ok(result.warning);
});

test("checkNonDissipativeAdmissibility rejects invalid zone", () => {
    assert.throws(
        () => checkNonDissipativeAdmissibility({ seismicZone: 5 }),
    );
    assert.throws(
        () => checkNonDissipativeAdmissibility({ seismicZone: 0 }),
    );
});

test("checkNonDissipativeAdmissibility rejects negative ag", () => {
    assert.throws(
        () => checkNonDissipativeAdmissibility({ ag: -0.1 }),
    );
});

// ---------------------------------------------------------------------------
// selectNTC2018OverstrengthFactors
// ---------------------------------------------------------------------------

test("selectNTC2018OverstrengthFactors returns correct values for CD\"A\"", () => {
    const factors = selectNTC2018OverstrengthFactors({ behavior: "cd-a" });
    // Tab. 7.2.I (cast-in-place RC), by mechanism
    assert.equal(factors.beamShear, 1.20);
    assert.equal(factors.columnBending, 1.30);
    assert.equal(factors.columnShear, 1.30);
    assert.equal(factors.jointShear, 1.20);
    assert.equal(factors.wallShear, 1.20);
});

test("selectNTC2018OverstrengthFactors returns correct values for CD\"B\"", () => {
    const factors = selectNTC2018OverstrengthFactors({ behavior: "cd-b" });
    // Tab. 7.2.I (cast-in-place RC), by mechanism; wallShear is "—" → null
    assert.equal(factors.beamShear, 1.10);
    assert.equal(factors.columnBending, 1.30);
    assert.equal(factors.columnShear, 1.10);
    assert.equal(factors.jointShear, 1.10);
    assert.equal(factors.wallShear, null);
});

test("selectNTC2018OverstrengthFactors returns 1.0 for non-dissipative", () => {
    const factors = selectNTC2018OverstrengthFactors({
        behavior: "non-dissipative",
    });
    assert.equal(factors.beamShear, 1.0);
    assert.equal(factors.columnBending, 1.0);
    assert.equal(factors.columnShear, 1.0);
    assert.equal(factors.jointShear, 1.0);
    assert.equal(factors.wallShear, 1.0);
});

test("selectNTC2018OverstrengthFactors result is frozen", () => {
    const factors = selectNTC2018OverstrengthFactors({ behavior: "cd-a" });
    assert.equal(Object.isFrozen(factors), true);
});

// ---------------------------------------------------------------------------
// selectNTC2018BaseQFactor
// ---------------------------------------------------------------------------

test("selectNTC2018BaseQFactor for CD\"A\" frame with default alpha", () => {
    const q0 = selectNTC2018BaseQFactor({
        behavior: "cd-a",
        structuralType: "frame",
    });
    // q0 = 4.5 * 1.3 = 5.85
    assert.ok(Math.abs(q0 - 5.85) < 1e-9);
});

test("selectNTC2018BaseQFactor for CD\"B\" wall (no alpha multiplier)", () => {
    const q0 = selectNTC2018BaseQFactor({
        behavior: "cd-b",
        structuralType: "wall",
    });
    assert.equal(q0, 3.0);
});

test("selectNTC2018BaseQFactor for CD\"A\" dual with default alpha", () => {
    const q0 = selectNTC2018BaseQFactor({
        behavior: "cd-a",
        structuralType: "dual",
    });
    // q0 = 4.5 * 1.3 = 5.85
    assert.ok(Math.abs(q0 - 5.85) < 1e-9);
});

test("selectNTC2018BaseQFactor with explicit alphaRatio", () => {
    const q0 = selectNTC2018BaseQFactor({
        behavior: "cd-a",
        structuralType: "frame",
        alphaRatio: 1.15,
    });
    // q0 = 4.5 * 1.15 = 5.175
    assert.ok(Math.abs(q0 - 5.175) < 1e-9);
});

test("selectNTC2018BaseQFactor for core (no alpha multiplier)", () => {
    const q0 = selectNTC2018BaseQFactor({
        behavior: "cd-a",
        structuralType: "core",
    });
    // Tab. 7.3.II CD"A": uncoupled walls/core q0 = 4.0 (no alpha_u/alpha_1)
    assert.equal(q0, 4.0);
});

test("selectNTC2018BaseQFactor for inverted pendulum (no alpha multiplier)", () => {
    const q0 = selectNTC2018BaseQFactor({
        behavior: "cd-b",
        structuralType: "inverted-pendulum",
    });
    assert.equal(q0, 1.5);
});

test("selectNTC2018BaseQFactor for non-dissipative returns 1.0", () => {
    const q0 = selectNTC2018BaseQFactor({
        behavior: "non-dissipative",
        structuralType: "frame",
    });
    assert.equal(q0, 1.0);
});

test("selectNTC2018BaseQFactor rejects invalid alphaRatio", () => {
    assert.throws(
        () =>
            selectNTC2018BaseQFactor({
                behavior: "cd-a",
                structuralType: "frame",
                alphaRatio: -1,
            }),
        /alphaRatio/,
    );
});

// ---------------------------------------------------------------------------
// computeNTC2018EffectiveQFactor
// ---------------------------------------------------------------------------

test("computeNTC2018EffectiveQFactor regular elevation", () => {
    const q = computeNTC2018EffectiveQFactor({
        behavior: "cd-a",
        structuralType: "frame",
        elevationRegularity: "regular",
    });
    // q0 = 4.5 * 1.3 = 5.85, kr = 1.0
    assert.ok(Math.abs(q - 5.85) < 1e-9);
});

test("computeNTC2018EffectiveQFactor non-regular elevation", () => {
    const q = computeNTC2018EffectiveQFactor({
        behavior: "cd-a",
        structuralType: "frame",
        elevationRegularity: "non-regular",
    });
    // q0 = 4.5 * 1.3 = 5.85, kr = 0.8 → q = 4.68
    assert.ok(Math.abs(q - 4.68) < 1e-9);
});

test("computeNTC2018EffectiveQFactor non-dissipative returns 1.0", () => {
    const q = computeNTC2018EffectiveQFactor({
        behavior: "non-dissipative",
        structuralType: "frame",
        elevationRegularity: "regular",
    });
    assert.equal(q, 1.0);
});

// ---------------------------------------------------------------------------
// selectNTC2018AllowedAnalysisMethods
// ---------------------------------------------------------------------------

test("selectNTC2018AllowedAnalysisMethods regular frame with T1 <= 2.5 TC", () => {
    const result = selectNTC2018AllowedAnalysisMethods({
        behavior: "cd-a",
        planRegularity: "regular",
        elevationRegularity: "regular",
        t1: 0.5,
        tc: 0.5,
    });
    assert.equal(result.linearStaticAllowed, true);
    assert.ok(result.allowed.includes(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC));
    assert.ok(result.allowed.includes(NTC2018_ANALYSIS_METHOD.LINEAR_DYNAMIC));
});

test("selectNTC2018AllowedAnalysisMethods regular frame with T1 > 2.5 TC", () => {
    const result = selectNTC2018AllowedAnalysisMethods({
        behavior: "cd-a",
        planRegularity: "regular",
        elevationRegularity: "regular",
        t1: 2.0,
        tc: 0.5,
    });
    // 2.5 * 0.5 = 1.25, T1 = 2.0 > 1.25 → linear static NOT allowed
    assert.equal(result.linearStaticAllowed, false);
    assert.ok(!result.allowed.includes(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC));
    assert.ok(result.allowed.includes(NTC2018_ANALYSIS_METHOD.LINEAR_DYNAMIC));
});

test("selectNTC2018AllowedAnalysisMethods non-regular elevation blocks linear static", () => {
    const result = selectNTC2018AllowedAnalysisMethods({
        behavior: "cd-a",
        planRegularity: "regular",
        elevationRegularity: "non-regular",
        t1: 0.3,
        tc: 0.5,
    });
    assert.equal(result.linearStaticAllowed, false);
    assert.ok(!result.allowed.includes(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC));
});

test("selectNTC2018AllowedAnalysisMethods non-dissipative allows linear static", () => {
    const result = selectNTC2018AllowedAnalysisMethods({
        behavior: "non-dissipative",
        planRegularity: "regular",
        elevationRegularity: "regular",
    });
    assert.equal(result.linearStaticAllowed, true);
    assert.ok(result.allowed.includes(NTC2018_ANALYSIS_METHOD.LINEAR_STATIC));
});

test("selectNTC2018AllowedAnalysisMethods with td", () => {
    // TD = 2.0, 2.5*TC = 1.25, min(2.5*TC, TD) = 1.25
    const result = selectNTC2018AllowedAnalysisMethods({
        behavior: "cd-b",
        planRegularity: "regular",
        elevationRegularity: "regular",
        t1: 1.0,
        tc: 0.5,
        td: 0.8,
    });
    // limit = min(2.5*0.5, 0.8) = min(1.25, 0.8) = 0.8, T1 = 1.0 > 0.8
    assert.equal(result.linearStaticAllowed, false);
});

test("selectNTC2018AllowedAnalysisMethods without t1 returns provisional", () => {
    const result = selectNTC2018AllowedAnalysisMethods({
        behavior: "cd-a",
        planRegularity: "regular",
        elevationRegularity: "regular",
    });
    assert.equal(result.linearStaticAllowed, true);
    assert.ok(result.checks.some((c) => c.warning));
});

// ---------------------------------------------------------------------------
// createNTC2018StructuralBehavior
// ---------------------------------------------------------------------------

test("createNTC2018StructuralBehavior CD\"A\" frame regular", () => {
    const desc = createNTC2018StructuralBehavior({
        behavior: "cd-a",
        structuralType: "frame",
        regularity: { plan: "regular", elevation: "regular" },
    });

    assert.equal(desc.behavior, "cd-a");
    assert.equal(desc.structuralType, "frame");
    assert.equal(desc.isDissipative, true);
    assert.equal(desc.ductilityClass, 'CD"A"');
    assert.equal(desc.overstrengthFactors.beamShear, 1.20);
    assert.equal(desc.overstrengthFactors.columnBending, 1.30);
    assert.equal(desc.overstrengthFactors.jointShear, 1.20);
    assert.ok(Math.abs(desc.q0 - 5.85) < 1e-9);
    assert.ok(Math.abs(desc.q - 5.85) < 1e-9);
    assert.equal(desc.kr, 1.0);
});

test("createNTC2018StructuralBehavior CD\"B\" wall non-regular elevation", () => {
    const desc = createNTC2018StructuralBehavior({
        behavior: "cd-b",
        structuralType: "wall",
        regularity: { elevation: "non-regular" },
    });

    assert.equal(desc.behavior, "cd-b");
    assert.equal(desc.isDissipative, true);
    assert.equal(desc.ductilityClass, 'CD"B"');
    assert.equal(desc.overstrengthFactors.beamShear, 1.10);
    assert.equal(desc.overstrengthFactors.jointShear, 1.10);
    assert.equal(desc.q0, 3.0);
    assert.equal(desc.q, 3.0 * 0.8); // q0 * kr
    assert.equal(desc.kr, 0.8);
});

test("createNTC2018StructuralBehavior non-dissipative", () => {
    const desc = createNTC2018StructuralBehavior({
        behavior: "non-dissipative",
        structuralType: "frame",
    });

    assert.equal(desc.behavior, "non-dissipative");
    assert.equal(desc.isDissipative, false);
    assert.equal(desc.ductilityClass, null);
    assert.equal(desc.overstrengthFactors.beamShear, 1.0);
    assert.equal(desc.overstrengthFactors.columnBending, 1.0);
    assert.equal(desc.overstrengthFactors.jointShear, 1.0);
    assert.equal(desc.q0, 1.0);
    assert.equal(desc.q, 1.0);
    assert.equal(desc.kr, 1.0);
});

test("createNTC2018StructuralBehavior includes references", () => {
    const desc = createNTC2018StructuralBehavior({
        behavior: "cd-a",
        structuralType: "frame",
    });
    assert.ok(Array.isArray(desc.references));
    assert.ok(desc.references.length > 0);
});

// ---------------------------------------------------------------------------
// Known values: catalogs match Tab. 7.3.I-II and 7.4.I
// ---------------------------------------------------------------------------

test("Tab. 7.2.I overstrength factors are correct (by mechanism)", () => {
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-a"].beamShear, 1.20);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-a"].columnBending, 1.30);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-a"].columnShear, 1.30);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-a"].jointShear, 1.20);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-a"].wallShear, 1.20);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-b"].beamShear, 1.10);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-b"].columnBending, 1.30);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-b"].columnShear, 1.10);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-b"].jointShear, 1.10);
    assert.equal(NTC2018_OVERSTRENGTH_FACTORS["cd-b"].wallShear, null);
});

test("Tab. 7.3.II q0 CD\"B\" values are correct", () => {
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-b"].frame, 3.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-b"].wall, 3.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-b"]["coupled-wall"], 3.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-b"].dual, 3.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-b"].core, 3.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-b"]["torsionally-flexible"], 2.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-b"]["inverted-pendulum"], 1.5);
});

test("Tab. 7.3.II q0 CD\"A\" values are correct", () => {
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-a"].frame, 4.5);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-a"].wall, 4.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-a"]["coupled-wall"], 4.5);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-a"].dual, 4.5);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-a"].core, 4.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-a"]["torsionally-flexible"], 3.0);
    assert.equal(NTC2018_BASE_Q_FACTORS["cd-a"]["inverted-pendulum"], 2.0);
});

test("Default frame alpha ratio is 1.3 per § 7.3.2.1", () => {
    assert.equal(NTC2018_DEFAULT_FRAME_ALPHA_RATIO, 1.3);
});

test("Default wall alpha ratio is 1.0 per § 7.3.2.1", () => {
    assert.equal(NTC2018_DEFAULT_WALL_ALPHA_RATIO, 1.0);
});

test("Regularity reduction kr values per § 7.3.1", () => {
    assert.equal(NTC2018_REGULARITY_REDUCTION.regular, 1.0);
    assert.equal(NTC2018_REGULARITY_REDUCTION["non-regular"], 0.8);
});
