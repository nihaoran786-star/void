import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditThemeColors,
  checkBaseline,
  collectCssVarReferences,
  collectThemeColorEntriesFromText,
  findNearColorPairs,
  parseColor,
  writeReportJson,
} from './audit-theme-colors.mjs';

const root = process.cwd();

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'void-theme-audit-'));
  const sourceRoot = path.join(dir, 'src');
  for (const [relativePath, content] of Object.entries(files)) {
    writeText(path.join(sourceRoot, relativePath), content);
  }
  return { dir, sourceRoot };
}

function runAudit(args) {
  return spawnSync(process.execPath, ['scripts/audit-theme-colors.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('parseColor normalizes supported CSS color literals', () => {
  assert.deepEqual(parseColor('#abc'), { r: 170, g: 187, b: 204, a: 1, key: '170,187,204,1' });
  assert.deepEqual(parseColor('#aabbcc80'), { r: 170, g: 187, b: 204, a: 0.502, key: '170,187,204,0.502' });
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30, a: 1, key: '10,20,30,1' });
  assert.deepEqual(parseColor('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30, a: 0.5, key: '10,20,30,0.5' });
  assert.equal(parseColor('var(--color-accent)'), null);
});

test('collectThemeColorEntriesFromText ignores comment-only color-like text', () => {
  const entries = collectThemeColorEntriesFromText('App.tsx', [
    'export const real = "#123456";',
    '// issue #1176 is not a color',
    '/* retired: #abcdef */',
    'const css = `color: #654321`;',
    '',
  ].join('\n'));

  assert.deepEqual(entries.map(entry => entry.color), ['#123456', '#654321']);
});

test('collectCssVarReferences reports definitions, usages, and fallback vars', () => {
  const refs = collectCssVarReferences('App.scss', [
    ':root { --color-accent: #60a5fa; }',
    '.app { color: var(--color-accent); }',
    '.card { border-color: var(--runtime-border, #ffffff); }',
    '',
  ].join('\n'));

  assert.deepEqual(refs.definitions.map(entry => entry.name), ['--color-accent']);
  assert.deepEqual(refs.usages.map(entry => entry.name), ['--color-accent', '--runtime-border']);
  assert.deepEqual(refs.fallbacks.map(entry => entry.name), ['--runtime-border']);
});

test('auditThemeColors ignores test files and generated build artifacts', (t) => {
  const { dir, sourceRoot } = createFixture({
    'app/App.scss': '.app { color: #111111; background: var(--missing, #ffffff); }\n',
    'app/App.test.tsx': "expect(node).toHaveStyle({ color: '#222222' });\n",
    'app/__tests__/Fixture.tsx': "export const fixture = '#333333';\n",
    'generated/version.ts': "export const buildColor = '#444444';\n",
  });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const report = auditThemeColors({ root: sourceRoot, top: 10 });

  assert.equal(report.filesScanned, 1);
  assert.equal(report.ignoredTestFiles, 2);
  assert.equal(report.ignoredGeneratedFiles, 1);
  assert.equal(report.colorOccurrences, 2);
  assert.equal(report.uniqueColors, 2);
  assert.equal(report.cssVars.fallbackOccurrences, 1);
  assert.equal(report.cssVars.fallbackOnlyUnique, 1);
  assert.equal(report.cssVars.undefinedUnique, 0);
});

test('findNearColorPairs reports nearby but not identical colors', () => {
  const pairs = findNearColorPairs([
    { file: 'a.scss', color: '#111111' },
    { file: 'b.scss', color: '#111112' },
    { file: 'c.scss', color: '#334455' },
  ]);

  assert.equal(pairs.indistinguishableTotal, 1);
  assert.equal(pairs.nearTotal, 0);
  assert.equal(pairs.indistinguishable[0].key, '#111111 <-> #111112');
});

test('checkBaseline fails on growth and requires lowered baseline when debt drops', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'void-theme-audit-'));
  try {
    const baselinePath = path.join(tempDir, 'baseline.json');
    writeText(baselinePath, JSON.stringify({
      version: 1,
      budgets: {
        uniqueColors: { max: 2 },
        'nearPairs.indistinguishableTotal': { max: 1 },
      },
    }));

    assert.match(
      checkBaseline({ uniqueColors: 3, nearPairs: { indistinguishableTotal: 1 } }, baselinePath).join('\n'),
      /uniqueColors has 3 candidate\(s\), above baseline 2/,
    );
    assert.match(
      checkBaseline({ uniqueColors: 1, nearPairs: { indistinguishableTotal: 0 } }, baselinePath).join('\n'),
      /uniqueColors has 1 candidate\(s\), below baseline 2/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('writeReportJson creates parent directories', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'void-theme-audit-'));
  try {
    const reportPath = path.join(tempDir, 'nested', 'report.json');
    writeReportJson({ uniqueColors: 1 }, reportPath);
    assert.deepEqual(JSON.parse(fs.readFileSync(reportPath, 'utf8')), { uniqueColors: 1 });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI audit can print a machine-readable report', () => {
  const result = runAudit(['--root', 'src/web-ui/src', '--json', '--no-baseline', '--top=0']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const report = JSON.parse(result.stdout);
  assert.equal(report.root, 'src/web-ui/src');
  assert.equal(typeof report.uniqueColors, 'number');
  assert.equal(Array.isArray(report.nearPairs.indistinguishable), true);
});
