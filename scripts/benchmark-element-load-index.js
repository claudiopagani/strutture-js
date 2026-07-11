import { performance } from "node:perf_hooks";

import { createElementLoadIndex } from "../src/domain/fem/ElementLoadIndex.js";

const SIZES = [60, 120, 240, 480];
const MEASURED_RUNS = 5;
const WARMUP_RUNS = 2;

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)];
}

function createScenario(size) {
  const elements = Array.from({ length: size }, (_, index) => ({
    id: `element-${index}`,
    nodes: [],
  }));
  const loads = elements.map((element, index) => ({
    id: `load-${index}`,
    element,
  }));

  return { elements, loads };
}

function legacyLookup({ elements, loads }) {
  let matchedLoadCount = 0;

  for (const element of elements) {
    matchedLoadCount += loads.filter(
      (load) => load.element?.id === element.id,
    ).length;
  }

  return matchedLoadCount;
}

function indexedLookup({ elements, loads }) {
  const index = createElementLoadIndex(loads);
  let matchedLoadCount = 0;

  for (const element of elements) {
    matchedLoadCount += index.get(element).length;
  }

  return matchedLoadCount;
}

function measure(scenario, lookup) {
  const iterations = Math.max(1, Math.ceil(20000 / scenario.elements.length));
  const startedAt = performance.now();
  let matchedLoadCount = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    matchedLoadCount += lookup(scenario);
  }

  if (matchedLoadCount !== scenario.elements.length * iterations) {
    throw new Error("Element-load benchmark lookup returned an invalid count.");
  }

  return performance.now() - startedAt;
}

const rows = SIZES.map((size) => {
  const scenario = createScenario(size);

  for (let warmup = 0; warmup < WARMUP_RUNS; warmup += 1) {
    legacyLookup(scenario);
    indexedLookup(scenario);
  }

  const legacyTimes = [];
  const indexedTimes = [];

  for (let run = 0; run < MEASURED_RUNS; run += 1) {
    legacyTimes.push(measure(scenario, legacyLookup));
    indexedTimes.push(measure(scenario, indexedLookup));
  }

  const legacyMedianMs = median(legacyTimes);
  const indexedMedianMs = median(indexedTimes);

  return {
    elements: size,
    loads: size,
    legacyMedianMs: Number(legacyMedianMs.toFixed(3)),
    indexedMedianMs: Number(indexedMedianMs.toFixed(3)),
    speedup: Number((legacyMedianMs / indexedMedianMs).toFixed(1)),
  };
});

console.log(
  `Element-load lookup benchmark (${MEASURED_RUNS} measured run(s))`,
);
console.table(rows);
