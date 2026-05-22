#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const allowlistPath = path.join(root, 'brand', 'brand-audit-allowlist.json');
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));

const pathAllowPatterns = allowlist.allowedPathPatterns.map((pattern) => new RegExp(pattern));
const lineAllowPatterns = allowlist.allowedLinePatterns.map((pattern) => new RegExp(pattern));
const previousTitle = ['Bit', 'Fun'].join('');
const previousCamel = ['Bit', 'fun'].join('');
const previousUpper = previousTitle.toUpperCase();
const previousLower = previousTitle.toLowerCase();
const brandPattern = new RegExp(`\\b(${previousTitle}|${previousCamel}|${previousUpper}|${previousLower})\\b`, 'g');

const trackedFiles = execFileSync('git', ['ls-files'], {
  cwd: root,
  encoding: 'utf8',
}).split(/\r?\n/).filter(Boolean);

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.json',
  '.json5',
  '.js',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.scss',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

const violations = [];

for (const file of trackedFiles) {
  const normalized = file.replaceAll('\\', '/');
  if (pathAllowPatterns.some((pattern) => pattern.test(normalized))) {
    continue;
  }

  const ext = path.extname(normalized);
  if (!textExtensions.has(ext)) {
    continue;
  }

  const content = readFileSync(path.join(root, file), 'utf8');
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!brandPattern.test(line)) {
      brandPattern.lastIndex = 0;
      continue;
    }
    brandPattern.lastIndex = 0;

    if (lineAllowPatterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    violations.push(`${normalized}:${index + 1}: ${line.trim()}`);
  }
}

if (violations.length > 0) {
  console.error('[brand-audit] Previous brand references remain:');
  for (const violation of violations.slice(0, 200)) {
    console.error(`  ${violation}`);
  }
  if (violations.length > 200) {
    console.error(`  ... and ${violations.length - 200} more`);
  }
  process.exit(1);
}

console.log('[brand-audit] No previous brand references found.');
