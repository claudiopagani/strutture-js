import { build } from "esbuild";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const defaultCasesPath = path.join(__dirname, "cases.json");
const defaultIterations = 25;
const defaultWarmup = 5;

function parseArgs(argv) {
  const options = {
    casesPath: defaultCasesPath,
    caseIds: [],
    iterations: defaultIterations,
    warmup: defaultWarmup,
    json: false,
    list: false,
    dumpModelsPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`${arg} requires a value.`);
      }
      return argv[index];
    };

    if (arg === "--cases") {
      options.casesPath = path.resolve(repoRoot, next());
    } else if (arg === "--case") {
      options.caseIds.push(next());
    } else if (arg === "--iterations") {
      options.iterations = Number.parseInt(next(), 10);
    } else if (arg === "--warmup") {
      options.warmup = Number.parseInt(next(), 10);
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--dump-models") {
      options.dumpModelsPath = path.resolve(repoRoot, next());
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.iterations) || options.iterations < 1) {
    throw new Error("--iterations must be a positive integer.");
  }

  if (!Number.isInteger(options.warmup) || options.warmup < 0) {
    throw new Error("--warmup must be a non-negative integer.");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node benchmarks/strutture-js-spa/run.mjs [options]

Options:
  --list                    Show available cases.
  --case <id>               Run only one case. Repeatable.
  --iterations <n>          Measured iterations per operation. Default: ${defaultIterations}.
  --warmup <n>              Warmup iterations per operation. Default: ${defaultWarmup}.
  --json                    Print machine-readable JSON.
  --dump-models <file>      Write expanded SPA state and serializable strutture-js models/results.
  --cases <file>            Use a different cases JSON file.
`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return clone(patch);
  }

  const output = clone(base);

  for (const [key, value] of Object.entries(patch)) {
    output[key] = isPlainObject(value) && isPlainObject(output[key])
      ? deepMerge(output[key], value)
      : clone(value);
  }

  return output;
}

function expandProjectState(benchmark, benchmarkCase) {
  return deepMerge(benchmark.baseProjectState, benchmarkCase.projectPatch ?? {});
}

function sorted(values) {
  return [...values].sort((first, second) => first - second);
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return null;
  }

  const ordered = sorted(values);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ratio * ordered.length) - 1),
  );

  return ordered[index];
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function stats(samples) {
  const total = samples.reduce((sum, value) => sum + value, 0);

  return {
    iterations: samples.length,
    minMs: round(Math.min(...samples)),
    medianMs: round(percentile(samples, 0.5)),
    meanMs: round(total / samples.length),
    p95Ms: round(percentile(samples, 0.95)),
    maxMs: round(Math.max(...samples)),
  };
}

function measure({ iterations, warmup, fn }) {
  for (let index = 0; index < warmup; index += 1) {
    fn();
  }

  const samples = [];

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    fn();
    samples.push(performance.now() - startedAt);
  }

  return stats(samples);
}

function summarizeResult(result) {
  const outputs = result?.outputs ?? {};

  return {
    kind: result?.kind ?? null,
    status: result?.status ?? null,
    fiberCount: outputs.fiberCount ?? null,
    pointCount: outputs.points?.length ?? outputs.generatedPointCount ?? null,
    warnings: result?.warnings ?? [],
  };
}

function toPlain(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (typeof value.toJSON === "function") {
    return toPlain(value.toJSON(), seen);
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item, seen));
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "function") {
      output[key] = toPlain(item, seen);
    }
  }

  return output;
}

async function loadAdapter() {
  const cacheRoot = path.join(repoRoot, "node_modules", ".cache");

  await mkdir(cacheRoot, { recursive: true });

  const tempDir = await mkdtemp(path.join(cacheRoot, "sca-strutture-benchmark-"));
  const outfile = path.join(tempDir, "adapter-bundle.mjs");

  await build({
    entryPoints: [path.join(__dirname, "adapter-entry.js")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["strutture-js"],
    logLevel: "silent",
  });

  const adapter = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);

  return {
    adapter,
    cleanup: () => rm(tempDir, { recursive: true, force: true }),
  };
}

function runFullEvaluation(adapter, projectState, benchmarkCase) {
  const sectionBuild = adapter.buildRcSection({
    sectionType: projectState.sectionType,
    sectionInputs: projectState.sectionInputs,
    materialState: projectState.materialState,
  });
  const analysis = adapter.runRcSectionAnalysis({
    sectionBuild,
    analysisState: projectState.analysisState,
  });
  const shear = benchmarkCase.includeShear
    ? adapter.runRcShearVerification({
        sectionBuild,
        analysisState: projectState.analysisState,
        overrides: projectState.shearOverrides,
        method: projectState.useCosenzaShear
          ? adapter.COSENZA_SHEAR_METHOD
          : "ntc2018",
      })
    : null;

  return { sectionBuild, analysis, shear };
}

function benchmarkOneCase({ adapter, benchmark, benchmarkCase, options }) {
  const projectState = expandProjectState(benchmark, benchmarkCase);
  const sectionInput = {
    sectionType: projectState.sectionType,
    sectionInputs: projectState.sectionInputs,
    materialState: projectState.materialState,
  };
  const cachedSectionBuild = adapter.buildRcSection(sectionInput);
  const analysisInput = {
    sectionBuild: cachedSectionBuild,
    analysisState: projectState.analysisState,
  };
  const initial = adapter.runRcSectionAnalysis(analysisInput);
  const result = {
    id: benchmarkCase.id,
    title: benchmarkCase.title,
    analysisType: projectState.analysisState.type,
    sectionType: projectState.sectionType,
    summary: summarizeResult(initial),
    operations: {
      sectionBuild: measure({
        iterations: options.iterations,
        warmup: options.warmup,
        fn: () => adapter.buildRcSection(sectionInput),
      }),
      analysisOnly: measure({
        iterations: options.iterations,
        warmup: options.warmup,
        fn: () => adapter.runRcSectionAnalysis(analysisInput),
      }),
      fullSpaEvaluation: measure({
        iterations: options.iterations,
        warmup: options.warmup,
        fn: () => runFullEvaluation(adapter, projectState, benchmarkCase),
      }),
    },
  };

  return result;
}

async function writeModelDump({ adapter, benchmark, cases, outputPath }) {
  const documents = cases.map((benchmarkCase) => {
    const projectState = expandProjectState(benchmark, benchmarkCase);
    const sectionBuild = adapter.buildRcSection({
      sectionType: projectState.sectionType,
      sectionInputs: projectState.sectionInputs,
      materialState: projectState.materialState,
    });
    const analysisResult = adapter.runRcSectionAnalysis({
      sectionBuild,
      analysisState: projectState.analysisState,
    });
    const publicModel = benchmarkCase.publicWorkflowAnalysisType
      ? adapter.buildPublicWorkflowModel({
          sectionBuild,
          analysisState: projectState.analysisState,
          analysisType: benchmarkCase.publicWorkflowAnalysisType,
        })
      : null;

    return {
      id: benchmarkCase.id,
      title: benchmarkCase.title,
      projectState,
      publicWorkflowAnalysisType: benchmarkCase.publicWorkflowAnalysisType ?? null,
      publicWorkflowModel: publicModel ? toPlain(publicModel) : null,
      section: toPlain(sectionBuild.section),
      materials: toPlain(sectionBuild.materials),
      analysisResultSummary: summarizeResult(analysisResult),
    };
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: benchmark.name,
      cases: documents,
    }, null, 2)}\n`,
  );
}

