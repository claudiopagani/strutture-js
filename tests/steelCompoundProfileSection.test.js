import test from "node:test";
import assert from "node:assert/strict";

import {
  SteelCompoundProfileSection,
  createDoubleAngleOpposedSection,
  createDoubleUPNBackToBackSection,
  createSteelCompoundProfileSection,
  createSteelProfileSection,
} from "../src/index.js";

const units = { force: "kN", length: "m" };
const approx = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("creates a double UPN back-to-back compound section", () => {
  const base = createSteelProfileSection({
    profileName: "UPN200",
    units,
  });
  const compound = createDoubleUPNBackToBackSection({
    profileName: "UPN200",
    gap: 0.02,
    units,
  });

  assert.ok(compound instanceof SteelCompoundProfileSection);
  assert.equal(compound.family, "COMPOUND");
  assert.equal(compound.metadata.layout, "double-upn-back-to-back");
  approx(compound.area, 2 * base.area);
  approx(compound.height, base.height);
  approx(compound.width, 2 * base.width + 20);
  approx(compound.centroidY, 0);
  approx(compound.centroidZ, 0);
  approx(compound.inertiaY, 2 * base.inertiaY, 1e-3);
  assert.ok(compound.inertiaZ > 2 * base.inertiaZ);
  assert.ok(compound.elasticSectionModulusY > 0);
  assert.ok(compound.elasticSectionModulusZ > 0);
  assert.equal(compound.components.length, 2);
  assert.ok(compound.getComponent("left-channel").mirrorZ);
});

test("creates opposed double angle section from a catalog L profile", () => {
  const base = createSteelProfileSection({
    profileName: "L60X60X6",
    units,
  });
  const compound = createDoubleAngleOpposedSection({
    profileName: "L60X60X6",
    units,
  });

  assert.equal(compound.metadata.layout, "double-angle-opposed");
  approx(compound.area, 2 * base.area);
  approx(compound.centroidY, 0);
  approx(compound.centroidZ, 0);
  approx(compound.height, 2 * base.height);
  approx(compound.width, 2 * base.width);
  assert.ok(compound.inertiaY > base.inertiaY);
  assert.ok(compound.inertiaZ > base.inertiaZ);
  assert.equal(compound.components.length, 2);
  assert.ok(compound.getComponent("opposed-angle").mirrorY);
  assert.ok(compound.getComponent("opposed-angle").mirrorZ);
});

test("creates generic compound steel profile sections with transformed components", () => {
  const base = createSteelProfileSection({
    profileName: "SHS100X100X5",
    units,
  });
  const compound = createSteelCompoundProfileSection({
    name: "Two shifted SHS",
    units: { force: "N", length: "mm" },
    components: [
      {
        section: base,
        centroidY: -75,
        centroidZ: 0,
        role: "bottom",
      },
      {
        section: base,
        centroidY: 75,
        centroidZ: 0,
        rotation: 90,
        rotationUnits: "deg",
        role: "top",
      },
    ],
  });

  approx(compound.area, 2 * base.area);
  approx(compound.centroidY, 0);
  approx(compound.centroidZ, 0);
  assert.ok(compound.inertiaY > 2 * base.inertiaY);
  approx(compound.inertiaZ, 2 * base.inertiaZ, 1e-3);
  assert.equal(compound.metadata.componentCount, 2);
});

test("compound helpers reject incompatible base profile families", () => {
  assert.throws(
    () =>
      createDoubleUPNBackToBackSection({
        profileName: "IPE200",
        gap: 0,
        units,
      }),
    /requires a UPN profile/,
  );
  assert.throws(
    () =>
      createDoubleAngleOpposedSection({
        profileName: "UPN200",
        units,
      }),
    /requires an L or LU profile/,
  );
});
