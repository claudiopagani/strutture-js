import test from "node:test";
import assert from "node:assert/strict";

import {
  NORMATIVE_REFERENCE_RELATIONS,
  NORMATIVE_REFERENCE_RESOLUTION_STATUS,
  NTC2018_NORMATIVE_CORPUS,
  NTC2018_RC_CHAPTER_4_REFERENCES,
  NTC2018_RC_CHAPTER_7_4_REFERENCES,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../src/index.js";
import {
  createNormativeReference,
  withNormativeReferences,
} from "../src/norms/normativeReference.js";

test("NTC 2018 RC references expose canonical unit and formula ids", () => {
  const shear =
    NTC2018_RC_CHAPTER_4_REFERENCES.shearWithoutTransverseReinforcement;

  assert.equal(
    shear.unitId,
    "urn:structural-codes:it:unit:ntc2018:4.1.2.3.5.1",
  );
  assert.ok(
    shear.assetIds.includes(
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.23",
    ),
  );
  assert.equal(shear.relation, NORMATIVE_REFERENCE_RELATIONS.IMPLEMENTS);
  assert.equal(
    shear.resolutionStatus,
    NORMATIVE_REFERENCE_RESOLUTION_STATUS.RESOLVED,
  );
  assert.equal(shear.corpusRevision, NTC2018_NORMATIVE_CORPUS.corpusRevision);
  assert.match(shear.href, /unit=urn%3Astructural-codes/);
});

test("chapter 7.4 references distinguish units from official formula assets", () => {
  const hierarchy =
    NTC2018_RC_CHAPTER_7_4_REFERENCES.columnCapacityDesign;

  assert.equal(
    hierarchy.unitId,
    "urn:structural-codes:it:unit:ntc2018:7.4.4.2.1",
  );
  assert.deepEqual(hierarchy.assetIds.slice(0, 2), [
    "urn:structural-codes:it:asset:formula:ntc2018:7.4.4",
    "urn:structural-codes:it:asset:formula:ntc2018:7.4.5",
  ]);
});

test("references outside the current corpus cannot claim canonical ids", () => {
  const foundation = NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.foundationDesign;

  assert.equal(foundation.unitId, null);
  assert.deepEqual(foundation.assetIds, []);
  assert.equal(
    foundation.resolutionStatus,
    NORMATIVE_REFERENCE_RESOLUTION_STATUS.OUTSIDE_CORPUS,
  );
});

test("normative reference factory rejects ambiguous or malformed identities", () => {
  assert.throws(
    () => createNormativeReference({
      corpusId: "structural-codes",
      corpusRevision: "revision",
      corpusStatus: "extracted",
      documentId: "ntc2018",
      unitId: "NTC2018-7.4.4",
      relation: "implements",
      citation: "ambiguous",
    }),
    /canonical unitId/,
  );
});

test("normative references merge into serializable metadata without duplicates", () => {
  const reference =
    NTC2018_RC_CHAPTER_4_REFERENCES.concreteDesignCompression;
  const metadata = withNormativeReferences(
    { method: "material-design-strength", normativeReferences: [reference] },
    [reference],
  );

  assert.equal(metadata.method, "material-design-strength");
  assert.equal(metadata.normativeReferences.length, 1);
  assert.doesNotThrow(() => JSON.stringify(metadata));
  assert.notEqual(metadata.normativeReferences[0], reference);
});
