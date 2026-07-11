import { performance } from "node:perf_hooks";

import { BandedLinearSolver } from "../src/domain/math/BandedLinearSolver.js";
import { createElementLoadIndex } from "../src/domain/fem/ElementLoadIndex.js";
import { runHyperstaticDeflectionBenchmark } from "./benchmark-rc-hyperstatic-deflection.js";
import { runMomentCurvatureBenchmark } from "./benchmark-rc-moment-curvature.js";

const failures = [];

function budget(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const momentRows = runMomentCurvatureBenchmark({
  runs: 1,
  targetFiberCounts: [120, 1000],
  pointCounts: [15],
  postUltimateResponses: ["zero-stress"],
});

for (const row of momentRows) {
  budget(
    row.calls <= 900,
    `Moment-curvature ${row.actualFibers} fibers exceeded 900 integration calls (${row.calls}).`,
  );
  budget(
    row.detailCalls <= 80,
    `Moment-curvature ${row.actualFibers} fibers exceeded 80 detailed calls (${row.detailCalls}).`,
  );
  budget(
    row.avgMs <= 1000,
    `Moment-curvature ${row.actualFibers} fibers exceeded 1000 ms (${row.avgMs}).`,
  );
}

const hyperstaticRows = runHyperstaticDeflectionBenchmark({
  runs: 2,
  warmup: 1,
});
const fixedFixed = hyperstaticRows.find((row) => row.case === "fixed-fixed");
const continuous = hyperstaticRows.find(
  (row) => row.case === "continuous-1-to-1.5",
);

budget(fixedFixed?.curveBuilds === 2, "Fixed-fixed must build exactly two curves.");
budget(fixedFixed?.curveCacheHits >= 1, "Fixed-fixed must reuse a compatible curve.");
budget(
  fixedFixed?.sectionSolves <= 400,
  `Fixed-fixed exceeded 400 section solves (${fixedFixed?.sectionSolves}).`,
);
budget(
  fixedFixed?.femSolves <= 45,
  `Fixed-fixed exceeded 45 FEM solves (${fixedFixed?.femSolves}).`,
);
budget(
  continuous?.sectionSolves <= 210,
  `Continuous beam exceeded 210 section solves (${continuous?.sectionSolves}).`,
);
budget(
  continuous?.femSolves <= 16,
  `Continuous beam exceeded 16 FEM solves (${continuous?.femSolves}).`,
);
budget(
  hyperstaticRows.every((row) => row.medianMs <= 1500),
  "A hyperstatic benchmark exceeded the 1500 ms CI ceiling.",
);

const elements = Array.from({ length: 480 }, (_, index) => ({
  id: `element-${index}`,
  nodes: [],
}));
const loads = elements.map((element, index) => ({
  id: `load-${index}`,
  element,
}));
const lookupStartedAt = performance.now();
const loadIndex = createElementLoadIndex(loads);
let matchedLoads = 0;
for (const element of elements) {
  matchedLoads += loadIndex.get(element).length;
}
const indexedLookupMs = performance.now() - lookupStartedAt;

budget(matchedLoads === 480, "Element-load index returned an invalid load count.");
budget(
  indexedLookupMs <= 100,
  `Element-load index exceeded 100 ms (${indexedLookupMs.toFixed(2)}).`,
);

const size = 300;
const bandedMatrix = Array.from({ length: size }, (_, row) =>
  Array.from({ length: size }, (_, column) => {
    if (row === column) return 4;
    return Math.abs(row - column) === 1 ? -1 : 0;
  }),
);
const rhs = new Array(size).fill(1);
const bandedStartedAt = performance.now();
const factorization = new BandedLinearSolver().factorize(bandedMatrix);
const solution = factorization.solve(rhs);
const bandedElapsedMs = performance.now() - bandedStartedAt;

budget(factorization.bandwidth === 1, "Banded solver failed to detect bandwidth 1.");
budget(solution.every(Number.isFinite), "Banded solver returned non-finite values.");
budget(
  bandedElapsedMs <= 1000,
  `Banded 300x300 factorization exceeded 1000 ms (${bandedElapsedMs.toFixed(2)}).`,
);

console.table([
  ...momentRows.map((row) => ({
    case: `moment-curvature-${row.actualFibers}`,
    elapsedMs: row.avgMs,
    operations: row.calls,
  })),
  ...hyperstaticRows.map((row) => ({
    case: row.case,
    elapsedMs: row.medianMs,
    operations: row.sectionSolves + row.femSolves,
  })),
  {
    case: "element-load-index-480",
    elapsedMs: Number(indexedLookupMs.toFixed(2)),
    operations: matchedLoads,
  },
  {
    case: "banded-factorization-300",
    elapsedMs: Number(bandedElapsedMs.toFixed(2)),
    operations: factorization.bandwidth,
  },
]);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Performance budget failed: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Performance budgets passed.");
}
