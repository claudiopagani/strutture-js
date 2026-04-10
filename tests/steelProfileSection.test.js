import test from "node:test";
import assert from "node:assert/strict";

import {
  STEEL_PROFILE_FAMILIES,
  SteelProfileSection,
  createSteelProfileSection,
  getSteelProfileSectionData,
  listSteelProfileSectionsByFamily,
} from "../src/index.js";

test("creates a steel profile section from the integrated database", () => {
  const section = createSteelProfileSection({
    profileName: "IPE300",
  });

  assert.ok(section instanceof SteelProfileSection);
  assert.equal(section.area, 0.0053809999999999995);
  assert.equal(section.inertiaY, 8.355999999999999e-05);
  assert.equal(section.inertiaZ, 6.038e-06);
  assert.equal(section.family, "IPE");
  assert.equal(section.massPerLength, 42.2);
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
    () => createSteelProfileSection({ profileName: "XYZ999" }),
    /Unsupported steel profile section/,
  );
});
