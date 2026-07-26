import test from "node:test";
import assert from "node:assert/strict";

import {
  DM522023_AMENDMENTS,
  DM522023_REFERENCES,
  describeDM522023Amendment,
} from "../src/index.js";

test("D.M. 52/2023 metadata identifies the enacted decree", () => {
  assert.equal(Object.isFrozen(DM522023_REFERENCES), true);
  assert.equal(DM522023_AMENDMENTS.decreeDate, "2023-03-09");
  assert.equal(DM522023_AMENDMENTS.publicationDate, "2023-03-22");
  assert.equal(DM522023_AMENDMENTS.effectiveDate, "2023-03-23");
});

test("D.M. 52/2023 has no chapter 4 or chapter 7 RC overrides", () => {
  assert.deepEqual(DM522023_AMENDMENTS.reinforcedConcreteChapter4Overrides, []);
  assert.deepEqual(DM522023_AMENDMENTS.reinforcedConcreteChapter7Overrides, []);
});

test("D.M. 52/2023 suspends NTC 2018 clause 11.4.2 until 22 March 2025", () => {
  const result = describeDM522023Amendment("11.4.2");
  assert.equal(result.amended, true);
  assert.equal(result.amendment.scope, "entire-clause");
  assert.equal(result.amendment.suspendedUntil, "2025-03-22");
});

test("D.M. 52/2023 limits the 11.5.2 suspension to passive geotechnical anchors", () => {
  const result = describeDM522023Amendment("11.5.2");
  assert.equal(result.amended, true);
  assert.equal(result.amendment.scope, "passive-geotechnical-anchors-only");
});

test("D.M. 52/2023 does not amend an RC detailing clause", () => {
  const result = describeDM522023Amendment("7.4.6.2.2");
  assert.equal(result.amended, false);
  assert.equal(result.amendment, null);
});

test("D.M. 52/2023 clause lookup requires an explicit clause", () => {
  assert.throws(
    () => describeDM522023Amendment(""),
    /ntc2018Clause is required/,
  );
});
