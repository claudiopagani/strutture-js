import test from "node:test";
import assert from "node:assert/strict";

import {
  GLOBAL_FEM_CONTRACT_VERSION,
  createFemCapabilitiesContract,
  createGlobalFemContractSet,
  validateFemCapabilitiesContract,
  validateFemEntityMappingContract,
  validateGlobalFemAnalysisContract,
  validateGlobalFemContractSet,
  validateGlobalFemModelContract,
  validateGlobalFemResultContract,
} from "../src/index.js";
import { createGlobalFemBuildingFixture } from "./fixtures/globalFemBuildingFixture.js";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function diagnosticCodes(validation) {
  return validation.errors.map((item) => item.code);
}

test("global FEM v0 fixture validates and survives a JSON round trip", () => {
  const fixture = createGlobalFemBuildingFixture();
  const validation = validateGlobalFemContractSet(fixture);

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(validation.warnings.length, 8);
  assert.ok(validation.warnings.every((item) => item.code === "FEM_CAPABILITY_UNAVAILABLE"));

  const contracts = createGlobalFemContractSet(fixture);
  const serialized = JSON.stringify(contracts);
  const parsed = JSON.parse(serialized);
  const roundTrip = validateGlobalFemContractSet(parsed);

  assert.equal(roundTrip.ok, true, JSON.stringify(roundTrip.errors));
  assert.deepEqual(parsed, contracts);
  assert.equal(contracts.model.version, GLOBAL_FEM_CONTRACT_VERSION);
  assert.equal(contracts.model.storeys.length, 2);
  assert.equal(contracts.result.results.modes.length, 2);
});

test("global FEM units must be complete and unambiguous", () => {
  const missing = createGlobalFemBuildingFixture().model;
  delete missing.units.mass;
  const missingValidation = validateGlobalFemModelContract(missing);

  assert.equal(missingValidation.ok, false);
  assert.ok(diagnosticCodes(missingValidation).includes("FEM_UNIT_MISSING_OR_AMBIGUOUS"));
  assert.ok(missingValidation.errors.some((item) => item.path === "$.units.mass"));

  const ambiguous = createGlobalFemBuildingFixture().analysis;
  ambiguous.units.force = "SI";
  const ambiguousValidation = validateGlobalFemAnalysisContract(ambiguous);

  assert.equal(ambiguousValidation.ok, false);
  assert.ok(ambiguousValidation.errors.some(
    (item) => item.code === "FEM_UNIT_MISSING_OR_AMBIGUOUS" && item.path === "$.units.force",
  ));
});

test("model validation rejects duplicate ids and invalid connectivity", () => {
  const duplicate = createGlobalFemBuildingFixture().model;
  duplicate.nodes.push(copy(duplicate.nodes[0]));
  const duplicateValidation = validateGlobalFemModelContract(duplicate);

  assert.equal(duplicateValidation.ok, false);
  assert.ok(diagnosticCodes(duplicateValidation).includes("FEM_DUPLICATE_ID"));

  const disconnected = createGlobalFemBuildingFixture().model;
  disconnected.lineElements[0].nodeIds[1] = "MISSING-NODE";
  const disconnectedValidation = validateGlobalFemModelContract(disconnected);

  assert.equal(disconnectedValidation.ok, false);
  assert.ok(diagnosticCodes(disconnectedValidation).includes("FEM_UNKNOWN_REFERENCE"));
});

test("line and shell local axes must be complete, orthonormal and non-degenerate", () => {
  const incomplete = createGlobalFemBuildingFixture().model;
  delete incomplete.lineElements[0].localAxes.z;
  const incompleteValidation = validateGlobalFemModelContract(incomplete);

  assert.equal(incompleteValidation.ok, false);
  assert.ok(incompleteValidation.errors.some(
    (item) => item.path === "$.lineElements[0].localAxes.z",
  ));

  const degenerate = createGlobalFemBuildingFixture().model;
  degenerate.shellElements[0].localAxes.y = { x: 1, y: 0, z: 0 };
  const degenerateValidation = validateGlobalFemModelContract(degenerate);

  assert.equal(degenerateValidation.ok, false);
  assert.ok(diagnosticCodes(degenerateValidation).includes("FEM_AXES_NOT_ORTHOGONAL"));
  assert.ok(diagnosticCodes(degenerateValidation).includes("FEM_AXES_NOT_RIGHT_HANDED"));
});

test("cross-contract references reject missing model entities", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.model.shellElements[0].sectionId = "MISSING-SECTION";
  const modelValidation = validateGlobalFemModelContract(fixture.model);

  assert.equal(modelValidation.ok, false);
  assert.ok(modelValidation.errors.some(
    (item) => item.code === "FEM_UNKNOWN_REFERENCE" && item.path.endsWith(".sectionId"),
  ));

  const mappingFixture = createGlobalFemBuildingFixture();
  mappingFixture.mapping.walls[0].sectionCutIds[0] = "MISSING-CUT";
  const mappingValidation = validateFemEntityMappingContract(mappingFixture.mapping, {
    model: mappingFixture.model,
  });

  assert.equal(mappingValidation.ok, false);
  assert.ok(diagnosticCodes(mappingValidation).includes("FEM_UNKNOWN_REFERENCE"));
});

