import * as esbuild from "esbuild";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootPath = process.cwd();
const entryPoint = path.join(
  rootPath,
  "tests",
  "fixtures",
  "strutture-js-web-worker-entry.js",
);
const outputDirectory = path.join(
  rootPath,
  "node_modules",
  ".cache",
  "strutture-js-worker-bundle-check",
);
const outputFile = path.join(outputDirectory, "worker-bundle.mjs");

function isNodeBuiltinInput(input) {
  return (
    input.startsWith("node:") ||
    input.startsWith("fs") ||
    input.startsWith("path") ||
    input.startsWith("worker_threads")
  );
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const buildResult = await esbuild.build({
  entryPoints: [entryPoint],
  outfile: outputFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  metafile: true,
  logLevel: "silent",
  mainFields: ["browser", "module", "main"],
  conditions: ["browser", "module", "default"],
});

const nodeBuiltinInputs = Object.keys(buildResult.metafile.inputs).filter(
  isNodeBuiltinInput,
);

if (nodeBuiltinInputs.length > 0) {
  throw new Error(
    `Web worker bundle unexpectedly includes Node built-ins: ${nodeBuiltinInputs.join(", ")}`,
  );
}

const bundledWorker = await import(
  `${pathToFileURL(outputFile).href}?t=${Date.now()}`
);

if (typeof bundledWorker.runWorkerSmoke !== "function") {
  throw new Error("Web worker bundle does not export runWorkerSmoke().");
}

const smoke = bundledWorker.runWorkerSmoke();

if (
  smoke.applicationId !== "reinforced-concrete-sections" ||
  smoke.status !== "ok" ||
  smoke.analysisType !== "service-stress" ||
  !Number.isInteger(smoke.fiberCount) ||
  smoke.fiberCount <= 0
) {
  throw new Error(
    `Web worker smoke analysis returned an unexpected result: ${JSON.stringify(smoke)}`,
  );
}

const output = await stat(outputFile);

console.log(
  `Web worker bundle check passed (${Math.round(output.size / 1024)} KiB, ${smoke.fiberCount} fibers).`,
);
