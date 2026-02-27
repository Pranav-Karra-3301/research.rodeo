#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_EXAMPLE_PATH = path.join(ROOT, ".env.example");
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const IGNORE_KEYS = new Set(["NODE_ENV"]);

function collectFiles(startPath) {
  if (!existsSync(startPath)) return [];

  const stats = statSync(startPath);
  if (stats.isFile()) return [startPath];

  const files = [];
  for (const entry of readdirSync(startPath, { withFileTypes: true })) {
    const fullPath = path.join(startPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseEnvKeysFromFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const matches = content.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm);
  return new Set(Array.from(matches, (match) => match[1]));
}

function parseUsedEnvKeys(filePaths) {
  const usedKeys = new Set();
  const regex = /process\.env\.([A-Z][A-Z0-9_]*)/g;

  for (const filePath of filePaths) {
    const content = readFileSync(filePath, "utf8");
    for (const match of content.matchAll(regex)) {
      const key = match[1];
      if (!IGNORE_KEYS.has(key)) usedKeys.add(key);
    }
  }

  return usedKeys;
}

if (!existsSync(ENV_EXAMPLE_PATH)) {
  console.error("Missing .env.example");
  process.exit(1);
}

const filesToScan = [
  ...collectFiles(path.join(ROOT, "src")),
  ...collectFiles(path.join(ROOT, "next.config.ts")),
];

const usedKeys = parseUsedEnvKeys(filesToScan);
const exampleKeys = parseEnvKeysFromFile(ENV_EXAMPLE_PATH);

const missingKeys = Array.from(usedKeys)
  .filter((key) => !exampleKeys.has(key))
  .sort();

if (missingKeys.length > 0) {
  console.error("Missing keys in .env.example:");
  for (const key of missingKeys) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log(
  `.env.example is in sync (${usedKeys.size} runtime env keys documented).`
);
