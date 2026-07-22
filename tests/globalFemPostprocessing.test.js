import test from "node:test";
import assert from "node:assert/strict";

import {
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GLOBAL_FEM_READINESS_ASSESSMENTS,
  GlobalFemPostProcessingApplication,
  RESULT_STATUS,
  classifyGlobalFemStructuralEntities,
  extractGlobalFemDemands,
  normalizeGlobalFemClassificationPolicy,
} from "../src/index.js";
import { createGlobalFemBuildingFixture } from "./fixtures/globalFemBuildingFixture.js";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

test("global FEM postprocessing exposes demand-only, assisted and confirmed profiles", () => {
  const application = new GlobalFemPostProcessingApplication();
  const fixture = createGlobalFemBuildingFixture();

  const demandOnly = application.run({
    ...fixture,
    mapping: undefined,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY,
  });
  assert.equal(demandOnly.status, RESULT_STATUS.OK);
  assert.equal(demandOnly.outputs.demands.lineElementDemands.length, fixture.model.lineElements.length);
  assert.equal(demandOnly.outputs.demands.shellElementDemands.length, fixture.model.shellElements.length);
  assert.equal(demandOnly.outputs.classification.members.length, 0);
  assert.deepEqual(
    demandOnly.outputs.readiness.assessments.map((item) => item.id),
    [GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS],
  );

  const assisted = application.run({
    ...fixture,
    mapping: undefined,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED,
  });
  assert.equal(assisted.status, RESULT_STATUS.OK);
  assert.ok(assisted.outputs.classification.members.some((item) =>
    item.classification.role === "beam" && item.classification.status === "proposed"));
  assert.ok(assisted.outputs.classification.members.some((item) =>
    item.classification.role === "column" && item.classification.status === "proposed"));
  assert.ok(assisted.outputs.classification.surfaces.some((item) =>
    item.classification.role === "wall"));
  assert.ok(assisted.outputs.classification.surfaces.some((item) =>
    item.classification.role === "slab"));
  assert.deepEqual(
    assisted.outputs.classification.surfaces.find((item) =>
      item.classification.role === "wall").shellElementIds,
    ["WALL-S1", "WALL-S2"],
  );
  assert.equal(assisted.outputs.classification.storeys.length, 2);
  assert.ok(assisted.outputs.classification.joints.some((item) =>
    item.nodeId === "A1" && item.classification.status === "proposed"));
  assert.equal(assisted.outputs.readiness.mapping.provisional, true);
  assert.equal(assisted.outputs.readiness.normativeVerificationEligible, false);
  assert.equal(
    assisted.outputs.readiness.assessments.find((item) =>
      item.id === GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS).status,
    "provisional",
  );

  const confirmed = application.run({
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  });
  assert.equal(confirmed.status, RESULT_STATUS.OK);
  assert.equal(confirmed.outputs.readiness.mapping.confirmed, true);
  assert.equal(
    confirmed.outputs.classification.members.find((item) =>
      item.id === "MEMBER-COL-A-1").classification.status,
    "confirmed",
  );
  assert.equal(
    confirmed.outputs.classification.joints.find((item) =>
      item.id === "JOINT-A1").classification.status,
    "confirmed",
  );
});

test("assisted classification follows gravity rather than assuming global Z", () => {
  const fixture = createGlobalFemBuildingFixture();
  const model = fixture.model;
  for (const node of model.nodes) {
    const { x, y, z } = node.coordinates;
    node.coordinates = { x: z, y, z: -x };
  }
  model.globalCoordinateSystem.gravityDirection = { x: -1, y: 0, z: 0 };
  const proposal = classifyGlobalFemStructuralEntities({ model });

  assert.equal(
    proposal.members.find((item) => item.lineElementIds.includes("COL-A-1"))
      .classification.role,
    "column",
  );
  assert.equal(
    proposal.members.find((item) => item.lineElementIds.includes("BEAM-AB-1"))
      .classification.role,
    "beam",
  );
});

