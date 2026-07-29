import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  CIRC2019_RC_REFERENCES,
  NTC2018_NORMATIVE_CORPUS,
  NTC2018_RC_CHAPTER_4_REFERENCES,
  NTC2018_RC_CHAPTER_7_4_REFERENCES,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../src/norms/ntc2018/normativeReferences.js";
import {
  EN1992_RC_EXTERNAL_REFERENCES,
} from "../src/norms/en1992/normativeReferences.js";

const execFileAsync = promisify(execFile);
const DEFAULT_CORPUS_PATH = path.resolve("..", "strutture-normative");

function parseArguments(argv) {
  const options = {
    corpusPath: process.env.STRUTTURE_NORMATIVE_PATH
      ? path.resolve(process.env.STRUTTURE_NORMATIVE_PATH)
      : DEFAULT_CORPUS_PATH,
    allowDirty: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--corpus") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--corpus requires a directory path.");
      }
      options.corpusPath = path.resolve(value);
      index += 1;
    } else if (argument === "--allow-dirty") {
      options.allowDirty = true;
    } else {
      throw new Error(`Unsupported argument: ${argument}.`);
    }
  }

  return options;
}

async function isDirectory(directoryPath) {
  try {
    return (await stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

async function collectJsonFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function collectCorpusIndex(corpusPath) {
  const unitsRoot = path.join(corpusPath, "corpus", "units");
  const assetsRoot = path.join(corpusPath, "corpus", "assets");

  if (!await isDirectory(unitsRoot) || !await isDirectory(assetsRoot)) {
    throw new Error(
      `No canonical strutture-normative corpus found at ${corpusPath}.`,
    );
  }

  const unitFiles = await collectJsonFiles(unitsRoot);
  const assetFiles = await collectJsonFiles(assetsRoot);
  const units = new Map();
  const assets = new Map();

  for (const filePath of unitFiles) {
    const record = await readJson(filePath);
    if (record.recordType !== "canonical-unit") {
      continue;
    }
    if (units.has(record.id)) {
      throw new Error(`Duplicate canonical unit id: ${record.id}.`);
    }
    units.set(record.id, {
      filePath,
      status: record.workflow?.status ?? null,
    });
  }

  for (const filePath of assetFiles) {
    const manifest = await readJson(filePath);
    for (const assetType of ["formulas", "tables", "figures"]) {
      for (const asset of manifest[assetType] ?? []) {
        if (assets.has(asset.id)) {
          throw new Error(`Duplicate canonical asset id: ${asset.id}.`);
        }
        assets.set(asset.id, {
          filePath,
          unitId: asset.unitId,
          assetType,
        });
      }
    }
  }

  return { assets, units };
}

function collectReferences() {
  return [
    ...Object.values(CIRC2019_RC_REFERENCES),
    ...Object.values(EN1992_RC_EXTERNAL_REFERENCES),
    ...Object.values(NTC2018_RC_CHAPTER_4_REFERENCES),
    ...Object.values(NTC2018_RC_CHAPTER_7_4_REFERENCES),
    ...Object.values(NTC2018_RC_OUTSIDE_CORPUS_REFERENCES),
  ];
}

async function gitState(corpusPath) {
  const [{ stdout: revisionOutput }, { stdout: statusOutput }] =
    await Promise.all([
      execFileAsync("git", ["-C", corpusPath, "rev-parse", "HEAD"]),
      execFileAsync("git", [
        "-C",
        corpusPath,
        "status",
        "--porcelain",
        "--",
        "corpus",
        "schemas",
      ]),
    ]);

  return {
    revision: revisionOutput.trim(),
    dirty: statusOutput.trim().length > 0,
  };
}

function validateResolvedReference(reference, corpus, errors) {
  const unit = corpus.units.get(reference.unitId);
  if (!unit) {
    errors.push(`Unknown canonical unit id: ${reference.unitId}.`);
    return;
  }

  if (unit.status !== reference.corpusStatus) {
    errors.push(
      `${reference.unitId} has corpus status ${unit.status}, ` +
        `expected ${reference.corpusStatus}.`,
    );
  }

  for (const assetId of reference.assetIds) {
    const asset = corpus.assets.get(assetId);
    if (!asset) {
      errors.push(`Unknown canonical asset id: ${assetId}.`);
    } else if (asset.unitId !== reference.unitId) {
      errors.push(
        `${assetId} belongs to ${asset.unitId}, not ${reference.unitId}.`,
      );
    }
  }

  const href = new URL(reference.href);
  if (href.searchParams.get("unit") !== reference.unitId) {
    errors.push(
      `Permalink for ${reference.unitId} does not resolve the same unit id.`,
    );
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const state = await gitState(options.corpusPath);
  const errors = [];

  if (state.revision !== NTC2018_NORMATIVE_CORPUS.corpusRevision) {
    errors.push(
      `Corpus revision ${state.revision} differs from pinned revision ` +
        `${NTC2018_NORMATIVE_CORPUS.corpusRevision}.`,
    );
  }
  if (state.dirty && !options.allowDirty) {
    errors.push(
      "The canonical corpus or its schemas have uncommitted changes. " +
        "Use a clean pinned revision or pass --allow-dirty for diagnostics.",
    );
  }

  const corpus = await collectCorpusIndex(options.corpusPath);
  const references = collectReferences();
  let resolvedCount = 0;
  let outsideCorpusCount = 0;

  for (const reference of references) {
    if (reference.resolutionStatus === "resolved") {
      resolvedCount += 1;
      validateResolvedReference(reference, corpus, errors);
    } else {
      outsideCorpusCount += 1;
      if (reference.unitId !== null || reference.assetIds.length > 0) {
        errors.push(
          `${reference.citation} is outside the corpus but claims canonical ids.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`Normative reference error: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Normative reference check passed (${resolvedCount} resolved references, ` +
      `${outsideCorpusCount} explicitly outside the corpus, ` +
      `${corpus.units.size} canonical units, ${corpus.assets.size} assets, ` +
      `revision ${state.revision}).`,
  );
}

await main();
