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

  for (const globalToken of [
    '--color-text-primary',
    '--color-text-secondary',
    '--border-base',
    '--color-bg-primary',
  ]) {
    assert.match(root, new RegExp(globalToken), `CenterPanel local tokens must map to ${globalToken}`);
  }
});
