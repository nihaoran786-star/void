#!/usr/bin/env node

/**
 * Style thumbnail budget guardrail (Infinite Canvas P5, slice W5).
 *
 * The style preset thumbnails live in `src/web-ui/public/style-presets/`, which
 * Vite copies verbatim into `dist/`. They are therefore invisible to
 * `check-web-performance-budget.mjs` (that one only measures JS and CSS assets)
 * yet they still land in the installer. This script is the only thing standing
 * between a future contributor and a silently bloated bundle.
 *
 * Rules:
 * - Every file must be `.webp`.
 * - Every file must be at most 48 KiB.
 * - The directory total must be at most 6 MiB.
 * - Only the two families that actually ship thumbnails may have a directory.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thumbnailRoot = path.join(repositoryRoot, 'src', 'web-ui', 'public', 'style-presets');

const MAX_SINGLE_BYTES = 48 * 1024;
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;
const ALLOWED_FAMILY_DIRECTORIES = new Set(['cinematic', 'animation-2d']);

const violations = [];

function listFilesRecursively(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

let totalBytes = 0;
let fileCount = 0;

let rootEntries = [];
try {
  rootEntries = readdirSync(thumbnailRoot, { withFileTypes: true });
} catch {
  console.log('Style thumbnail budget check skipped (no style-presets directory).');
  process.exit(0);
}

for (const entry of rootEntries) {
  if (!entry.isDirectory()) {
    violations.push(`Unexpected loose file in style-presets/: ${entry.name}`);
    continue;
  }
  if (!ALLOWED_FAMILY_DIRECTORIES.has(entry.name)) {
    violations.push(
      `Unexpected family directory style-presets/${entry.name}/ (allowed: ${[...ALLOWED_FAMILY_DIRECTORIES].join(', ')}).`,
    );
  }
}

for (const absolutePath of listFilesRecursively(thumbnailRoot)) {
  const relativePath = path.relative(thumbnailRoot, absolutePath).split(path.sep).join('/');
  const { size } = statSync(absolutePath);
  totalBytes += size;
  fileCount += 1;

  if (path.extname(absolutePath).toLowerCase() !== '.webp') {
    violations.push(`${relativePath} is not a .webp file.`);
  }
  if (size > MAX_SINGLE_BYTES) {
    violations.push(`${relativePath} is ${size} bytes, above the ${MAX_SINGLE_BYTES} byte per-file cap.`);
  }
}

if (totalBytes > MAX_TOTAL_BYTES) {
  violations.push(`style-presets/ totals ${totalBytes} bytes, above the ${MAX_TOTAL_BYTES} byte cap.`);
}

if (violations.length > 0) {
  console.error('Style thumbnail budget check failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(
  `Style thumbnail budget check passed (${fileCount} files, ${totalBytes} bytes, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB of ${MAX_TOTAL_BYTES / 1024 / 1024} MiB).`,
);
