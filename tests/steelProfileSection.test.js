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

test("catalog helpers expose integrated families and profile lookup", () => {
  assert.ok(STEEL_PROFILE_FAMILIES.includes("IPE"));
  assert.deepEqual(listSteelProfileSectionsByFamily("HEA").slice(0, 3), [
    "HEA100",
    "HEA1000",
    "HEA120",
  ]);
  assert.equal(getSteelProfileSectionData("UPN200").family, "UPN");
});

test("throws on unknown steel profile", () => {
  assert.throws(
    () => createSteelProfileSection({ profileName: "XYZ999", units }),
    /Unsupported steel profile section/,
  );
});
