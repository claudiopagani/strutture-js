import path from "node:path";

import {
  createSimpleSpanRcDeflectionExample,
  writeRcDeflectionReport,
} from "./rc-deflection-report-common.js";

const model = createSimpleSpanRcDeflectionExample();
const outputDirectory = path.join(
  process.cwd(),
  "results",
  "rc-deflection-simple-span",
);
const result = writeRcDeflectionReport({
  model,
  outputDirectory,
});

console.log(`Report written to ${result.outputPath}`);
