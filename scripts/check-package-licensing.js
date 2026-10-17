import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const EXPECTED_LICENSE = "MIT";
const EXPECTED_MIT_SHA256 =
  "fe607d4fd4a685745080e640726c03bfa6413efbde09c18659b81f627b42bd94";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const lockRoot = lock.packages?.[""];

assert.equal(pkg.license, EXPECTED_LICENSE, "package.json license is not MIT");
assert.equal(lockRoot?.license, EXPECTED_LICENSE, "package-lock root license is inconsistent");
assert.equal(lock.version, pkg.version, "package-lock top-level version is inconsistent");
assert.equal(lockRoot?.version, pkg.version, "package-lock root version is inconsistent");

const licenseText = readFileSync("LICENSE", "utf8").replaceAll("\r\n", "\n");
const licenseHash = createHash("sha256").update(licenseText).digest("hex");
assert.equal(
  licenseHash,
  EXPECTED_MIT_SHA256,
  "LICENSE differs from the project's MIT license text",
);

const bundle = readFileSync("dist/index.mjs", "utf8");
assert.match(bundle, new RegExp(`^/\\*! ${pkg.name} v${pkg.version} — bundled ESM`));
assert.ok(
  bundle.includes("Copyright (C) 2026 Claudio Pagani"),
  "bundle is missing the project copyright notice",
);
assert.ok(
  bundle.includes(`SPDX-License-Identifier: ${EXPECTED_LICENSE}`),
  "bundle is missing the MIT SPDX notice",
);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const packResult = spawnSync(
  npmCommand,
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
  },
);

assert.ifError(packResult.error);
assert.equal(
  packResult.status,
  0,
  `npm pack --dry-run failed: ${packResult.stderr || packResult.stdout}`,
);

const packReport = JSON.parse(packResult.stdout);
const packedPaths = new Set(packReport.flatMap(({ files = [] }) =>
  files.map(({ path }) => path.replaceAll("\\", "/"))));
const requiredPaths = [
  "LICENSE",
  "README.md",
  "docs/licensing.md",
  "scripts/build.js",
  "src/index.js",
  "dist/index.mjs",
];

for (const requiredPath of requiredPaths) {
  assert.ok(packedPaths.has(requiredPath), `npm package is missing ${requiredPath}`);
}

console.log(
  `Licensing check passed (${pkg.name} v${pkg.version}, ${EXPECTED_LICENSE}, ` +
    `${packedPaths.size} packed files).`,
);
