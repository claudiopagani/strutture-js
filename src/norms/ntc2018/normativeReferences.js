import {
  createNormativeReference,
  NORMATIVE_REFERENCE_RELATIONS,
  NORMATIVE_REFERENCE_RESOLUTION_STATUS,
} from "../normativeReference.js";

export const NTC2018_NORMATIVE_CORPUS = Object.freeze({
  corpusId: "structural-codes",
  corpusRevision: "41da3faa489600173106935bbcf726119300e48d",
  corpusStatus: "extracted",
  repository: "https://github.com/claudiopagani/strutture-normative",
  schemaVersion: "2.0.0-alpha.2",
  viewer:
    "https://strutture-normative-viewer.claudiopagani19.chatgpt.site/",
});

function viewerHref(unitId) {
  return `${NTC2018_NORMATIVE_CORPUS.viewer}?unit=${encodeURIComponent(unitId)}`;
}

function resolvedReference({
  documentId = "ntc2018",
  unitId,
  assetIds = [],
  relation = NORMATIVE_REFERENCE_RELATIONS.IMPLEMENTS,
  citation,
}) {
  return createNormativeReference({
    ...NTC2018_NORMATIVE_CORPUS,
    documentId,
    unitId,
    assetIds,
    relation,
    citation,
    href: viewerHref(unitId),
  });
}

function outsideCorpusReference({
  documentId = "ntc2018",
  relation = NORMATIVE_REFERENCE_RELATIONS.INFORMS,
  citation,
  href = "https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg",
}) {
  return createNormativeReference({
    corpusId: NTC2018_NORMATIVE_CORPUS.corpusId,
    corpusRevision: NTC2018_NORMATIVE_CORPUS.corpusRevision,
    corpusStatus: NORMATIVE_REFERENCE_RESOLUTION_STATUS.OUTSIDE_CORPUS,
    documentId,
    relation,
    citation,
    href,
    resolutionStatus: NORMATIVE_REFERENCE_RESOLUTION_STATUS.OUTSIDE_CORPUS,
  });
}

function freezeCatalog(value) {
  return Object.freeze(value);
}

