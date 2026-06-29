import test from "node:test";
import assert from "node:assert/strict";

import {
  STEEL_PROFILE_FAMILIES,
  SteelProfileSection,
  createSteelProfileSection,
  getSteelProfileSectionData,
  listSteelProfileSectionsByFamily,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const approx = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("creates a steel profile section from the integrated database", () => {
  const section = createSteelProfileSection({
    profileName: "IPE300",
    units,
  });

  assert.ok(section instanceof SteelProfileSection);
  approx(section.area, 5380.999999999999);
  approx(section.inertiaY, 83559999.99999999);
  approx(section.inertiaZ, 6038000);
  assert.ok(section.inertiaY > section.inertiaZ);
  assert.ok(section.catalogProperties.Iy > section.catalogProperties.Iz);
  assert.ok(section.catalogProperties.Wel_y > section.catalogProperties.Wel_z);
  assert.equal(section.family, "IPE");
  assert.equal(section.massPerLength, 42.2);
  assert.deepEqual(section.metadata.catalogUnitSystem, { force: "N", length: "m" });
  assert.ok(section.convertedCatalogProperties.Wel_y > section.catalogProperties.Wel_y);
});

test("steel profile catalog values are converted independently from user units", () => {
  const metricSection = createSteelProfileSection({
    profileName: "IPE300",
    units,
  });
  const internalSection = createSteelProfileSection({
    profileName: "IPE300",
    units: { force: "N", length: "mm" },
  });

  approx(internalSection.area, metricSection.area);
  approx(internalSection.inertiaY, metricSection.inertiaY);
  approx(internalSection.elasticSectionModulusY, metricSection.elasticSectionModulusY);
});

test("steel profile override warping constant is converted from source units", () => {
  const section = createSteelProfileSection({
    profileName: "IPE300",
    units,
    warpingConstant: 2e-6,
  });

  approx(section.warpingConstant, 2e12, 1e-3);
});

test("catalog helpers expose integrated families and profile lookup", () => {
  assert.ok(STEEL_PROFILE_FAMILIES.includes("IPE"));
  assert.deepEqual(listSteelProfileSectionsByFamily("HEA").slice(0, 3), [
    "HEA100",
    "HEA1000",
    "HEA120",
  ]);
  assert.equal(getSteelProfileSectionData("UPN200").family, "UPN");
});

test("catalog includes extended European steel profile families", () => {
  const expectedFamilies = ["CHS", "SHS", "RHS", "L", "LU", "T", "FLAT", "ROUND"];

  for (const family of expectedFamilies) {
    assert.ok(STEEL_PROFILE_FAMILIES.includes(family));
    assert.ok(listSteelProfileSectionsByFamily(family).length > 0);
  }

  const profileNames = [
    "CHS114.3X5",
    "SHS100X100X5",
    "RHS200X100X6.3",
    "L60X60X6",
    "LU100X75X8",
    "T100X100X11",
    "FL100X10",
    "RD40",
  ];

  for (const profileName of profileNames) {
    const section = createSteelProfileSection({ profileName, units });

    assert.ok(section.area > 0, `${profileName} area`);
    assert.ok(section.inertiaY > 0, `${profileName} Iy`);
    assert.ok(section.inertiaZ > 0, `${profileName} Iz`);
    assert.ok(section.massPerLength > 0, `${profileName} mass`);
    assert.equal(section.metadata.catalogUnitSystem.length, "m");
    assert.ok(section.convertedCatalogProperties.A > section.catalogProperties.A);
  }
});

test("throws on unknown steel profile", () => {
  assert.throws(
    () => createSteelProfileSection({ profileName: "XYZ999", units }),
    /Unsupported steel profile section/,
  );
});
