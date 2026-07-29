export const NORMATIVE_REFERENCE_RELATIONS = Object.freeze({
  CLARIFIES: "clarifies",
  EXCLUDES: "excludes",
  IMPLEMENTS: "implements",
  INFORMS: "informs",
  TESTS: "tests",
  VALIDATES: "validates",
});

export const NORMATIVE_REFERENCE_RESOLUTION_STATUS = Object.freeze({
  OUTSIDE_CORPUS: "outside-corpus",
  RESOLVED: "resolved",
});

const RELATIONS = new Set(Object.values(NORMATIVE_REFERENCE_RELATIONS));
const RESOLUTION_STATUSES = new Set(
  Object.values(NORMATIVE_REFERENCE_RESOLUTION_STATUS),
);
const UNIT_ID_PATTERN =
  /^urn:structural-codes:it:unit:[a-z0-9][a-z0-9:._-]*$/;
const ASSET_ID_PATTERN =
  /^urn:structural-codes:it:asset:(?:formula|table|figure):[a-z0-9][a-z0-9:._-]*$/;

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalNonEmptyString(value, label) {
  return value == null ? null : nonEmptyString(value, label);
}

function normalizedAssetIds(assetIds) {
  if (!Array.isArray(assetIds)) {
    throw new Error("assetIds must be an array.");
  }

  const normalized = assetIds.map((assetId) =>
    nonEmptyString(assetId, "assetId"));

  for (const assetId of normalized) {
    if (!ASSET_ID_PATTERN.test(assetId)) {
      throw new Error(`Invalid normative asset id: ${assetId}.`);
    }
  }

  if (new Set(normalized).size !== normalized.length) {
    throw new Error("assetIds must not contain duplicates.");
  }

  return Object.freeze(normalized);
}

/**
 * Create a small, serializable normative reference.
 *
 * The URN is the stable identity. `href` is only a human-readable resolver and
 * may change independently from the referenced normative unit.
 */
export function createNormativeReference({
  corpusId,
  corpusRevision,
  corpusStatus,
  documentId,
  unitId = null,
  assetIds = [],
  relation,
  citation,
  href,
  resolutionStatus = NORMATIVE_REFERENCE_RESOLUTION_STATUS.RESOLVED,
}) {
  const normalizedResolutionStatus = nonEmptyString(
    resolutionStatus,
    "resolutionStatus",
  );
  if (!RESOLUTION_STATUSES.has(normalizedResolutionStatus)) {
    throw new Error(
      `Unsupported normative reference resolution status: ${resolutionStatus}.`,
    );
  }

  const normalizedRelation = nonEmptyString(relation, "relation");
  if (!RELATIONS.has(normalizedRelation)) {
    throw new Error(`Unsupported normative reference relation: ${relation}.`);
  }

  const normalizedUnitId = optionalNonEmptyString(unitId, "unitId");
  const normalizedAssets = normalizedAssetIds(assetIds);

  if (normalizedResolutionStatus ===
      NORMATIVE_REFERENCE_RESOLUTION_STATUS.RESOLVED) {
    if (!normalizedUnitId || !UNIT_ID_PATTERN.test(normalizedUnitId)) {
      throw new Error(
        "A resolved normative reference requires a canonical unitId.",
      );
    }
    nonEmptyString(corpusRevision, "corpusRevision");
    nonEmptyString(corpusStatus, "corpusStatus");
  } else if (normalizedUnitId !== null || normalizedAssets.length > 0) {
    throw new Error(
      "An outside-corpus reference cannot claim canonical unit or asset ids.",
    );
  }

  const normalizedHref = optionalNonEmptyString(href, "href");
  if (normalizedHref !== null) {
    try {
      new URL(normalizedHref);
    } catch {
      throw new Error(`Invalid normative reference href: ${href}.`);
    }
  }

  return Object.freeze({
    corpusId: nonEmptyString(corpusId, "corpusId"),
    corpusRevision: optionalNonEmptyString(
      corpusRevision,
      "corpusRevision",
    ),
    corpusStatus: optionalNonEmptyString(corpusStatus, "corpusStatus"),
    documentId: nonEmptyString(documentId, "documentId"),
    unitId: normalizedUnitId,
    assetIds: normalizedAssets,
    relation: normalizedRelation,
    citation: nonEmptyString(citation, "citation"),
    href: normalizedHref,
    resolutionStatus: normalizedResolutionStatus,
  });
}

export function cloneNormativeReference(reference) {
  return {
    ...reference,
    assetIds: [...reference.assetIds],
  };
}

export function cloneNormativeReferences(references = []) {
  if (!Array.isArray(references)) {
    throw new Error("normative references must be an array.");
  }

  return references.map(cloneNormativeReference);
}

function referenceIdentity(reference) {
  return JSON.stringify([
    reference.documentId,
    reference.unitId,
    reference.assetIds,
    reference.relation,
    reference.citation,
  ]);
}

/**
 * Add structured references to result/check metadata without losing existing
 * metadata or legacy textual references.
 */
export function withNormativeReferences(metadata = {}, references = []) {
  const combined = [
    ...(metadata.normativeReferences ?? []),
    ...references,
  ];
  const seen = new Set();
  const unique = [];

  for (const reference of combined) {
    const identity = referenceIdentity(reference);
    if (!seen.has(identity)) {
      seen.add(identity);
      unique.push(cloneNormativeReference(reference));
    }
  }

  return {
    ...metadata,
    normativeReferences: unique,
  };
}
