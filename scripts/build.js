import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

await esbuild.build({
    entryPoints: ["src/index.js"],
    bundle: true,
    format: "esm",
    target: "es2022",
    outfile: "dist/index.mjs",
    banner: {
        js: `// ${pkg.name} v${pkg.version} — bundled ESM`,
    },
});

console.log(`✓ ${pkg.name} v${pkg.version} → dist/index.mjs`);