export const NTC2018_RC_CHAPTER_4_REFERENCES = freezeCatalog({
  concreteDesignCompression: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.1.1.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.3",
    ],
    citation: "NTC 2018 § 4.1.2.1.1.1, formula [4.1.3]",
  }),
  concreteDesignTension: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.1.1.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.4",
    ],
    citation: "NTC 2018 § 4.1.2.1.1.2, formula [4.1.4]",
  }),
  reinforcementDesignYield: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.1.1.3",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.5",
    ],
    citation: "NTC 2018 § 4.1.2.1.1.3, formula [4.1.5]",
  }),
  bondDesignStrength: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.1.1.4",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.6",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.7",
    ],
    citation: "NTC 2018 § 4.1.2.1.1.4, formule [4.1.6]-[4.1.7]",
  }),
  concreteConstitutiveParameters: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.1.2.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.2.1.2.1:material-parameters-up-to-c50-60",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.2.1.2.1:material-parameters-over-c50-60",
    ],
    citation: "NTC 2018 § 4.1.2.1.2.1",
  }),
  deflection: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.2.2",
    relation: NORMATIVE_REFERENCE_RELATIONS.INFORMS,
    citation: "NTC 2018 § 4.1.2.2.2",
  }),
  crackWidth: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.2.4.5",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.14",
    ],
    citation: "NTC 2018 § 4.1.2.2.4.5, formula [4.1.14]",
  }),
  concreteStressCharacteristic: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.2.5.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.15",
    ],
    citation: "NTC 2018 § 4.1.2.2.5.1, formula [4.1.15]",
  }),
  concreteStressQuasiPermanent: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.2.5.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.16",
    ],
    citation: "NTC 2018 § 4.1.2.2.5.1, formula [4.1.16]",
  }),
  reinforcementStress: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.2.5.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.17",
    ],
    citation: "NTC 2018 § 4.1.2.2.5.2, formula [4.1.17]",
  }),
  flexureAndAxialForce: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.4.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.18a",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.18b",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.19",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.20",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.21",
    ],
    citation: "NTC 2018 § 4.1.2.3.4.2, formule [4.1.18]-[4.1.21]",
  }),
  curvatureDuctility: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.4.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.2.3.4.2:phi-yd",
    ],
    citation:
      "NTC 2018 § 4.1.2.3.4.2, curvatura convenzionale di prima plasticizzazione",
  }),
  shearWithoutTransverseReinforcement: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.5.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.22",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.23",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.24",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.2.3.5.1:parameters",
    ],
    citation: "NTC 2018 § 4.1.2.3.5.1, formule [4.1.22]-[4.1.24]",
  }),
  shearWithTransverseReinforcement: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.5.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.25",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.26",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.27",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.28",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.29",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.30",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.2.3.5.2:alpha-c",
    ],
    citation: "NTC 2018 § 4.1.2.3.5.2, formule [4.1.25]-[4.1.30]",
  }),
  punching: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.5.4",
    citation: "NTC 2018 § 4.1.2.3.5.4",
  }),
  anchorage: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.10",
    citation: "NTC 2018 § 4.1.2.3.10",
  }),
  torsion: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.6",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.34",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.35",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.36",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.37",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.38",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.39",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.40",
    ],
    citation: "NTC 2018 § 4.1.2.3.6, formule [4.1.34]-[4.1.40]",
  }),
  strutAndTie: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.7",
    citation: "NTC 2018 § 4.1.2.3.7",
  }),
  columnSlenderness: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.9.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.41",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.42",
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.43",
    ],
    citation: "NTC 2018 § 4.1.2.3.9.2, formule [4.1.41]-[4.1.43]",
  }),
  nominalStiffness: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.2.3.9.3",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.44",
    ],
    citation: "NTC 2018 § 4.1.2.3.9.3, formula [4.1.44]",
  }),
  beamDetailing: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.6.1.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.45",
    ],
    citation: "NTC 2018 § 4.1.6.1.1, formula [4.1.45]",
  }),
  columnDetailing: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:4.1.6.1.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:4.1.46",
    ],
    citation: "NTC 2018 § 4.1.6.1.2, formula [4.1.46]",
  }),
});

export const NTC2018_RC_CHAPTER_7_4_REFERENCES = freezeCatalog({
  structuralBehavior: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.1",
    citation: "NTC 2018 § 7.4.1",
  }),
  structuralTypesAndQ: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.3",
    citation: "NTC 2018 § 7.4.3",
  }),
  beamCapacityShear: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.1.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.1",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.2",
    ],
    citation: "NTC 2018 § 7.4.4.1.1, formule [7.4.1]-[7.4.2]",
  }),
  beamDuctility: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.1.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.3",
    ],
    citation: "NTC 2018 § 7.4.4.1.2, formula [7.4.3]",
  }),
  columnCapacityDesign: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.2.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.4",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.5",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.5:mi-d",
    ],
    citation: "NTC 2018 § 7.4.4.2.1, formule [7.4.4]-[7.4.5]",
  }),
  beamColumnJoint: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.3.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.6",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.7",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.8",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.9",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.10",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.11",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.12",
    ],
    citation: "NTC 2018 § 7.4.4.3.1, formule [7.4.6]-[7.4.12]",
  }),
  diaphragm: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.4.1",
    citation: "NTC 2018 § 7.4.4.4.1",
  }),
  wall: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.5.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.13",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.14",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.15",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.16",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.17",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.18",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.19",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.20",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.21",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.22",
    ],
    citation: "NTC 2018 § 7.4.4.5.1, formule [7.4.13]-[7.4.22]",
  }),
  wallDuctility: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.5.2",
    citation: "NTC 2018 § 7.4.4.5.2",
  }),
  couplingBeam: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.6",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.23",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.24",
    ],
    citation: "NTC 2018 § 7.4.4.6, formule [7.4.23]-[7.4.24]",
  }),
  beamGeometry: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.6.1.1",
    citation: "NTC 2018 § 7.4.6.1.1",
  }),
  columnGeometry: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.6.1.2",
    citation: "NTC 2018 § 7.4.6.1.2",
  }),
  jointGeometry: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.6.1.3",
    citation: "NTC 2018 § 7.4.6.1.3",
  }),
  wallGeometry: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.6.1.4",
    citation: "NTC 2018 § 7.4.6.1.4",
  }),
  beamDetailing: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.6.2.1",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.26",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.27",
    ],
    citation: "NTC 2018 § 7.4.6.2.1, formule [7.4.26]-[7.4.27]",
  }),
  columnDetailing: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.6.2.2",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.28",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.28:staffe-minime",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.29",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.30",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.31a",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.31b",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.31c",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.31d",
    ],
    citation: "NTC 2018 § 7.4.6.2.2, formule [7.4.28]-[7.4.31]",
  }),
  jointDetailing: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.6.2.3",
    citation: "NTC 2018 § 7.4.6.2.3",
  }),
  wallDetailing: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.6.2.4",
    citation: "NTC 2018 § 7.4.6.2.4",
  }),
  couplingBeamDetailing: resolvedReference({
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4.6",
    assetIds: [
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.23",
      "urn:structural-codes:it:asset:formula:ntc2018:7.4.24",
    ],
    citation: "NTC 2018 § 7.4.4.6, formule [7.4.23]-[7.4.24]",
  }),
});

