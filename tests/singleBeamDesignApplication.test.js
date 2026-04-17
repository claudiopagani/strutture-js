import test from "node:test";
import assert from "node:assert/strict";

import {
  BEAM_REPORT_SCHEMA_VERSION,
  SingleBeamDesignApplication,
  createBeamReportArtifacts,
  validateBeamReportDto,
} from "../src/index.js";
import {
  createBeamReportExampleModels,
  createRcElasticBeamReportModel,
  createRcAggressiveCrackReportModel,
  createSteelIpeBeamReportModel,
  createSteelUpnUserMcrReportModel,
  createTimberC24BeamReportModel,
  createXlamStripBeamReportModel,
} from "../examples/beam-report-fixtures.js";

test("single beam design application generates JSON and Markdown reports for timber", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createTimberC24BeamReportModel(),
  });
  const report = result.outputs.report;

  assert.equal(result.applicationId, "single-beam-design");
  assert.equal(result.status, "ok");
  assert.equal(report.json.schemaVersion, BEAM_REPORT_SCHEMA_VERSION);
  assert.deepEqual(validateBeamReportDto(report.json), {
    ok: true,
    schemaVersion: BEAM_REPORT_SCHEMA_VERSION,
    errors: [],
  });
  assert.equal(report.json.id, "timber-c24-report");
  assert.ok(report.json.analysis.combinationIds.includes("timber-c24-report-ULS-LIVE"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "timber-bending"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "timber-final-deflection"));
  assert.ok(report.json.analysis.envelopes.uls.maxAbsVerticalReaction);
  assert.ok(report.markdown.includes("# Trave in legno C24"));
  assert.ok(report.markdown.includes("## Rigidezze adottate"));
  assert.ok(report.markdown.includes("## Reazioni governanti"));
  assert.doesNotThrow(() => JSON.stringify(report.json));
});

test("single beam design reports expose frontend-ready file artifacts", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createTimberC24BeamReportModel(),
  });
  const artifacts = createBeamReportArtifacts(result.outputs.report);
  const jsonArtifact = artifacts.find((artifact) => artifact.format === "json");
  const markdownArtifact = artifacts.find((artifact) => artifact.format === "markdown");

  assert.equal(artifacts.length, 2);
  assert.equal(jsonArtifact.fileName, "timber-c24-report.json");
  assert.equal(markdownArtifact.fileName, "timber-c24-report.md");
  assert.equal(JSON.parse(jsonArtifact.content).id, "timber-c24-report");
  assert.equal(jsonArtifact.metadata.schemaVersion, BEAM_REPORT_SCHEMA_VERSION);
  assert.equal(markdownArtifact.metadata.schemaVersion, BEAM_REPORT_SCHEMA_VERSION);
  assert.ok(markdownArtifact.content.includes("# Trave in legno C24"));
  assert.equal(jsonArtifact.mediaType, "application/json");
  assert.equal(markdownArtifact.mediaType, "text/markdown");
});

test("single beam design reports expose section rotation and principal actions", () => {
  const model = createTimberC24BeamReportModel();
  model.beamInput.sectionRotation = {
    alpha: 15,
    units: "deg",
  };

  const result = new SingleBeamDesignApplication().run({ model });
  const report = result.outputs.report;
  const principalEnvelopes = report.json.analysis.principalActionEnvelopes.uls;

  assert.deepEqual(validateBeamReportDto(report.json), {
    ok: true,
    schemaVersion: BEAM_REPORT_SCHEMA_VERSION,
    errors: [],
  });
  assert.equal(report.json.model.beamInput.sectionRotation.alpha, 15);
  assert.equal(report.json.analysis.sectionRotation.inputUnits, "deg");
  assert.ok(
    Math.abs(report.json.analysis.sectionRotation.alpha - Math.PI / 12) < 1e-12,
  );
  assert.equal(report.json.analysis.principalAxes.primaryAxis, "principalY");
  assert.equal(
    report.json.analysis.sectionRigidity.verticalFlexuralRigiditySource,
    "flexuralRigidity-harmonic-projection-yz",
  );
  assert.ok(principalEnvelopes.maxAbsBendingMomentY.value > 0);
  assert.ok(principalEnvelopes.maxAbsBendingMomentZ.value > 0);
  assert.ok(principalEnvelopes.maxAbsShearForceY.value > 0);
  assert.ok(principalEnvelopes.maxAbsShearForceZ.value > 0);
  assert.ok(report.json.governing.ulsMomentY);
  assert.ok(report.json.governing.ulsMomentZ);
  assert.ok(
    report.json.warnings.some((warning) =>
      warning.includes("SingleBeamAnalysis remains a 2D FEM model"),
    ),
  );
  assert.ok(report.markdown.includes("## Assi principali"));
  assert.ok(report.markdown.includes("## Azioni principali"));
});

