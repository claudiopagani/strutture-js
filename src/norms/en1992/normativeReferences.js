import {
  createNormativeReference,
  NORMATIVE_REFERENCE_RELATIONS,
  NORMATIVE_REFERENCE_RESOLUTION_STATUS,
} from "../normativeReference.js";

const EN1992_1_1_2004_OVERVIEW =
  "https://eurocodes.jrc.ec.europa.eu/EN-Eurocodes/eurocode-2-design-concrete-structures";
const SECOND_GENERATION_EUROCODES_OVERVIEW =
  "https://eurocodes.jrc.ec.europa.eu/second-generation-eurocodes";

function externalEn1992Reference({
  citation,
  documentId = "en1992-1-1-2004",
  href = EN1992_1_1_2004_OVERVIEW,
}) {
  return createNormativeReference({
    corpusId: "structural-codes",
    corpusRevision: null,
    corpusStatus: NORMATIVE_REFERENCE_RESOLUTION_STATUS.OUTSIDE_CORPUS,
    documentId,
    relation: NORMATIVE_REFERENCE_RELATIONS.IMPLEMENTS,
    citation,
    href,
    resolutionStatus: NORMATIVE_REFERENCE_RESOLUTION_STATUS.OUTSIDE_CORPUS,
  });
}

/**
 * External calculation methods used by strutture-js but not represented by
 * canonical units in the currently pinned strutture-normative corpus.
 */
export const EN1992_RC_EXTERNAL_REFERENCES = Object.freeze({
  bondAndAnchorage: externalEn1992Reference({
    citation:
      "EN 1992-1-1:2004 §§ 8.4.2-8.4.4, espressioni (8.2)-(8.6)",
  }),
  localBearing: externalEn1992Reference({
    citation: "EN 1992-1-1:2004 § 6.7, espressione (6.63)",
  }),
  deflection: externalEn1992Reference({
    citation: "EN 1992-1-1:2004 § 7.4.3, espressioni (7.18)-(7.21)",
  }),
  shrinkageCurvature: externalEn1992Reference({
    citation: "EN 1992-1-1:2004 § 7.4.3(6), espressione (7.21)",
  }),
  strutAndTie: externalEn1992Reference({
    citation: "EN 1992-1-1:2004 § 6.5",
  }),
  punching2004: externalEn1992Reference({
    citation:
      "EN 1992-1-1:2004+A1:2014 §§ 6.4.2-6.4.5 e § 9.4.3",
  }),
  punching2023: externalEn1992Reference({
    documentId: "en1992-1-1-2023",
    citation: "EN 1992-1-1:2023 §§ 8.4 e 12.5.1",
    href: SECOND_GENERATION_EUROCODES_OVERVIEW,
  }),
});
