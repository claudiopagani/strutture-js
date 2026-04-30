import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT_DIRECTORIES = ['src', 'tests', 'examples', 'validation', 'scripts'];
const rootPath = process.cwd();

async function collectJavaScriptFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

function runNodeSyntaxCheck(filePath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', filePath], {
      cwd: rootPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });

    child.on('close', (code) => {
      resolve({ code, output });
    });
  });
}

const files = (
  await Promise.all(
    ROOT_DIRECTORIES.map((directory) => collectJavaScriptFiles(path.join(rootPath, directory))),
  )
).flat().sort();

let failed = false;

for (const filePath of files) {
  const { code, output } = await runNodeSyntaxCheck(filePath);
  if (code === 0) {
    continue;
  }

  failed = true;
  const relativePath = path.relative(rootPath, filePath);
  console.error(`Syntax check failed: ${relativePath}`);
  console.error(output.trim());
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Syntax check passed (${files.length} files).`);
}
