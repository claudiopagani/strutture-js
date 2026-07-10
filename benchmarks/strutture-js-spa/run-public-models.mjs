import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  CircularSection,
  ConcreteMaterial,
  PolygonSection,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  SteelMaterial,
  TSection,
  runScaRcDeflectionAnalysis,
} from "../../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultModelsPath = path.join(__dirname, "models.generated.json");
const defaultIterations = 10;
const defaultWarmup = 3;
const units = Object.freeze({ force: "N", length: "mm" });

const SPA_ANALYSIS_TYPES = new Map([
  ["biaxialDomain", "uls-biaxial-domain"],
  ["serviceStress", "service-stress"],
  ["momentCurvature", "moment-curvature"],
]);

function parseArgs(argv) {
  const options = {
    modelsPath: defaultModelsPath,
    caseIds: [],
    iterations: defaultIterations,
    warmup: defaultWarmup,
    json: false,
    list: false,
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

    if (arg === "--models") {
      options.modelsPath = path.resolve(next());
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
  node benchmarks/strutture-js-spa/run-public-models.mjs [options]

Options:
  --list                    Show available cases and local support status.
  --case <id>               Run only one case. Repeatable.
  --iterations <n>          Measured iterations per operation. Default: ${defaultIterations}.
  --warmup <n>              Warmup iterations per operation. Default: ${defaultWarmup}.
  --json                    Print machine-readable JSON.
  --models <file>           Use a different models.generated.json dump.
`);
}

function parseLocaleNumber(value, fallback = null) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = typeof value === "number"
    ? value
    : Number.parseFloat(String(value).replace(",", "."));

  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanMetadata(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output = {};

  for (const [key, item] of Object.entries(value)) {
    if (item === "[Circular]") {
      continue;
    }

    output[key] =
      item != null && typeof item === "object" && !Array.isArray(item)
        ? cleanMetadata(item)
        : item;
  }

  return output;
}

function reviveConcreteMaterial(data) {
  return new ConcreteMaterial({
    id: data.id,
    name: data.name,
    density: data.density,
    elasticModulus: data.elasticModulus,
    shearModulus: data.shearModulus,
    poissonRatio: data.poissonRatio,
    thermalExpansion: data.thermalExpansion,
    strengthClass: data.strengthClass,
    fck: data.fck,
    fcm: data.fcm,
    fcd: data.fcd,
    fctm: data.fctm,
    existing: data.existing,
    knowledgeLevel: data.knowledgeLevel ?? "LC1",
    confidenceFactor: data.confidenceFactor,
    meanProperties: data.meanProperties ?? {},
    units: data.units ?? units,
    metadata: cleanMetadata(data.metadata),
  });
}

function reviveSteelMaterial(data) {
  return new SteelMaterial({
    id: data.id,
    name: data.name,
    density: data.density,
    elasticModulus: data.elasticModulus,
    shearModulus: data.shearModulus,
    poissonRatio: data.poissonRatio,
    thermalExpansion: data.thermalExpansion,
    grade: data.grade,
    fyMean: data.fyMean,
    ftMean: data.ftMean,
    fyk: data.fyk,
    fyd: data.fyd,
    ftk: data.ftk,
    ductilityClass: data.ductilityClass,
    elongationCharacteristic: data.elongationCharacteristic,
    ultimateStrain: data.ultimateStrain,
    existing: data.existing,
    knowledgeLevel: data.knowledgeLevel ?? "LC1",
    confidenceFactor: data.confidenceFactor,
    units: data.units ?? units,
    metadata: cleanMetadata(data.metadata),
  });
}

function reviveConcreteSection(data) {
  const sectionUnits = data.units ?? units;
  const metadata = cleanMetadata(data.metadata);
  const shape = data.metadata?.shape;

  if (shape === "rectangular") {
    return new RectangularSection({
      id: data.id,
      name: data.name,
      width: data.width,
      height: data.height,
      units: sectionUnits,
      metadata,
    });
  }

  if (shape === "t-section") {
    return new TSection({
      id: data.id,
      name: data.name,
      flangeWidth: data.flangeWidth,
      flangeThickness: data.flangeThickness,
      webWidth: data.webWidth,
      webHeight: data.webHeight,
      units: sectionUnits,
      metadata,
    });
  }

  if (shape === "circular") {
    return new CircularSection({
      id: data.id,
      name: data.name,
      diameter: data.diameter ?? data.width,
      units: sectionUnits,
      metadata,
    });
  }

  return new PolygonSection({
    id: data.id,
    name: data.name,
    points: data.outlinePoints,
    units: sectionUnits,
    metadata,
  });
}

function reviveRcSection(data, materialData = {}) {
  const concreteMaterial = reviveConcreteMaterial(
    materialData.concreteMaterial ?? data.concreteMaterial,
  );
  const reinforcementMaterial = reviveSteelMaterial(
    materialData.reinforcementMaterial ?? data.reinforcementMaterial,
  );
  const reinforcementBars = (data.reinforcementBars ?? []).map(
    (bar) =>
      new ReinforcementBar({
        id: bar.id,
        name: bar.name,
        diameter: bar.diameter,
        area: bar.area,
        grade: bar.grade,
        material: reinforcementMaterial,
        y: bar.y,
        z: bar.z,
        units: bar.units ?? units,
        metadata: cleanMetadata(bar.metadata),
      }),
  );

  return new ReinforcedConcreteSection({
    id: data.id,
    name: data.name,
    concreteSection: reviveConcreteSection(data.concreteSection),
    reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: data.referenceModularRatio ?? 15,
    units: data.units ?? units,
    metadata: cleanMetadata(data.metadata),
  });
}

function revivePublicModel(modelData) {
  const section = reviveRcSection(modelData.section, modelData.materials);

  return new ReinforcedConcreteSectionModel({
    ...modelData,
    section,
    materials: {
      concreteMaterial: section.concreteMaterial,
      reinforcementMaterial: section.reinforcementMaterial,
    },
    metadata: cleanMetadata(modelData.metadata),
  });
}

function modelFromSpaDump(benchmarkCase) {
  const state = benchmarkCase.projectState;
  const analysisType = SPA_ANALYSIS_TYPES.get(state?.analysisState?.type);

  if (!analysisType) {
    return {
      skippedReason:
        "This SPA case has no equivalent public RC-section workflow in this repo.",
    };
  }

  const analysisState = state.analysisState;
  const section = reviveRcSection(benchmarkCase.section, benchmarkCase.materials);
  const nEdCompressionKn = parseLocaleNumber(analysisState.nEdCompressionKn, 0);

  return {
    model: new ReinforcedConcreteSectionModel({
      id: benchmarkCase.id,
      section,
      analysisType,
      materials: {
        concreteMaterial: section.concreteMaterial,
        reinforcementMaterial: section.reinforcementMaterial,
      },
      mesh: {
        targetFiberCount: parseLocaleNumber(analysisState.targetFiberCount, 100),
      },
      solver: {
        tolerance: 1e-6,
        maxIterations: 100,
      },
      actions: {
        nEd: -nEdCompressionKn * 1000,
        mxEd: parseLocaleNumber(analysisState.mxEdKnm, 0) * 1e6,
        myEd: parseLocaleNumber(analysisState.myEdKnm, 0) * 1e6,
      },
      analysisSettings: {
        angleCount: parseLocaleNumber(analysisState.angleCount, 32),
        modularRatio: parseLocaleNumber(analysisState.modularRatio, 15),
        pointCount: parseLocaleNumber(
          analysisState.momentCurvaturePointCount ?? analysisState.pointCount,
          41,
        ),
        compressedEdge: "top",
        ecu: section.concreteMaterial.metadata?.epsilonCu ?? 0.0035,
        ec2: section.concreteMaterial.metadata?.epsilonC2 ?? 0.002,
        esu: section.reinforcementMaterial.ultimateStrain ?? 0.0675,
        steelUltimateStrain:
          section.reinforcementMaterial.ultimateStrain ?? 0.0675,
      },
      referencePoint: {
        type: "concrete-centroid",
        coordinates: null,
      },
      units,
      metadata: {
        source: "benchmarks/strutture-js-spa/models.generated.json",
        sourceCaseId: benchmarkCase.id,
        sourceKind: "spa-dump-reconstructed-core-model",
      },
    }),
    sourceKind: "spa-dump-reconstructed-core-model",
  };
}

function serviceDeflectionSubjectFromSpaDump(benchmarkCase) {
  return {
    inputFactory: () => {
      const section = reviveRcSection(
        benchmarkCase.section,
        benchmarkCase.materials,
      );

      return {
        sectionBuild: {
          section,
          materials: {
            concreteMaterial: section.concreteMaterial,
            reinforcementMaterial: section.reinforcementMaterial,
          },
        },
        analysisState: benchmarkCase.projectState.analysisState,
        performanceProfile: "interactive",
      };
    },
    runAnalysis: (input) => runScaRcDeflectionAnalysis(input),
    sourceKind: "sca-service-deflection-adapter",
  };
}

function subjectForCase(benchmarkCase) {
  if (benchmarkCase.projectState?.analysisState?.type === "serviceDeflection") {
    return serviceDeflectionSubjectFromSpaDump(benchmarkCase);
  }

  if (benchmarkCase.publicWorkflowModel) {
    return {
      modelFactory: () => revivePublicModel(benchmarkCase.publicWorkflowModel),
      sourceKind: "public-workflow-model",
    };
  }

  const reconstructed = modelFromSpaDump(benchmarkCase);

  if (!reconstructed.model) {
    return reconstructed;
  }

  return {
    modelFactory: () => modelFromSpaDump(benchmarkCase).model,
    sourceKind: reconstructed.sourceKind,
  };
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
    status: result?.status ?? null,
    analysisType: outputs.analysisType ?? result?.metadata?.analysisType ?? null,
    fiberCount: outputs.fiberCount ?? null,
    pointCount: outputs.points?.length ?? outputs.generatedPointCount ?? null,
    warnings: result?.warnings ?? [],
  };
}

function benchmarkOneCase({ benchmarkCase, options }) {
  const subject = subjectForCase(benchmarkCase);

  if (!subject.modelFactory && !subject.inputFactory) {
    return {
      id: benchmarkCase.id,
      title: benchmarkCase.title,
      skipped: true,
      skippedReason: subject.skippedReason,
    };
  }

  const application = subject.runAnalysis
    ? null
    : new ReinforcedConcreteSectionApplication();
  const inputFactory = subject.inputFactory ?? subject.modelFactory;
  const runAnalysis =
    subject.runAnalysis ?? ((model) => application.run({ model }));
  const cachedInput = inputFactory();
  const initial = runAnalysis(cachedInput);

  return {
    id: benchmarkCase.id,
    title: benchmarkCase.title,
    skipped: false,
    sourceKind: subject.sourceKind,
    summary: summarizeResult(initial),
    operations: {
      modelBuild: measure({
        iterations: options.iterations,
        warmup: options.warmup,
        fn: () => inputFactory(),
      }),
      analysisOnly: measure({
        iterations: options.iterations,
        warmup: options.warmup,
        fn: () => runAnalysis(cachedInput),
      }),
      modelBuildAndAnalysis: measure({
        iterations: options.iterations,
        warmup: options.warmup,
        fn: () => runAnalysis(inputFactory()),
      }),
    },
  };
}

function printHuman(results) {
  for (const result of results) {
    console.log(`\n${result.id}`);
    console.log(result.title);

    if (result.skipped) {
      console.log(`skipped: ${result.skippedReason}`);
      continue;
    }

    console.log(
      `source=${result.sourceKind} analysis=${result.summary.analysisType} status=${result.summary.status}`,
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
  const benchmark = JSON.parse(await readFile(options.modelsPath, "utf8"));
  const selectedCases = options.caseIds.length === 0
    ? benchmark.cases
    : benchmark.cases.filter((item) => options.caseIds.includes(item.id));

  if (options.list) {
    for (const item of benchmark.cases) {
      const subject = subjectForCase(item);
      const status = subject.modelFactory ? subject.sourceKind : "skipped";
      console.log(`${item.id}: ${status} - ${item.title}`);
    }
    return;
  }

  if (selectedCases.length === 0) {
    throw new Error("No benchmark cases selected.");
  }

  const results = selectedCases.map((benchmarkCase) =>
    benchmarkOneCase({
      benchmarkCase,
      options,
    }),
  );

  if (options.json) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: benchmark.source,
      iterations: options.iterations,
      warmup: options.warmup,
      results,
    }, null, 2));
  } else {
    printHuman(results);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