test("single beam design application supports steel verification reports", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createSteelIpeBeamReportModel(),
  });
  const report = result.outputs.report;

  assert.equal(result.status, "ok");
  assert.equal(report.json.id, "steel-ipe200-report");
  assert.ok(report.json.verification.checks.some((check) => check.id === "steel-bending"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "steel-elastic-stress"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "steel-lateral-torsional-buckling"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "steel-compression-buckling"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "steel-beam-column-interaction-n-my"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "steel-sle-deflection"));
  assert.ok(report.json.warnings.some((warning) => warning.includes("torsion and torsional interactions")));
  assert.ok(report.markdown.includes("# Trave in acciaio IPE200"));
  assert.doesNotThrow(() => JSON.stringify(report.json));
});

test("single beam design application can report RC elastic analysis with ULS section verification", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createRcElasticBeamReportModel(),
  });
  const report = result.outputs.report;

  assert.equal(result.status, "ok");
  assert.equal(report.json.verification.applicationId, "reinforced-concrete-beams");
  assert.ok(report.json.verification.checks.some((check) => check.id === "rc-uls-uniaxial-bending"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "rc-shear-resistance"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "rc-sle-concrete-stress"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "rc-sle-crack-bar-diameter"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "rc-sle-deflection-curvature"));
  assert.ok(report.json.warnings.some((warning) => warning.includes("second-order effects")));
  assert.ok(report.markdown.includes("# Trave in c.a. elastica C25/30"));
  assert.doesNotThrow(() => JSON.stringify(report.json));
});

test("targeted report examples expose UPN Mcr and aggressive RC crack metadata", () => {
  const application = new SingleBeamDesignApplication();
  const upnResult = application.run({
    model: createSteelUpnUserMcrReportModel(),
  });
  const rcResult = application.run({
    model: createRcAggressiveCrackReportModel(),
  });
  const ltb = upnResult.outputs.report.json.verification.checks.find(
    (check) => check.id === "steel-lateral-torsional-buckling",
  );
  const crack = rcResult.outputs.report.json.verification.checks.find(
    (check) => check.id === "rc-sle-crack-bar-diameter",
  );

  assert.ok(ltb);
  assert.equal(ltb.metadata.family, "UPN");
  assert.equal(ltb.metadata.criticalMomentSource, "example-user-mcr");
  assert.ok(crack);
  assert.equal(crack.metadata.environment, "aggressive");
  assert.ok(
    rcResult.outputs.report.json.verification.metadata.verificationStations,
  );
});

test("xlam strip report example exposes beam checks and declared limitations", () => {
  const result = new SingleBeamDesignApplication().run({
    model: createXlamStripBeamReportModel(),
  });
  const report = result.outputs.report;

  assert.equal(report.json.id, "xlam-strip-report");
  assert.ok(report.json.verification.checks.some((check) => check.id === "xlam-beam-bending"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "xlam-beam-rolling-shear"));
  assert.ok(report.json.verification.checks.some((check) => check.id === "xlam-beam-deflection"));
  assert.ok(report.json.warnings.some((warning) => warning.includes("vibration")));
  assert.ok(report.json.warnings.some((warning) => warning.includes("fire")));
});

test("single beam design application runs all report example models", () => {
  const application = new SingleBeamDesignApplication();
  const results = createBeamReportExampleModels().map((model) =>
    application.run({ model }),
  );

  assert.equal(results.length, 12);

  for (const result of results) {
    assert.ok(["ok", "not-verified"].includes(result.status));
    assert.ok(result.outputs.report.json.analysis.combinationIds.length >= 2);
    assert.ok(result.outputs.report.markdown.includes("## Esito"));
    assert.doesNotThrow(() => JSON.stringify(result.outputs.report.json));
  }
});
