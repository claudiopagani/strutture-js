import test from "node:test";
import assert from "node:assert/strict";

import {
    DM522023_COLUMN_MAX_HOOP_SPACING,
    DM522023_COLUMN_MIN_HOOP_DIAMETER,
    DM522023_COLUMN_MIN_LONGITUDINAL_RATIO,
    DM522023_COLUMN_MAX_LONGITUDINAL_RATIO,
    DM522023_MATERIAL_PARTIAL_FACTORS,
    DM522023_REFERENCES,
    DM522023_REINFORCEMENT_STEEL_GRADES,
    applyDM522023SteelGrades,
    computeDM522023ConfinementOmegaWd,
    selectDM522023PartialFactor,
} from "../src/index.js";

test("DM 52/2023 references are frozen", () => {
    assert.equal(Object.isFrozen(DM522023_REFERENCES), true);
});

test("DM 52/2023 adds B600 steel grade", () => {
    assert.ok("B600" in DM522023_REINFORCEMENT_STEEL_GRADES);
    assert.equal(DM522023_REINFORCEMENT_STEEL_GRADES.B600.fyk, 600);
    assert.equal(DM522023_REINFORCEMENT_STEEL_GRADES.B600.ftk, 720);
});

test("applyDM522023SteelGrades merges without mutation", () => {
    const base = Object.freeze({ B450C: { fyk: 450, ftk: 540 } });
    const merged = applyDM522023SteelGrades(base);
    assert.ok("B600" in merged);
    assert.equal(merged.B600.fyk, 600);
    assert.equal(Object.isFrozen(merged), true);
});

test("selectDM522023PartialFactor: concrete persistent", () => {
    const gamma = selectDM522023PartialFactor({
        material: "concrete",
        designSituation: "persistent",
    });
    assert.equal(gamma, 1.5);
});

test("selectDM522023PartialFactor: reinforcement seismic", () => {
    const gamma = selectDM522023PartialFactor({
        material: "reinforcement",
        designSituation: "seismic",
    });
    assert.equal(gamma, 1.0);
});

test("selectDM522023PartialFactor: concrete accidental", () => {
    const gamma = selectDM522023PartialFactor({
        material: "concrete",
        designSituation: "accidental",
    });
    assert.equal(gamma, 1.2);
});

test("selectDM522023PartialFactor: base NTC 2018 with useDM522023=false", () => {
    const gamma = selectDM522023PartialFactor({
        material: "concrete",
        useDM522023: false,
    });
    assert.equal(gamma, 1.5);
});

test("DM522023 material partial factors catalog", () => {
    assert.equal(DM522023_MATERIAL_PARTIAL_FACTORS.concrete.gammaC, 1.5);
    assert.equal(DM522023_MATERIAL_PARTIAL_FACTORS.reinforcement.gammaS, 1.15);
});

test("DM522023 column longitudinal ratios", () => {
    assert.equal(DM522023_COLUMN_MIN_LONGITUDINAL_RATIO["cd-a"], 0.01);
    assert.equal(DM522023_COLUMN_MIN_LONGITUDINAL_RATIO["non-dissipative"], 0.008);
    assert.equal(DM522023_COLUMN_MAX_LONGITUDINAL_RATIO, 0.04);
});

test("DM522023 column hoop diameter", () => {
    assert.equal(DM522023_COLUMN_MIN_HOOP_DIAMETER["cd-a"], 8);
    assert.equal(DM522023_COLUMN_MIN_HOOP_DIAMETER["cd-b"], 6);
});

test("DM522023 column hoop spacing", () => {
    assert.equal(DM522023_COLUMN_MAX_HOOP_SPACING["cd-a"].absoluteMax, 175);
    assert.equal(DM522023_COLUMN_MAX_HOOP_SPACING["cd-b"].absoluteMax, 225);
});

test("computeDM522023ConfinementOmegaWd: CD\"A\" with low nu", () => {
    const result = computeDM522023ConfinementOmegaWd({
        behavior: "cd-a",
        normalizedAxialForce: 0.15,
    });
    // computed = 30 * 9 * 0.15 * 0.002 - 0.035 = 0.081 - 0.035 = 0.046
    // max(0.08, 0.046) = 0.08
    assert.ok(result.omegaWd >= 0.08);
});

test("computeDM522023ConfinementOmegaWd: CD\"B\"", () => {
    const result = computeDM522023ConfinementOmegaWd({
        behavior: "cd-b",
        normalizedAxialForce: 0.3,
    });
    // max(0.04, 0.08 * 0.3) = max(0.04, 0.024) = 0.04
    assert.equal(result.omegaWd, 0.04);
});

test("computeDM522023ConfinementOmegaWd: non-dissipative returns zero", () => {
    const result = computeDM522023ConfinementOmegaWd({
        behavior: "non-dissipative",
        normalizedAxialForce: 0.5,
    });
    assert.equal(result.omegaWd, 0);
});
