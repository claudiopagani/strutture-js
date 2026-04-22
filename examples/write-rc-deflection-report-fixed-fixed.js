import path from "node:path";

import {
  createFixedFixedRcDeflectionExample,
  writeRcDeflectionReport,
} from "./rc-deflection-report-common.js";

const model = createFixedFixedRcDeflectionExample();
const outputDirectory = path.join(
  process.cwd(),
  "results",
  "rc-deflection-fixed-fixed",
);
const result = writeRcDeflectionReport({
  model,
  outputDirectory,
});

console.log(`Report written to ${result.outputPath}`);
