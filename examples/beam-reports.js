import { SingleBeamDesignApplication } from "../src/index.js";
import { createBeamReportExampleModels } from "./beam-report-fixtures.js";

const application = new SingleBeamDesignApplication();

for (const model of createBeamReportExampleModels()) {
  const result = application.run({ model });
  const report = result.outputs.report;

  console.log(`=== ${report.json.title} ===`);
  console.log(JSON.stringify({
    id: report.json.id,
    status: result.status,
    combinations: report.json.analysis.combinationIds,
    warnings: report.json.warnings,
    governing: report.json.governing,
  }, null, 2));
  console.log("");
  console.log(report.markdown);
  console.log("");
}

