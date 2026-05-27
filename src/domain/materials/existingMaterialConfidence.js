export const EXISTING_MATERIAL_CONFIDENCE_LEVELS = Object.freeze({
  LC1: Object.freeze({
    level: 1,
    label: "LC1",
    confidenceFactor: 1.35,
    description: "conoscenza limitata",
  }),
  LC2: Object.freeze({
    level: 2,
    label: "LC2",
    confidenceFactor: 1.2,
    description: "conoscenza adeguata",
  }),
  LC3: Object.freeze({
    level: 3,
    label: "LC3",
    confidenceFactor: 1,
    description: "conoscenza accurata",
  }),
});

const KNOWLEDGE_LEVEL_ALIASES = Object.freeze({
  "1": "LC1",
  LC1: "LC1",
  lc1: "LC1",
  "2": "LC2",
  LC2: "LC2",
  lc2: "LC2",
  "3": "LC3",
  LC3: "LC3",
  lc3: "LC3",
});

export function normalizeExistingMaterialKnowledgeLevel(knowledgeLevel = "LC1") {
  const normalized = KNOWLEDGE_LEVEL_ALIASES[knowledgeLevel];

  if (!normalized) {
    throw new Error(`Unsupported existing material knowledge level: ${knowledgeLevel}.`);
  }

  return normalized;
}

export function resolveExistingMaterialState({
  existing = false,
  knowledgeLevel = "LC1",
  confidenceFactor = null,
} = {}) {
  if (!existing) {
    return {
      existing: false,
      knowledgeLevel: null,
      confidenceFactor: 1,
      knowledgeLevelDescription: null,
    };
  }

  const normalizedKnowledgeLevel =
    normalizeExistingMaterialKnowledgeLevel(knowledgeLevel);
  const preset = EXISTING_MATERIAL_CONFIDENCE_LEVELS[normalizedKnowledgeLevel];
  const resolvedConfidenceFactor = confidenceFactor == null
    ? preset.confidenceFactor
    : confidenceFactor;

  if (
    !Number.isFinite(resolvedConfidenceFactor) ||
    resolvedConfidenceFactor <= 0
  ) {
    throw new Error("Existing material confidenceFactor must be positive.");
  }

  return {
    existing: true,
    knowledgeLevel: normalizedKnowledgeLevel,
    confidenceFactor: resolvedConfidenceFactor,
    knowledgeLevelDescription: preset.description,
  };
}

export function characteristicValueFromExistingMean(meanValue, confidenceFactor) {
  if (meanValue == null) {
    return meanValue;
  }

  if (!Number.isFinite(meanValue)) {
    throw new Error("Existing material mean value must be finite.");
  }

  if (!Number.isFinite(confidenceFactor) || confidenceFactor <= 0) {
    throw new Error("Existing material confidenceFactor must be positive.");
  }

  return meanValue / confidenceFactor;
}
