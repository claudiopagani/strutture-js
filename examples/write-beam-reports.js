import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SingleBeamDesignApplication,
  createBeamReportArtifacts,
} from "../src/index.js";
import { createBeamReportExampleModels } from "./beam-report-fixtures.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "results", "beam-reports");
const application = new SingleBeamDesignApplication();

await mkdir(outputDir, { recursive: true });

for (const model of createBeamReportExampleModels()) {
  const result = application.run({ model });
  const report = result.outputs.report;
  const artifacts = createBeamReportArtifacts(report);

  for (const artifact of artifacts) {
    const outputPath = path.join(outputDir, artifact.fileName);

    await writeFile(outputPath, artifact.content, "utf8");
  }

  console.log(
    `${report.json.id}: ${artifacts.map((artifact) => artifact.fileName).join(", ")}`,
  );
}

console.log(`Report written to ${outputDir}`);
