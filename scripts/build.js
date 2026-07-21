import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

await esbuild.build({
    entryPoints: ["src/index.js"],
    bundle: true,
    format: "esm",
    target: "es2019",
    outfile: "dist/index.mjs",
    banner: {
        js: `/*! ${pkg.name} v${pkg.version} — bundled ESM
 * Copyright (C) 2026 Claudio Pagani
 * SPDX-License-Identifier: ${pkg.license}
 */`,
    },
});

console.log(`✓ ${pkg.name} v${pkg.version} → dist/index.mjs`);