test("inclined members remain ambiguous unless an explicit beam threshold is configured", () => {
  const fixture = createGlobalFemBuildingFixture();
  const model = fixture.model;
  model.nodes.find((node) => node.id === "A1").coordinates = { x: 4, y: 0, z: 3 };
  model.lineElements = [model.lineElements.find((item) => item.id === "COL-A-1")];
  model.shellElements = [];
  model.constraints = [];
  model.diaphragms = [];
  model.storeys = [];

  const ambiguous = classifyGlobalFemStructuralEntities({ model });
  assert.equal(ambiguous.members[0].classification.role, "other");
  assert.equal(ambiguous.members[0].classification.status, "ambiguous");

  const configured = classifyGlobalFemStructuralEntities({
    model,
    policy: { line: { maximumBeamInclinationDegrees: 40 } },
  });
  assert.equal(configured.members[0].classification.role, "beam");
  assert.equal(configured.members[0].classification.source, "configured-geometric-inference");

  assert.throws(
    () => normalizeGlobalFemClassificationPolicy({
      line: { horizontalToleranceDegrees: 20, maximumBeamInclinationDegrees: 10 },
    }),
    /between 20 and 80/,
  );
});

test("demand extraction preserves element axes, governing references and joint ends", () => {
  const fixture = createGlobalFemBuildingFixture();
  const classification = classifyGlobalFemStructuralEntities({
    model: fixture.model,
    mapping: fixture.mapping,
  });
  const demands = extractGlobalFemDemands({
    model: fixture.model,
    analysis: fixture.analysis,
    result: fixture.result,
    classification,
  });

  const column = demands.lineElementDemands.find((item) =>
    item.lineElementId === "COL-A-1");
  assert.deepEqual(column.localAxes, fixture.model.lineElements[0].localAxes);
  assert.equal(column.componentEnvelopes.N.minimum.value, -120);
  assert.equal(column.componentEnvelopes.N.minimum.reference.combinationId, "ULS-1");
  assert.equal(column.componentEnvelopes.N.maximum.value, -72);

  const shell = demands.shellElementDemands.find((item) =>
    item.shellElementId === "WALL-S1");
  assert.equal(shell.resultantStates[0].face, "mid-surface");
  assert.equal(shell.resultantStates[0].location.kind, "centroid");
  assert.deepEqual(shell.localAxes, fixture.model.shellElements.find((item) =>
    item.id === "WALL-S1").localAxes);

  const joint = demands.jointDemands.find((item) => item.jointId === "JOINT-A1");
  const uls = joint.demandStates.find((item) => item.reference.combinationId === "ULS-1");
  assert.equal(joint.complete, true);
  assert.equal(uls.elementEnds.length, 4);
  assert.equal(uls.elementEnds.find((item) =>
    item.lineElementId === "COL-A-1").station.xi, 1);
  assert.equal(uls.elementEnds.find((item) =>
    item.lineElementId === "COL-A-2").station.xi, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(demands)), demands);

  const interiorOnlyResult = copy(fixture.result);
  for (const state of interiorOnlyResult.results.lineElementActions.filter((item) =>
    item.lineElementId === "COL-A-1")) {
    state.stations[0].xi = 0.1;
    state.stations[0].position = 0.3;
    state.stations[1].xi = 0.9;
    state.stations[1].position = 2.7;
  }
  const interiorOnlyDemands = extractGlobalFemDemands({
    model: fixture.model,
    analysis: fixture.analysis,
    result: interiorOnlyResult,
    classification,
  });
  const incompleteJoint = interiorOnlyDemands.jointDemands.find((item) =>
    item.jointId === "JOINT-A1");
  assert.equal(incompleteJoint.complete, false);
  assert.ok(incompleteJoint.demandStates.every((state) =>
    state.missingElementEnds.some((item) => item.lineElementId === "COL-A-1")));

  const sparseResult = copy(fixture.result);
  delete sparseResult.results.sectionCuts;
  delete sparseResult.results.storeyResults;
  delete sparseResult.results.equilibriumResiduals;
  delete sparseResult.qualityIndicators;
  const sparseDemands = extractGlobalFemDemands({
    model: fixture.model,
    analysis: fixture.analysis,
    result: sparseResult,
    classification,
  });
  assert.deepEqual(sparseDemands.globalResponses.sectionCuts, []);
  assert.deepEqual(sparseDemands.globalResponses.qualityIndicators, {});
});

