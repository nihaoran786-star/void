#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const strict = process.argv.includes('--strict');
const root = process.cwd();

const oldBrandLower = 'bit' + 'fun';
const oldBrandTitle = 'Bit' + 'Fun';
const oldBrandSpaced = 'Bit\\s*Fun';
const oldProvider = 'open' + oldBrandLower;
const oldUpstreamOwner = 'GC' + 'Wing';
const legacyPattern = new RegExp(
  `${oldProvider}|${oldUpstreamOwner}|${oldBrandSpaced}|${oldBrandLower}`,
  'gi',
);

const textExtensions = new Set([
  '.cjs',
  '.conf',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.lock',
  '.md',
  '.mjs',
  '.ps1',
  '.rs',
  '.scss',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const ignoredPathPatterns = [
  /(^|\/)\.git\//,
  /(^|\/)\.code-review-graph\//,
  /(^|\/)node_modules\//,
  /(^|\/)target\//,
  /(^|\/)tmp\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)src\/web-ui\/public\/monaco-editor\//,
  /(^|\/)src\/mobile-web\/dist\//,
  /(^|\/)scripts\/brand-residue-audit\.mjs$/,
];

const allowedReferencePathPatterns = [
  /(^|\/)docs\//,
];

const allowedReferenceLinePatterns = [
  /tmp\/upstream-bitfun/,
];

const binaryExtensions = new Set([
  '.bmp',
  '.db',
  '.dll',
  '.exe',
  '.gif',
  '.icns',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.pdb',
  '.png',
  '.svg',
  '.webp',
  '.zip',
]);

function runGit(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

function normalizePath(file) {
  return file.replace(/\\/g, '/');
}

function shouldIgnorePath(file) {
  const normalized = normalizePath(file);
  return ignoredPathPatterns.some((pattern) => pattern.test(normalized));
}

function allowsLegacyReference(file) {
  const normalized = normalizePath(file);
  return allowedReferencePathPatterns.some((pattern) => pattern.test(normalized));
}

function allowsLegacyReferenceLine(line) {
  return allowedReferenceLinePatterns.some((pattern) => pattern.test(line));
}

function isTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  return textExtensions.has(ext) && !binaryExtensions.has(ext);
}

function categoryFor(file) {
  const normalized = normalizePath(file);
  if (normalized.startsWith('.github/')) return 'ci-release';
  if (normalized.startsWith('Void-Installer/')) return 'installer';
  if (normalized.startsWith('src/apps/desktop/')) return 'desktop';
  if (normalized.startsWith('src/apps/cli/')) return 'cli';
  if (normalized.startsWith('src/crates/')) return 'rust-crates';
  if (normalized.startsWith('src/web-ui/')) return 'web-ui';
  if (normalized.startsWith('src/mobile-web/')) return 'mobile-web';
  if (normalized.startsWith('scripts/')) return 'scripts';
  if (normalized.startsWith('docs/')) return 'docs';
  if (/^(README|CONTRIBUTING|AGENTS)/i.test(normalized)) return 'repo-docs';
  if (/^(Cargo|package|pnpm-workspace)/i.test(normalized)) return 'workspace-metadata';
  return 'other';
}

function labelForMatch(value) {
  if (value.toLowerCase() === oldProvider) return 'legacy-provider';
  if (value === oldUpstreamOwner) return 'legacy-upstream-owner';
  return 'legacy-brand';
}

function countMatches(value) {
  const counts = new Map();
  for (const match of String(value).matchAll(legacyPattern)) {
    const label = labelForMatch(match[0]);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  legacyPattern.lastIndex = 0;
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

const trackedFiles = runGit(['ls-files']);
const untrackedFiles = runGit(['ls-files', '--others', '--exclude-standard']);
const auditFiles = [...new Set([...trackedFiles, ...untrackedFiles])];
const findings = [];

for (const file of auditFiles) {
  const normalized = normalizePath(file);
  if (shouldIgnorePath(normalized)) continue;
  if (allowsLegacyReference(normalized)) continue;

  for (const match of countMatches(normalized)) {
    findings.push({
      type: 'path',
      category: categoryFor(normalized),
      file: normalized,
      line: null,
      term: match.label,
      count: match.count,
      text: normalized,
    });
  }

  if (!isTextFile(normalized)) continue;

  let content;
  try {
    content = readFileSync(path.join(root, file), 'utf8');
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (allowsLegacyReferenceLine(line)) continue;
    const matches = countMatches(line);
    for (const match of matches) {
      findings.push({
        type: 'content',
        category: categoryFor(normalized),
        file: normalized,
        line: index + 1,
        term: match.label,
        count: match.count,
        text: line.trim(),
      });
    }
  }
}

const totalsByCategory = new Map();
const totalsByTerm = new Map();
let total = 0;

for (const finding of findings) {
  total += finding.count;
  totalsByCategory.set(
    finding.category,
    (totalsByCategory.get(finding.category) ?? 0) + finding.count,
  );
  totalsByTerm.set(finding.term, (totalsByTerm.get(finding.term) ?? 0) + finding.count);
}

console.log(`Brand residue audit: ${total} occurrence(s), ${findings.length} finding line(s).`);

console.log('\nBy category:');
for (const [category, count] of [...totalsByCategory.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`- ${category}: ${count}`);
}

console.log('\nBy term:');
for (const [term, count] of [...totalsByTerm.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`- ${term}: ${count}`);
}

console.log('\nFirst findings:');
for (const finding of findings.slice(0, 120)) {
  const location = finding.line == null ? finding.file : `${finding.file}:${finding.line}`;
  console.log(`- [${finding.category}/${finding.type}/${finding.term} x${finding.count}] ${location}`);
  if (finding.text) {
    console.log(`  ${finding.text.slice(0, 220)}`);
  }
}

if (findings.length > 120) {
  console.log(`- ... ${findings.length - 120} more finding line(s) omitted`);
}

if (strict && findings.length > 0) {
  process.exit(1);
}
