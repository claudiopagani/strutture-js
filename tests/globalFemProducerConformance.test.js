import test from "node:test";
import assert from "node:assert/strict";

import {
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GlobalFemPostProcessingApplication,
  RcBuildingVerificationApplication,
} from "../src/index.js";
import {
  configureCompleteRcBuildingFixture,
  createGlobalFemBuildingFixture,
} from "./fixtures/globalFemBuildingFixture.js";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixtureForProducer(id, name, version) {
  const fixture = createGlobalFemBuildingFixture();
  fixture.capabilities.id = `${id}-capabilities`;
  fixture.capabilities.solver = { id, name, version };
  fixture.result.id = `${id}-result`;
  fixture.result.capabilitiesId = fixture.capabilities.id;
  fixture.result.provenance.solver = copy(fixture.capabilities.solver);
  return fixture;
}

function normalizedDemandSemantics(demandSet) {
  const normalized = copy(demandSet);
  delete normalized.resultId;
  delete normalized.provenance;
  return normalized;
}

test("two independent FEM producers yield identical postprocessing semantics", () => {
  const producerA = fixtureForProducer(
    "contract-producer-a",
    "Contract Producer A",
    "1.0",
  );
  const producerB = fixtureForProducer(
    "contract-producer-b",
    "Contract Producer B",
    "9.4",
  );
  const application = new GlobalFemPostProcessingApplication();
  const first = application.run({
    ...producerA,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  });
  const second = application.run({
    ...producerB,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  });

  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.deepEqual(
    normalizedDemandSemantics(first.outputs.demands),
    normalizedDemandSemantics(second.outputs.demands),
  );
  assert.equal(
    first.outputs.demands.provenance.solver.id,
    "contract-producer-a",
  );
  assert.equal(
    second.outputs.demands.provenance.solver.id,
    "contract-producer-b",
  );
});

test("two FEM producers yield the same complete RC building decision", () => {
  const producerA = configureCompleteRcBuildingFixture(
    fixtureForProducer(
      "contract-producer-a",
      "Contract Producer A",
      "1.0",
    ),
  );
  const producerB = configureCompleteRcBuildingFixture(
    fixtureForProducer(
      "contract-producer-b",
      "Contract Producer B",
      "9.4",
    ),
  );
  const application = new RcBuildingVerificationApplication();
  const first = application.run(producerA);
  const second = application.run(producerB);
  const normalizedFirst = copy(first.outputs);
  const normalizedSecond = copy(second.outputs);
  for (const output of [normalizedFirst, normalizedSecond]) {
    delete output.globalFemDemandSet.resultId;
    delete output.globalFemDemandSet.provenance;
  }

  assert.equal(first.status, second.status);
  assert.equal(first.outputs.blockedAssessments.length, 0);
  assert.equal(second.outputs.blockedAssessments.length, 0);
  assert.deepEqual(normalizedFirst, normalizedSecond);
});
