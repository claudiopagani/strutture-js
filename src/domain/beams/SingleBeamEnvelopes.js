function selectExtreme(current, candidate, valueSelector, compare) {
  if (!candidate) {
    return current;
  }

  if (!current || compare(valueSelector(candidate), valueSelector(current))) {
    return candidate;
  }

  return current;
}

function annotateEnvelopeSample(result, sample, quantity, value) {
  if (!sample) {
    return null;
  }

  return {
    resultId: result.id,
    resultType: result.resultType,
    limitState: result.context?.limitState ?? null,
    combinationType: result.context?.combinationType ?? null,
    quantity,
    value,
    sample: { ...sample },
  };
}

function createEnvelope(resultsById) {
  const results = Object.values(resultsById ?? {});
  const state = {
    maxAxialForce: null,
    minAxialForce: null,
    maxShearForce: null,
    minShearForce: null,
    maxShearForceY: null,
    minShearForceY: null,
    maxShearForceZ: null,
    minShearForceZ: null,
    maxAbsShearForceY: null,
    maxAbsShearForceZ: null,
    maxBendingMoment: null,
    minBendingMoment: null,
    maxAbsBendingMoment: null,
    maxBendingMomentY: null,
    minBendingMomentY: null,
    maxBendingMomentZ: null,
    minBendingMomentZ: null,
    maxAbsBendingMomentY: null,
    maxAbsBendingMomentZ: null,
    maxAbsVerticalDisplacement: null,
    maxHorizontalReaction: null,
    minHorizontalReaction: null,
    maxVerticalReaction: null,
    minVerticalReaction: null,
    maxSupportMomentReaction: null,
    minSupportMomentReaction: null,
    maxAbsHorizontalReaction: null,
    maxAbsVerticalReaction: null,
    maxAbsSupportMomentReaction: null,
  };

  for (const result of results) {
    const forces = result.internalForces ?? {};
    const displacements = result.displacements ?? {};
    const reactions = result.reactions ?? {};

    state.maxAxialForce = selectExtreme(
      state.maxAxialForce,
      annotateEnvelopeSample(
        result,
        forces.maxAxialForce,
        "n",
        forces.maxAxialForce?.n,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minAxialForce = selectExtreme(
      state.minAxialForce,
      annotateEnvelopeSample(
        result,
        forces.minAxialForce,
        "n",
        forces.minAxialForce?.n,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxShearForce = selectExtreme(
      state.maxShearForce,
      annotateEnvelopeSample(
        result,
        forces.maxShearForce,
        "v",
        forces.maxShearForce?.v,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minShearForce = selectExtreme(
      state.minShearForce,
      annotateEnvelopeSample(
        result,
        forces.minShearForce,
        "v",
        forces.minShearForce?.v,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxShearForceY = selectExtreme(
      state.maxShearForceY,
      annotateEnvelopeSample(result, forces.maxShearForceY, "vY", forces.maxShearForceY?.vY),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minShearForceY = selectExtreme(
      state.minShearForceY,
      annotateEnvelopeSample(result, forces.minShearForceY, "vY", forces.minShearForceY?.vY),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxShearForceZ = selectExtreme(
      state.maxShearForceZ,
      annotateEnvelopeSample(result, forces.maxShearForceZ, "vZ", forces.maxShearForceZ?.vZ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minShearForceZ = selectExtreme(
      state.minShearForceZ,
      annotateEnvelopeSample(result, forces.minShearForceZ, "vZ", forces.minShearForceZ?.vZ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxBendingMoment = selectExtreme(
      state.maxBendingMoment,
      annotateEnvelopeSample(
        result,
        forces.maxBendingMoment,
        "m",
        forces.maxBendingMoment?.m,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minBendingMoment = selectExtreme(
      state.minBendingMoment,
      annotateEnvelopeSample(
        result,
        forces.minBendingMoment,
        "m",
        forces.minBendingMoment?.m,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxBendingMomentY = selectExtreme(
      state.maxBendingMomentY,
      annotateEnvelopeSample(result, forces.maxBendingMomentY, "mY", forces.maxBendingMomentY?.mY),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minBendingMomentY = selectExtreme(
      state.minBendingMomentY,
      annotateEnvelopeSample(result, forces.minBendingMomentY, "mY", forces.minBendingMomentY?.mY),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxBendingMomentZ = selectExtreme(
      state.maxBendingMomentZ,
      annotateEnvelopeSample(result, forces.maxBendingMomentZ, "mZ", forces.maxBendingMomentZ?.mZ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minBendingMomentZ = selectExtreme(
      state.minBendingMomentZ,
      annotateEnvelopeSample(result, forces.minBendingMomentZ, "mZ", forces.minBendingMomentZ?.mZ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxAbsBendingMoment = selectExtreme(
      state.maxAbsBendingMoment,
      annotateEnvelopeSample(
        result,
        forces.maxAbsBendingMoment,
        "absM",
        Math.abs(forces.maxAbsBendingMoment?.m ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsBendingMomentY = selectExtreme(
      state.maxAbsBendingMomentY,
      annotateEnvelopeSample(
        result,
        forces.maxAbsBendingMomentY,
        "absMY",
        Math.abs(forces.maxAbsBendingMomentY?.mY ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsBendingMomentZ = selectExtreme(
      state.maxAbsBendingMomentZ,
      annotateEnvelopeSample(
        result,
        forces.maxAbsBendingMomentZ,
        "absMZ",
        Math.abs(forces.maxAbsBendingMomentZ?.mZ ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsShearForceY = selectExtreme(
      state.maxAbsShearForceY,
      annotateEnvelopeSample(
        result,
        forces.maxAbsShearForceY,
        "absVY",
        Math.abs(forces.maxAbsShearForceY?.vY ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsShearForceZ = selectExtreme(
      state.maxAbsShearForceZ,
      annotateEnvelopeSample(
        result,
        forces.maxAbsShearForceZ,
        "absVZ",
        Math.abs(forces.maxAbsShearForceZ?.vZ ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsVerticalDisplacement = selectExtreme(
      state.maxAbsVerticalDisplacement,
      annotateEnvelopeSample(
        result,
        displacements.maxAbsVerticalDisplacement,
        "absUy",
        Math.abs(displacements.maxAbsVerticalDisplacement?.uy ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxHorizontalReaction = selectExtreme(
      state.maxHorizontalReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxHorizontalReaction,
        "rx",
        reactions.maxHorizontalReaction?.ux,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minHorizontalReaction = selectExtreme(
      state.minHorizontalReaction,
      annotateEnvelopeSample(
        result,
        reactions.minHorizontalReaction,
        "rx",
        reactions.minHorizontalReaction?.ux,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxVerticalReaction = selectExtreme(
      state.maxVerticalReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxVerticalReaction,
        "ry",
        reactions.maxVerticalReaction?.uy,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minVerticalReaction = selectExtreme(
      state.minVerticalReaction,
      annotateEnvelopeSample(
        result,
        reactions.minVerticalReaction,
        "ry",
        reactions.minVerticalReaction?.uy,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxSupportMomentReaction = selectExtreme(
      state.maxSupportMomentReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxSupportMomentReaction,
        "mrz",
        reactions.maxSupportMomentReaction?.rz,
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.minSupportMomentReaction = selectExtreme(
      state.minSupportMomentReaction,
      annotateEnvelopeSample(
        result,
        reactions.minSupportMomentReaction,
        "mrz",
        reactions.minSupportMomentReaction?.rz,
      ),
      (item) => item.value,
      (a, b) => a < b,
    );
    state.maxAbsHorizontalReaction = selectExtreme(
      state.maxAbsHorizontalReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxAbsHorizontalReaction,
        "absRx",
        Math.abs(reactions.maxAbsHorizontalReaction?.ux ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsVerticalReaction = selectExtreme(
      state.maxAbsVerticalReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxAbsVerticalReaction,
        "absRy",
        Math.abs(reactions.maxAbsVerticalReaction?.uy ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
    state.maxAbsSupportMomentReaction = selectExtreme(
      state.maxAbsSupportMomentReaction,
      annotateEnvelopeSample(
        result,
        reactions.maxAbsSupportMomentReaction,
        "absMrz",
        Math.abs(reactions.maxAbsSupportMomentReaction?.rz ?? 0),
      ),
      (item) => item.value,
      (a, b) => a > b,
    );
  }

  return state;
}

export function createEnvelopes(loadCases, combinations) {
  const allResults = {
    ...loadCases,
    ...combinations,
  };
  const ulsCombinations = Object.fromEntries(
    Object.entries(combinations).filter(
      ([, result]) => result.context?.limitState === "ULS",
    ),
  );
  const sleCombinations = Object.fromEntries(
    Object.entries(combinations).filter(
      ([, result]) => result.context?.limitState === "SLE",
    ),
  );

  return {
    loadCases: createEnvelope(loadCases),
    combinations: createEnvelope(combinations),
    uls: createEnvelope(ulsCombinations),
    sle: createEnvelope(sleCombinations),
    all: createEnvelope(allResults),
  };
}