test("analysis procedures require existing load data and declared capabilities", () => {
  const missingPattern = createGlobalFemBuildingFixture();
  missingPattern.analysis.loadCases[0].loadPatternIds[0] = "MISSING-PATTERN";
  const missingValidation = validateGlobalFemAnalysisContract(missingPattern.analysis, {
    model: missingPattern.model,
    capabilities: missingPattern.capabilities,
  });

  assert.equal(missingValidation.ok, false);
  assert.ok(diagnosticCodes(missingValidation).includes("FEM_UNKNOWN_REFERENCE"));

  const unavailable = createGlobalFemBuildingFixture();
  unavailable.capabilities.analyses.modal = false;
  const capabilityValidation = validateGlobalFemAnalysisContract(unavailable.analysis, {
    model: unavailable.model,
    capabilities: unavailable.capabilities,
  });

  assert.equal(capabilityValidation.ok, false);
  assert.ok(diagnosticCodes(capabilityValidation).includes("FEM_CAPABILITY_REQUIRED"));
});

test("results must target the exact model and analysis id/hash", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.result.modelHash = "sha256:wrong-model";
  fixture.result.analysisId = "WRONG-ANALYSIS";
  const validation = validateGlobalFemResultContract(fixture.result, fixture);

  assert.equal(validation.ok, false);
  assert.ok(diagnosticCodes(validation).includes("FEM_MODEL_ASSOCIATION_MISMATCH"));
  assert.ok(diagnosticCodes(validation).includes("FEM_ANALYSIS_ASSOCIATION_MISMATCH"));
  assert.ok(diagnosticCodes(validation).includes("FEM_PROVENANCE_MISMATCH"));
});

test("requested results cannot be omitted when the capability is declared", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.result.results.modes = [];
  const validation = validateGlobalFemResultContract(fixture.result, fixture);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some(
    (item) => item.code === "FEM_DECLARED_RESULT_MISSING" &&
      item.path === "$.results.modes",
  ));
});

test("line result stations carry ordered normalized and physical positions", () => {
  const outOfRange = createGlobalFemBuildingFixture();
  outOfRange.result.results.lineElementActions[0].stations[1].xi = 1.2;
  const rangeValidation = validateGlobalFemResultContract(outOfRange.result, outOfRange);

  assert.equal(rangeValidation.ok, false);
  assert.ok(diagnosticCodes(rangeValidation).includes("FEM_STATION_OUT_OF_RANGE"));

  const mismatched = createGlobalFemBuildingFixture();
  mismatched.result.results.lineElementActions[0].stations[1].position = 99;
  const positionValidation = validateGlobalFemResultContract(mismatched.result, mismatched);

  assert.equal(positionValidation.ok, false);
  assert.ok(diagnosticCodes(positionValidation).includes("FEM_STATION_POSITION_MISMATCH"));
});

test("shell resultants require axes context, face and physical result position", () => {
  const fixture = createGlobalFemBuildingFixture();
  const resultant = fixture.result.results.shellResultants[0];
  delete resultant.face;
  delete resultant.location.position;
  const validation = validateGlobalFemResultContract(fixture.result, fixture);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((item) => item.path.endsWith(".face")));
  assert.ok(validation.errors.some((item) => item.path.endsWith(".location.position")));
});

test("element-average shell resultants declare their averaging provenance", () => {
  const fixture = createGlobalFemBuildingFixture();
  const location = fixture.result.results.shellResultants[0].location;
  location.kind = "element-average";
  location.averaging = {
    method: "arithmetic-mean",
    source: "nodal-smoothed",
    sampleCount: 4,
  };

  const valid = validateGlobalFemResultContract(fixture.result, fixture);
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));

  delete location.averaging;
  const missingProvenance = validateGlobalFemResultContract(fixture.result, fixture);
  assert.equal(missingProvenance.ok, false);
  assert.ok(missingProvenance.errors.some(
    (item) => item.path.endsWith(".location.averaging"),
  ));

  for (const [field, value] of [
    ["method", "weighted-mean"],
    ["source", "integration-points"],
    ["sampleCount", 0],
  ]) {
    const invalidFixture = createGlobalFemBuildingFixture();
    const invalidLocation = invalidFixture.result.results.shellResultants[0].location;
    invalidLocation.kind = "element-average";
    invalidLocation.averaging = {
      method: "arithmetic-mean",
      source: "nodal-smoothed",
      sampleCount: 4,
      [field]: value,
    };

    const invalid = validateGlobalFemResultContract(invalidFixture.result, invalidFixture);
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.some(
      (item) => item.path.endsWith(`.location.averaging.${field}`),
    ));
  }
});