export const CIRC2019_RC_REFERENCES = freezeCatalog({
  simplifiedDeflectionSlenderness: resolvedReference({
    documentId: "circ2019",
    unitId: "urn:structural-codes:it:unit:circ2019:c4.1.2.2.2",
    assetIds: [
      "urn:structural-codes:it:asset:table:circ2019:c4.1.i",
    ],
    relation: NORMATIVE_REFERENCE_RELATIONS.CLARIFIES,
    citation: "Circolare 2019 § C4.1.2.2.2, tabella C4.1.I",
  }),
  indirectCrackControlDiameter: resolvedReference({
    documentId: "circ2019",
    unitId: "urn:structural-codes:it:unit:circ2019:c4.1.2.2.4.5",
    assetIds: [
      "urn:structural-codes:it:asset:table:circ2019:c4.1.ii",
    ],
    relation: NORMATIVE_REFERENCE_RELATIONS.CLARIFIES,
    citation: "Circolare 2019 § C4.1.2.2.4.5, tabella C4.1.II",
  }),
  indirectCrackControlSpacing: resolvedReference({
    documentId: "circ2019",
    unitId: "urn:structural-codes:it:unit:circ2019:c4.1.2.2.4.5",
    assetIds: [
      "urn:structural-codes:it:asset:table:circ2019:c4.1.iii",
    ],
    relation: NORMATIVE_REFERENCE_RELATIONS.CLARIFIES,
    citation: "Circolare 2019 § C4.1.2.2.4.5, tabella C4.1.III",
  }),
});

export const NTC2018_RC_OUTSIDE_CORPUS_REFERENCES = freezeCatalog({
  foundationDesign: outsideCorpusReference({
    citation: "NTC 2018 § 6.4",
  }),
  globalSeismicAnalysis: outsideCorpusReference({
    citation: "NTC 2018 §§ 7.2-7.3",
  }),
  structuralRegularity: outsideCorpusReference({
    citation: "NTC 2018 § 7.2.1",
  }),
  structuralRegularityGuidance: outsideCorpusReference({
    documentId: "circ2019",
    citation: "Circolare 2019 § C7.2.1",
    href: "https://www.gazzettaufficiale.it/eli/id/2019/02/11/19A00855/sg",
  }),
  seismicFoundationDesign: outsideCorpusReference({
    citation: "NTC 2018 § 7.11",
  }),
  materialQualification: outsideCorpusReference({
    citation: "NTC 2018, capitolo 11",
  }),
});

export {
  NORMATIVE_REFERENCE_RELATIONS,
  NORMATIVE_REFERENCE_RESOLUTION_STATUS,
};
