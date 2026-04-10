import test from "node:test";
import assert from "node:assert/strict";

import {
  GlulamTimberMaterial,
  NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES,
  NTC2018_SOLID_TIMBER_STRENGTH_CLASSES,
  SolidTimberMaterial,
  TimberMaterial,
  createNTC2018TimberMaterial,
} from "../src/index.js";

const units = { force: "N", length: "mm" };

test("creates solid timber subclasses for C classes", () => {
  const material = createNTC2018TimberMaterial({
    strengthClass: "C24",
    units,
  });

  assert.ok(material instanceof TimberMaterial);
  assert.ok(material instanceof SolidTimberMaterial);
  assert.equal(material.timberType, "solid-timber");
  assert.equal(material.strengthStandard, "EN 338");
  assert.equal(material.productStandard, "EN 14081");
  assert.equal(material.fmK, 24);
});

test("creates glulam subclasses for GL homogeneous and combined classes", () => {
  const homogeneous = createNTC2018TimberMaterial({
    strengthClass: "GL24h",
    units,
  });
  const combined = createNTC2018TimberMaterial({
    strengthClass: "GL24c",
    units,
  });

  assert.ok(homogeneous instanceof GlulamTimberMaterial);
  assert.equal(homogeneous.glulamType, "homogeneous");
  assert.ok(combined instanceof GlulamTimberMaterial);
  assert.equal(combined.glulamType, "combined");
  assert.equal(combined.productStandard, "EN 14080");
});

test("exports separate solid and glulam timber catalogs", () => {
  assert.ok("C30" in NTC2018_SOLID_TIMBER_STRENGTH_CLASSES);
  assert.ok("GL28h" in NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES);
  assert.ok("GL32c" in NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES);
});
