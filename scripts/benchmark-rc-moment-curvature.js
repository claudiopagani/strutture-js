import { performance } from "node:perf_hooks";

import {
  ReinforcedConcreteSection,
  ReinforcementBar,
  RectangularSection,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../src/index.js";
import { RCMomentCurvatureAnalyzer } from "../src/applications/reinforced-concrete-sections/analysis/RCMomentCurvatureAnalyzer.js";
import { RCSectionStateIntegrator } from "../src/applications/reinforced-concrete-sections/analysis/RCSectionStateIntegrator.js";
import { SectionFiberDiscretizer } from "../src/applications/reinforced-concrete-sections/analysis/SectionFiberDiscretizer.js";
import {
  resolveConcreteLaw,
  resolveSteelLaw,
} from "../src/applications/reinforced-concrete-sections/shared/rcConstitutiveLaws.js";

const units = { force: "N", length: "mm" };

function parseRuns() {
  const argument = process.argv.find((item) => item.startsWith("--runs="));
  const value = argument == null ? 3 : Number(argument.slice("--runs=".length));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Use --runs=<positive integer>.");
  }

  return value;
}

function createFixture() {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC moment-curvature benchmark section",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      new ReinforcementBar({
        id: "bottom-left",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "bottom-right",
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 40,
        z: 240,
        units,
      }),
      new ReinforcementBar({
        id: "top-left",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        id: "top-right",
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 460,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });
  const model = {
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    analysisSettings: {},
  };

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
    concreteLaw: resolveConcreteLaw(model, section),
    steelLaw: resolveSteelLaw(model, section),
  };
}

class CountingIntegrator extends RCSectionStateIntegrator {
  constructor() {
    super();
    this.calls = 0;
    this.fastCalls = 0;
    this.detailCalls = 0;
  }

  createAxialForceEvaluator(options) {
    const evaluateAxialForce = super.createAxialForceEvaluator(options);

    return (strainField) => {
      this.calls += 1;
      this.fastCalls += 1;

      return evaluateAxialForce(strainField);
    };
  }

  evaluate(options) {
    this.calls += 1;

    if (options?.includeResponseDetails === false) {
      this.fastCalls += 1;
    } else {
      this.detailCalls += 1;
    }

    return super.evaluate(options);
  }
}

function runScenario({
  fixture,
  concreteFibers,
  pointCount,
  postUltimateResponse,
}) {
  const sectionIntegrator = new CountingIntegrator();
  const analyzer = new RCMomentCurvatureAnalyzer({ sectionIntegrator });
  const postUltimateFractureEnergyDensity =
    postUltimateResponse === "linear-softening"
      ? {
          concrete: 0.5 * fixture.concreteMaterial.fcd * 0.0035,
          steel:
            0.5 *
            fixture.reinforcementMaterial.fyd *
            fixture.reinforcementMaterial.ultimateStrain,
        }
      : null;
  const start = performance.now();
  const result = analyzer.analyze({
    section: fixture.section,
    concreteFibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    nEd: 0,
    compressedEdge: "top",
    pointCount,
    postUltimateResponse,
    postUltimateFractureEnergyDensity,
  });
  const elapsedMs = performance.now() - start;

  return {
    elapsedMs,
    generatedPointCount: result.generatedPointCount,
    analyzedPointCount: result.analyzedPointCount,
    integratorCalls: sectionIntegrator.calls,
    fastCalls: sectionIntegrator.fastCalls,
    detailCalls: sectionIntegrator.detailCalls,
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeScenario({
  fixture,
  targetFiberCount,
  mesh,
  pointCount,
  postUltimateResponse,
  runs,
}) {
  runScenario({
    fixture,
    concreteFibers: mesh.fibers,
    pointCount,
    postUltimateResponse,
  });

  const results = Array.from({ length: runs }, () =>
    runScenario({
      fixture,
      concreteFibers: mesh.fibers,
      pointCount,
      postUltimateResponse,
    }),
  );
  const last = results.at(-1);

  return {
    targetFibers: targetFiberCount,
    actualFibers: mesh.generatedCount,
    pointCount,
    postUltimate: postUltimateResponse,
    avgMs: Number(average(results.map((item) => item.elapsedMs)).toFixed(1)),
    calls: Math.round(average(results.map((item) => item.integratorCalls))),
    fastCalls: Math.round(average(results.map((item) => item.fastCalls))),
    detailCalls: Math.round(average(results.map((item) => item.detailCalls))),
    analyzedPoints: last.analyzedPointCount,
    generatedPoints: last.generatedPointCount,
  };
}

export function runMomentCurvatureBenchmark({
  runs = 3,
  targetFiberCounts = [120, 300, 1000],
  pointCounts = [15, 41],
  postUltimateResponses = ["zero-stress", "linear-softening"],
} = {}) {
  const fixture = createFixture();
  const discretizer = new SectionFiberDiscretizer();
  const rows = [];

  for (const targetFiberCount of targetFiberCounts) {
    const mesh = discretizer.discretize(fixture.section, {
      targetCount: targetFiberCount,
    });

    for (const pointCount of pointCounts) {
      for (const postUltimateResponse of postUltimateResponses) {
        rows.push(
          summarizeScenario({
            fixture,
            targetFiberCount,
            mesh,
            pointCount,
            postUltimateResponse,
            runs,
          }),
        );
      }
    }
  }

  return rows;
}

function main() {
  const runs = parseRuns();
  const rows = runMomentCurvatureBenchmark({ runs });

  console.log(`RC moment-curvature benchmark (${runs} measured run(s))`);
  console.table(rows);
}

if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/benchmark-rc-moment-curvature.js")
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
