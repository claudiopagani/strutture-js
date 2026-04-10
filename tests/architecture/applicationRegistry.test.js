import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_CATALOG,
  ApplicationRegistry,
  StructuralApplication,
  createDefaultApplicationRegistry,
} from "../../src/index.js";

test("default application registry exposes all scaffolded structural applications", () => {
  const registry = createDefaultApplicationRegistry();

  assert.ok(registry instanceof ApplicationRegistry);
  assert.equal(registry.list().length, 10);
  assert.equal(APPLICATION_CATALOG.length, 10);
  assert.ok(registry.has("steel-frames"));
  assert.ok(registry.has("micropiles-broms"));
  assert.ok(registry.has("timber-concrete-composite-beams"));
  assert.ok(registry.has("timber-xlam-composite-beams"));
  assert.ok(registry.has("xlam-panels-out-of-plane"));
});

test("application registry returns manifests and placeholder results", () => {
  const registry = createDefaultApplicationRegistry();
  const manifests = registry.listManifests();
  const result = registry.run("timber-beams", {
    model: { id: "beam-01" },
  });

  assert.equal(manifests[0].metadata.maturity, "scaffolded");
  assert.equal(result.status, "not-implemented");
  assert.equal(result.outputs.beamId, "beam-01");
});

test("base structural application can build placeholder results", () => {
  const application = new StructuralApplication({
    id: "demo",
    name: "Demo",
    supportedCodes: ["NTC2018"],
  });

  const result = application.run();

  assert.equal(result.applicationId, "demo");
  assert.equal(result.status, "not-implemented");
});