test("individual result validation may omit mapping while the complete set requires it", () => {
  const fixture = createGlobalFemBuildingFixture();
  const contextWithoutMapping = {
    model: fixture.model,
    analysis: fixture.analysis,
    capabilities: fixture.capabilities,
  };

  const individual = validateGlobalFemResultContract(fixture.result, contextWithoutMapping);
  assert.equal(individual.ok, true, JSON.stringify(individual.errors));

  const completeSet = validateGlobalFemContractSet({
    ...contextWithoutMapping,
    result: fixture.result,
  });
  assert.equal(completeSet.ok, false);
  assert.equal(completeSet.contracts.mapping.ok, false);
  assert.ok(completeSet.contracts.mapping.errors.some(
    (item) => item.code === "FEM_EXPECTED_OBJECT" && item.path === "$",
  ));
});

test("entity mapping explicitly connects members, walls, slabs, storeys and joints", () => {
  const fixture = createGlobalFemBuildingFixture();
  const validation = validateFemEntityMappingContract(fixture.mapping, {
    model: fixture.model,
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(fixture.mapping.members.length, fixture.model.lineElements.length);
  assert.deepEqual(fixture.mapping.walls[0].shellElementIds, ["WALL-S1", "WALL-S2"]);
  assert.equal(fixture.mapping.slabs.length, 2);
  assert.equal(fixture.mapping.storeys.length, 2);
  assert.ok(fixture.mapping.joints[0].lineElementEnds.length >= 4);

  fixture.mapping.members[1].lineElementIds = [fixture.mapping.members[0].lineElementIds[0]];
  const ambiguous = validateFemEntityMappingContract(fixture.mapping, {
    model: fixture.model,
  });
  assert.equal(ambiguous.ok, false);
  assert.ok(diagnosticCodes(ambiguous).includes("FEM_AMBIGUOUS_ENTITY_MAPPING"));
  assert.ok(diagnosticCodes(ambiguous).includes("FEM_MAPPING_INCOMPLETE"));
});

test("modal results expose reciprocal periods, shapes, participation and masses", () => {
  const fixture = createGlobalFemBuildingFixture();
  const validation = validateGlobalFemResultContract(fixture.result, fixture);

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  for (const mode of fixture.result.results.modes) {
    assert.ok(Math.abs(mode.period * mode.frequency - 1) < 1e-12);
    assert.equal(mode.modalShape.length, fixture.model.nodes.length);
    assert.ok(Number.isFinite(mode.participationFactors.X));
    assert.ok(Number.isFinite(mode.participatingMasses.Y));
    assert.ok(mode.participatingMassRatios.X >= 0);
  }

  fixture.result.results.modes[0].frequency = 99;
  const inconsistent = validateGlobalFemResultContract(fixture.result, fixture);
  assert.equal(inconsistent.ok, false);
  assert.ok(diagnosticCodes(inconsistent).includes("FEM_MODAL_PERIOD_FREQUENCY_MISMATCH"));
});

test("unavailable capabilities warn and cannot carry false result data", () => {
  const fixture = createGlobalFemBuildingFixture();
  const capabilities = validateFemCapabilitiesContract(fixture.capabilities);

  assert.equal(capabilities.ok, true);
  assert.ok(capabilities.warnings.some((item) => item.path === "$.results.stresses"));
  assert.doesNotThrow(() => createFemCapabilitiesContract(fixture.capabilities));

  fixture.result.results.stresses.push({
    procedureId: "PROC-STATIC",
    combinationId: "ULS-1",
    entityType: "shell-element",
    entityId: "WALL-S1",
    coordinateSystem: "element-local",
    face: "positive-local-z",
    location: { kind: "centroid", position: { x: 0, y: 2, z: 1.5 } },
    components: { Sx: 1 },
  });
  const result = validateGlobalFemResultContract(fixture.result, fixture);
  assert.equal(result.ok, false);
  assert.ok(diagnosticCodes(result).includes("FEM_UNDECLARED_RESULT_CAPABILITY"));
});

test("unavailable optional result families may be omitted entirely", () => {
  const fixture = createGlobalFemBuildingFixture();
  delete fixture.result.results.stresses;
  delete fixture.result.results.strains;
  const validation = validateGlobalFemResultContract(fixture.result, fixture);

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
});

test("global FEM diagnostics and values remain plain serializable data", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.model.nodes[0].metadata.invalid = undefined;
  const validation = validateGlobalFemModelContract(fixture.model);

  assert.equal(validation.ok, false);
  assert.equal(validation.value, null);
  assert.ok(diagnosticCodes(validation).includes("FEM_NOT_JSON_SERIALIZABLE"));
  assert.doesNotThrow(() => JSON.stringify(validation.errors));
});
