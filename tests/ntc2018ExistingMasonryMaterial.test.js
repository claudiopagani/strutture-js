import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018ExistingMasonryMaterial,
  createNTC2018ExistingMasonryMaterial,
} from "../src/index.js";

test("creates tabulated masonry properties from typology and parameter level", () => {
  const material = createNTC2018ExistingMasonryMaterial({
    id: "MUR-01",
    masonryTypologyId: 1,
    knowledgeLevel: "LC2",
    parameterLevel: 2,
    modifierSelections: {
      maltaBuona: { selected: true },
      connessioneTrasversale: { selected: true },
      iniezioniMisceleLeganti: { selected: true },
    },
  });

  assert.ok(material instanceof NTC2018ExistingMasonryMaterial);
  assert.equal(material.originalMechanicalProperties.fm, 1.5);
  assert.equal(material.originalMechanicalProperties.tau0, 0.025);
  assert.equal(material.stateOfFactMultipliers.resistenzaCompressione, 2.25);
  assert.equal(material.stateOfFactProperties.fm, 3.375);
  assert.equal(material.improvementMultipliers.resistenzaCompressione, 2);
  assert.equal(material.improvedMechanicalProperties.fm, 6.75);
});

test("rejects incompatible improvement coefficients", () => {
  assert.throws(
    () =>
      createNTC2018ExistingMasonryMaterial({
        masonryTypologyId: 1,
        knowledgeLevel: "LC2",
        modifierSelections: {
          intonacoArmato: { selected: true },
          ristilaturaArmata: { selected: true },
        },
      }),
    /non possono essere usati insieme/,
  );
});

test("rejects coefficients unavailable for selected typology", () => {
  assert.throws(
    () =>
      createNTC2018ExistingMasonryMaterial({
        masonryTypologyId: 8,
        knowledgeLevel: "LC2",
        modifierSelections: {
          iniezioniMisceleLeganti: { selected: true },
        },
      }),
    /non e disponibile/,
  );
});
