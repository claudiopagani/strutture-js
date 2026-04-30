import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_CATALOG,
  ApplicationRegistry,
  CalculationResult,
  RESULT_STATUS,
  RESULT_STATUS_VALUES,
  StructuralApplication,
  VerificationResult,
  createDefaultApplicationRegistry,
  isResultStatus,
} from "../../src/index.js";
import {
  NTC2018ExistingMasonryMaterial,
  NTC2018SlabLoadAnalysis,
} from "../../src/norms/ntc2018/index.js";

test("default application registry exposes all scaffolded structural applications", () => {
  const registry = createDefaultApplicationRegistry();
  const registryIds = registry.list().map((application) => application.id);
  const catalogIds = APPLICATION_CATALOG.map((application) => application.id);

  assert.ok(registry instanceof ApplicationRegistry);
  assert.equal(registry.list().length, 13);
  assert.equal(APPLICATION_CATALOG.length, 13);
  assert.deepEqual(registryIds, catalogIds);
  assert.ok(registry.has("single-beam-design"));
  assert.ok(registry.has("steel-frames"));
  assert.ok(registry.has("masonry-piers"));
  assert.ok(registry.has("masonry-wall-openings"));
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
  assert.equal(result.status, RESULT_STATUS.NOT_IMPLEMENTED);
  assert.equal(result.outputs.beamId, "beam-01");
});

test("application registry rejects duplicate application ids", () => {
  const first = new StructuralApplication({ id: "demo", name: "Demo" });
  const duplicate = new StructuralApplication({ id: "demo", name: "Demo duplicate" });
  const registry = new ApplicationRegistry([first]);

  assert.throws(
    () => registry.register(duplicate),
    /already registered/,
  );
});

test("base structural application can build placeholder results", () => {
  const application = new StructuralApplication({
    id: "demo",
    name: "Demo",
    supportedCodes: ["NTC2018"],
  });

  const result = application.run();

  assert.equal(result.applicationId, "demo");
  assert.equal(result.status, RESULT_STATUS.NOT_IMPLEMENTED);
});

test("calculation result uses centralized status constants", () => {
  const result = new CalculationResult({
    applicationId: "demo",
    status: RESULT_STATUS.OK,
  });
  const placeholder = new CalculationResult({ applicationId: "demo" });

  assert.equal(result.isSuccessful(), true);
  assert.equal(placeholder.status, RESULT_STATUS.NOT_IMPLEMENTED);
  assert.deepEqual(RESULT_STATUS_VALUES, [
    "ok",
    "not-verified",
    "not-supported",
    "not-analyzed",
    "not-implemented",
    "failed",
  ]);
  assert.equal(isResultStatus(RESULT_STATUS.NOT_SUPPORTED), true);
  assert.equal(isResultStatus("error"), false);
  assert.throws(
    () =>
      new CalculationResult({
        applicationId: "demo",
        status: "error",
      }),
    /Unsupported result status/,
  );
});

test("verification result status participates in isVerified", () => {
  const ok = new VerificationResult({
    applicationId: "demo",
    status: RESULT_STATUS.OK,
    utilizationRatio: 0.7,
  });
  const notImplemented = new VerificationResult({
    applicationId: "demo",
    status: RESULT_STATUS.NOT_IMPLEMENTED,
    utilizationRatio: 0.7,
  });
  const failedCheck = new VerificationResult({
    applicationId: "demo",
    status: RESULT_STATUS.OK,
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
