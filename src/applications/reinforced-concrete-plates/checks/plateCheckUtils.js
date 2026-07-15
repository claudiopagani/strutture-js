export function enrichPlateCheck(check, {
  id,
  direction,
  face,
  analysisType,
  combinationType,
  stateId,
  method,
} = {}) {
  return {
    ...check,
    id: id ?? check.id,
    direction,
    face,
    analysisType,
    combinationType,
    method,
    metadata: {
      ...(check.metadata ?? {}),
      sourceMethod: check.metadata?.method ?? check.method ?? null,
      direction,
      face,
      analysisType,
      combinationType,
      stateId,
      method,
    },
  };
}

export function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}
