import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ROOT = path.resolve("src");
const FORBIDDEN_DEPENDENCIES = new Map([
  ["domain", new Set(["norms", "applications"])],
  ["norms", new Set(["applications"])],
]);
const STATIC_MODULE_PATTERN =
  /\b(?:import|export)\s+(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(\s*["']([^"']+)["']/g;

async function collectJavaScriptFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
}

function sourceLayer(filePath) {
  const relativePath = path.relative(SOURCE_ROOT, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.split(path.sep)[0] ?? null;
}

function lineNumberAt(source, index) {
  let lineNumber = 1;

  for (let offset = 0; offset < index; offset += 1) {
    if (source.charCodeAt(offset) === 10) {
      lineNumber += 1;
    }
  }

  return lineNumber;
}

function collectRelativeImports(source) {
  const imports = [];

  for (const pattern of [STATIC_MODULE_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(source)) !== null) {
      if (match[1].startsWith(".")) {
        imports.push({
          specifier: match[1],
          index: match.index,
        });
      }
    }
  }

  return imports;
}

const files = await collectJavaScriptFiles(SOURCE_ROOT);
const violations = [];
let relativeDependencyCount = 0;

for (const filePath of files) {
  const fromLayer = sourceLayer(filePath);
  const forbiddenTargets = FORBIDDEN_DEPENDENCIES.get(fromLayer);

  if (!forbiddenTargets) {
    continue;
  }

  const source = await readFile(filePath, "utf8");

  for (const imported of collectRelativeImports(source)) {
    relativeDependencyCount += 1;
    const targetPath = path.resolve(path.dirname(filePath), imported.specifier);
    const toLayer = sourceLayer(targetPath);

    if (forbiddenTargets.has(toLayer)) {
      violations.push({
        filePath,
        line: lineNumberAt(source, imported.index),
        fromLayer,
        toLayer,
        specifier: imported.specifier,
      });
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    const relativePath = path.relative(process.cwd(), violation.filePath);
    console.error(
      `Architecture violation: ${relativePath}:${violation.line} ` +
        `(${violation.fromLayer} -> ${violation.toLayer}) via ` +
        `"${violation.specifier}".`,
    );
  }

  process.exitCode = 1;
} else {
  console.log(
    `Architecture check passed (${files.length} source files, ` +
      `${relativeDependencyCount} guarded relative dependencies).`,
  );
}
