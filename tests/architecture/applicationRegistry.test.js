import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_CATALOG,
  ApplicationRegistry,
  StructuralApplication,
  VerificationResult,
  createDefaultApplicationRegistry,
} from "../../src/index.js";
import {
  NTC2018ExistingMasonryMaterial,
  NTC2018SlabLoadAnalysis,
} from "../../src/norms/ntc2018/index.js";

test("default application registry exposes all scaffolded structural applications", () => {
  const registry = createDefaultApplicationRegistry();

  assert.ok(registry instanceof ApplicationRegistry);
  assert.equal(registry.list().length, 11);
  assert.equal(APPLICATION_CATALOG.length, 11);
  assert.ok(registry.has("single-beam-design"));
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

  assert.ok(manifests.some((manifest) => manifest.metadata.maturity === "scaffolded"));
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

test("verification result status participates in isVerified", () => {
  const ok = new VerificationResult({
    applicationId: "demo",
    status: "ok",
    utilizationRatio: 0.7,
  });
  const notImplemented = new VerificationResult({
    applicationId: "demo",
    status: "not-implemented",
    utilizationRatio: 0.7,
  });
  const failedCheck = new VerificationResult({
    applicationId: "demo",
    status: "ok",
    utilizationRatio: 0.7,
    checks: [{ id: "check", ok: false, utilizationRatio: 0.7 }],
  });

  assert.equal(ok.isVerified(), true);
  assert.equal(notImplemented.isVerified(), false);
  assert.equal(failedCheck.isVerified(), false);
});

test("ntc2018 boundary exposes normative domain adapters", () => {
  assert.equal(typeof NTC2018ExistingMasonryMaterial, "function");
  assert.equal(typeof NTC2018SlabLoadAnalysis, "function");
});
