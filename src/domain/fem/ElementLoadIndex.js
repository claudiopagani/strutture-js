const EMPTY_ELEMENT_LOADS = Object.freeze([]);

function resolveElementTarget(load) {
  return load?.element ?? load?.target ?? null;
}

function elementKey(element) {
  return element?.id ?? element;
}

/**
 * Builds an O(loads) lookup reused by assembly and result sampling.
 * Element ids retain the matching semantics historically used by the FEM
 * pipeline, while elements without ids are matched by object identity.
 */
export function createElementLoadIndex(loads = []) {
  if (!Array.isArray(loads)) {
    throw new Error("Element load indexing requires a loads array.");
  }

  const loadsByElement = new Map();

  for (const load of loads) {
    const target = resolveElementTarget(load);

    if (!target) {
      continue;
    }

    const key = elementKey(target);
    const indexedLoads = loadsByElement.get(key);

    if (indexedLoads) {
      indexedLoads.push(load);
    } else {
      loadsByElement.set(key, [load]);
    }
  }

  return {
    get(element) {
      if (!element) {
        return EMPTY_ELEMENT_LOADS;
      }

      return loadsByElement.get(elementKey(element)) ?? EMPTY_ELEMENT_LOADS;
    },
  };
}
