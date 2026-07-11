import { performance } from "node:perf_hooks";

import { DofRegistry } from "../src/domain/fem/DofRegistry.js";
import { KinematicConstraintReducer2D } from "../src/domain/fem/KinematicConstraintReducer2D.js";

function parseRuns() {
  const argument = process.argv.find((value) => value.startsWith("--runs="));

  if (!argument) {
    return 5;
  }

  const runs = Number(argument.slice("--runs=".length));

  if (!Number.isInteger(runs) || runs <= 0) {
    throw new Error("Use --runs=<positive integer>.");
  }

  return runs;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function createCase(dofCount) {
  if (dofCount % 3 !== 0) {
    throw new Error("Kinematic reducer benchmark DOF count must be divisible by 3.");
  }

  const nodeCount = dofCount / 3;
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index + 1}`,
  }));
  const dofRegistry = new DofRegistry();

  dofRegistry.registerNodes(nodes);

  const stiffnessMatrix = Array.from({ length: dofCount }, (_, row) =>
    Array.from({ length: dofCount }, (_, column) => {
      if (row === column) {
        return 10;
      }

      return Math.abs(row - column) === 1 ? -1 : 0;
    }),
  );
  const supports = [
    {
      id: "fixed-base",
      node: nodes[0],
      restraints: { ux: true, uy: true, rz: true },
    },
  ];
  const reduction = new KinematicConstraintReducer2D().build({
    dofRegistry,
    supports,
  });

  return { reduction, stiffnessMatrix };
}

function measureCase(dofCount, runs) {
  const { reduction, stiffnessMatrix } = createCase(dofCount);

  reduction.reduceStiffnessMatrix(stiffnessMatrix);

  const samples = Array.from({ length: runs }, () => {
    const startedAt = performance.now();

    reduction.reduceStiffnessMatrix(stiffnessMatrix);

    return performance.now() - startedAt;
  });

  return {
    dofs: dofCount,
    reducedDofs: reduction.reducedSize(),
    medianMs: Number(median(samples).toFixed(3)),
    minMs: Number(Math.min(...samples).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
  };
}

function main() {
  const runs = parseRuns();
  const rows = [60, 120, 240, 480].map((dofCount) =>
    measureCase(dofCount, runs),
  );

  console.log(`Kinematic reducer benchmark (${runs} measured run(s))`);
  console.table(rows);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
