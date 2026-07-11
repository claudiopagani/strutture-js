import { performance } from "node:perf_hooks";

import {
  CrackedSectionDeflectionAnalysis,
  SingleBeamAnalysis,
  createNTC2018BeamCombinations,
} from "../src/index.js";
import { createFixedFixedRcDeflectionExample } from "../examples/rc-deflection-report-common.js";

function parsePositiveInteger(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  if (!argument) {
    return fallback;
  }

  const value = Number(argument.slice(prefix.length));

  if (!Number.isInteger(value) || value < (name === "warmup" ? 0 : 1)) {
    throw new Error(`Use --${name}=<${name === "warmup" ? "non-negative" : "positive"} integer>.`);
  }

  return value;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

export function createPreparedCase({
  id,
  length = null,
  middleSupport = null,
  loadFactor,
  combinationTypes,
  elementCount,
}) {
  const fixture = createFixedFixedRcDeflectionExample();
  const loads = fixture.loads.map((load) => ({
    ...load,
    value: load.value * loadFactor,
  }));
  const combinations = createNTC2018BeamCombinations({
    loads,
    types: combinationTypes,
    idPrefix: id,
  });
  const beamModel = {
    ...fixture.beamInput,
    loads,
    combinations,
    discretization: {
      ...fixture.beamInput.discretization,
      elementCount,
    },
  };

  if (length != null && middleSupport != null) {
    beamModel.geometry = {
      start: { x: 0, y: 0 },
      end: { x: length, y: 0 },
    };
    beamModel.supports = [
      { id: "left", position: 0, type: "hinge" },
      { id: "middle", position: middleSupport, type: "roller" },
      { id: "right", position: length, type: "roller" },
    ];
  }

  const analysisResult = new SingleBeamAnalysis().analyze(beamModel);

  return {
    id,
    input: {
      beamId: id,
      analysisResult,
      section: fixture.section,
      concreteMaterial: fixture.concreteMaterial,
      reinforcementMaterial: fixture.reinforcementMaterial,
      serviceability: fixture.serviceability,
      mesh: { targetFiberCount: 80 },
      solver: { tolerance: 1e-2, maxIterations: 50 },
      beamModel,
    },
  };
}

export function measureCase(prepared, { runs, warmup }) {
  const analyze = () =>
    new CrackedSectionDeflectionAnalysis().analyze(prepared.input);

  for (let index = 0; index < warmup; index += 1) {
    analyze();
  }

  const samples = [];
  let lastResult = null;

  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();

    lastResult = analyze();
    samples.push(performance.now() - startedAt);
  }

  const metrics = lastResult.outputs.performance;

  return {
    case: prepared.id,
    medianMs: Number(median(samples).toFixed(2)),
    minMs: Number(Math.min(...samples).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2)),
    curveBuilds: metrics.curveBuildCount,
    curveCacheHits: metrics.curveCacheHitCount,
    sectionSolves: metrics.curveSectionSolveCount,
    curveBuildMs: Number(metrics.curveBuildElapsedMs.toFixed(2)),
    femSolves: metrics.femSolveCount,
    femSolveMs: Number(metrics.femSolveElapsedMs.toFixed(2)),
    iterationMs: Number(metrics.hyperstaticIterationElapsedMs.toFixed(2)),
  };
}

export function runHyperstaticDeflectionBenchmark({
  runs = 5,
  warmup = 1,
} = {}) {
  const cases = [
    createPreparedCase({
      id: "fixed-fixed",
      loadFactor: 5,
      combinationTypes: [
        "SLE_RARE",
        "SLE_FREQUENT",
        "SLE_QUASI_PERMANENT",
      ],
      elementCount: 20,
    }),
    createPreparedCase({
      id: "continuous-1-to-1.5",
      length: 12.5,
      middleSupport: 5,
      loadFactor: 4,
      combinationTypes: ["SLE_QUASI_PERMANENT"],
      elementCount: 50,
    }),
  ];
  const rows = cases.map((item) =>
    measureCase(item, { runs, warmup }),
  );

  return rows;
}

function main() {
  const runs = parsePositiveInteger("runs", 5);
  const warmup = parsePositiveInteger("warmup", 1);
  const rows = runHyperstaticDeflectionBenchmark({ runs, warmup });

  console.log(
    `RC hyperstatic deflection benchmark (${runs} run(s), ${warmup} warmup)`,
  );
  console.table(rows);
}

if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/benchmark-rc-hyperstatic-deflection.js")
) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
