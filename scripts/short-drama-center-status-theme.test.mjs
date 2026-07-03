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

function selectorGroupBlock(style, selectors) {
  const selectorPattern = selectors
    .map((selector) => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*,\\s*');
  const pattern = new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = style.match(pattern);
  assert.ok(match, `${selectors.join(', ')} block must exist`);
  return match[1];
}

test('short drama status pill indicators use local status tokens', () => {
  const style = readCenterStyle();
  const root = rootBlock(style);

  for (const token of [
    '--short-drama-status-ready',
    '--short-drama-status-generating',
    '--short-drama-status-stale',
    '--short-drama-status-error',
  ]) {
    assert.match(root, new RegExp(`${token}:`), `CenterPanel root must define ${token}`);
    assert.match(style, new RegExp(`var\\(${token}\\)`), `status pills must consume ${token}`);
  }

  for (const [selectors, token] of [
    [['.short-drama-pill--ready::before', '.short-drama-pill--done::before'], '--short-drama-status-ready'],
    [
      [
        '.short-drama-pill--generating::before',
        '.short-drama-pill--reviewing::before',
        '.short-drama-pill--revising::before',
      ],
      '--short-drama-status-generating',
    ],
    [['.short-drama-pill--stale::before'], '--short-drama-status-stale'],
    [
      [
        '.short-drama-pill--error::before',
        '.short-drama-pill--unsupported::before',
        '.short-drama-pill--needs_intervention::before',
      ],
      '--short-drama-status-error',
    ],
  ]) {
    const block = selectorGroupBlock(style, selectors);
    assert.match(block, new RegExp(`background:\\s*var\\(${token}\\);`), `${selectors.join(', ')} must use ${token}`);
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}/, `${selectors.join(', ')} must not use raw hex colors`);
  }

  for (const globalToken of ['--color-success', '--color-warning', '--color-accent-500', '--color-error']) {
    assert.match(root, new RegExp(globalToken), `status local tokens must map to ${globalToken}`);
  }
});