test("confirmed profile blocks incomplete mapping while assisted profile accepts safe proposals", () => {
  const application = new GlobalFemPostProcessingApplication();
  const fixture = createGlobalFemBuildingFixture();
  fixture.mapping.members.pop();

  const confirmed = application.run({
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  });
  assert.equal(confirmed.status, RESULT_STATUS.NOT_ANALYZED);
  assert.equal(confirmed.outputs.validations.mapping.ok, false);
  assert.equal(confirmed.outputs.readiness.mapping.confirmed, false);

  const assisted = application.run({
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED,
  });
  assert.equal(assisted.status, RESULT_STATUS.OK);
  assert.equal(assisted.outputs.readiness.mapping.provisional, true);

  const unsafe = copy(fixture);
  unsafe.mapping.members[0].lineElementIds = ["UNKNOWN-LINE"];
  const unsafeResult = application.run({
    ...unsafe,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED,
  });
  assert.equal(unsafeResult.status, RESULT_STATUS.NOT_ANALYZED);
  assert.ok(unsafeResult.outputs.readiness.assessments.some((assessment) =>
    assessment.missingInputs.some((item) => item.code === "FEM_UNKNOWN_REFERENCE")));
});

test("readiness reports missing project, design and analysis inputs without claiming checks", () => {
  const fixture = createGlobalFemBuildingFixture();
  const output = new GlobalFemPostProcessingApplication().run({
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
    requestedAssessments: [
      GLOBAL_FEM_READINESS_ASSESSMENTS.COMPLETE_NTC2018_BUILDING_VERIFICATION,
    ],
  });
  const assessment = output.outputs.readiness.assessments[0];

  assert.equal(output.status, RESULT_STATUS.NOT_ANALYZED);
  assert.equal(assessment.implementationStatus, "not-implemented");
  assert.equal(assessment.inputStatus, "blocked");
  assert.equal(output.outputs.readiness.normativeVerificationEligible, false);
  assert.ok(assessment.missingInputs.some((item) =>
    item.code === "FEM_MEMBER_DESIGN_DATA_MISSING"));
  assert.ok(assessment.missingInputs.some((item) =>
    item.code === "FEM_SLAB_DESIGN_DATA_MISSING"));
  assert.ok(assessment.missingInputs.some((item) =>
    item.path === "$.projectContext.ductilityClass"));
  assert.ok(assessment.missingInputs.some((item) =>
    item.code === "FEM_REQUIRED_COMBINATION_MISSING" && /seismic/.test(item.message)));
  assert.equal(output.metadata.normativeVerificationPerformed, false);
});

test("invalid core contracts stop postprocessing with explicit diagnostics", () => {
  const fixture = createGlobalFemBuildingFixture();
  delete fixture.model.units.length;
  const output = new GlobalFemPostProcessingApplication().run(fixture);

  assert.equal(output.status, RESULT_STATUS.NOT_ANALYZED);
  assert.equal(output.outputs.validations.model.ok, false);
  assert.ok(output.warnings.some((item) => item.code === "FEM_UNIT_MISSING_OR_AMBIGUOUS"));
  assert.equal(output.outputs.demands, undefined);
});

test("partial solver results remain usable for explicitly available result families", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.result.status = "partial";
  const output = new GlobalFemPostProcessingApplication().run({
    ...fixture,
    mapping: undefined,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY,
  });

  assert.equal(output.status, RESULT_STATUS.OK);
  assert.equal(output.outputs.readiness.assessments[0].status, "ready");
  assert.ok(output.warnings.some((item) => item.code === "FEM_ANALYSIS_PARTIAL"));
});
