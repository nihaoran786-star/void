import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const centerPath = join(
  repoRoot,
  'src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.scss',
);

function readCenterStyle() {
  return readFileSync(centerPath, 'utf8');
}

function rootBlock(style) {
  const match = style.match(/\.short-drama-center\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'ShortDramaCenterPanel root block must exist');
  return match[1];
}

test('short drama center styles map local tokens to global theme tokens', () => {
  const style = readCenterStyle();
  const root = rootBlock(style);

  assert.equal(style.includes('--void-'), false, 'CenterPanel styles must not directly depend on --void-* tokens');
  assert.equal(style.includes('--short-drama-text'), false, 'CenterPanel styles must not reference undefined --short-drama-text');

  for (const token of [
    '--short-drama-ink',
    '--short-drama-muted',
    '--short-drama-border',
    '--short-drama-surface',
    '--short-drama-band',
  ]) {
    assert.match(root, new RegExp(`${token}:`), `CenterPanel root must define ${token}`);
    assert.match(style, new RegExp(`var\\(${token}`), `CenterPanel styles must consume ${token}`);
  }

  for (const [localToken, expectedValue] of [
    ['--short-drama-ink', String.raw`var\(--control-text-hover\)`],
    ['--short-drama-muted', String.raw`var\(--control-text-muted\)`],
    ['--short-drama-border', String.raw`var\(--control-border\)`],
    ['--short-drama-surface', String.raw`var\(--color-bg-primary\)`],
    [
      '--short-drama-band',
      String.raw`color-mix\(in srgb,\s*var\(--control-bg\)\s+92%,\s*var\(--color-bg-elevated\)\)`,
    ],
  ]) {
    assert.match(
      root,
      new RegExp(`${localToken}\\s*:\\s*${expectedValue};`),
      `${localToken} must map to the shared theme contract`,
    );
  }
});