function printHuman(results) {
  for (const result of results) {
    console.log(`\n${result.id}`);
    console.log(`${result.title}`);
    console.log(
      `section=${result.sectionType} analysis=${result.analysisType} status=${result.summary.status}`,
    );
    console.table(
      Object.entries(result.operations).map(([operation, values]) => ({
        operation,
        iterations: values.iterations,
        minMs: values.minMs,
        medianMs: values.medianMs,
        meanMs: values.meanMs,
        p95Ms: values.p95Ms,
        maxMs: values.maxMs,
      })),
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const benchmark = JSON.parse(await readFile(options.casesPath, "utf8"));
  const selectedCases = options.caseIds.length === 0
    ? benchmark.cases
    : benchmark.cases.filter((item) => options.caseIds.includes(item.id));

  if (options.list) {
    for (const item of benchmark.cases) {
      console.log(`${item.id}: ${item.title}`);
    }
    return;
  }

  if (selectedCases.length === 0) {
    throw new Error("No benchmark cases selected.");
  }

  const { adapter, cleanup } = await loadAdapter();

  try {
    const results = selectedCases.map((benchmarkCase) =>
      benchmarkOneCase({
        adapter,
        benchmark,
        benchmarkCase,
        options,
      }),
    );

    if (options.dumpModelsPath) {
      await writeModelDump({
        adapter,
        benchmark,
        cases: selectedCases,
        outputPath: options.dumpModelsPath,
      });
    }

    if (options.json) {
      console.log(JSON.stringify({
        generatedAt: new Date().toISOString(),
        iterations: options.iterations,
        warmup: options.warmup,
        results,
      }, null, 2));
    } else {
      printHuman(results);
      if (options.dumpModelsPath) {
        console.log(`\nModel dump written to ${path.relative(repoRoot, options.dumpModelsPath)}`);
      }
    }
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
