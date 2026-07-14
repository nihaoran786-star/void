import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const read = relativePath => readFileSync(join(repoRoot, relativePath), 'utf8');
const tokens = read('src/web-ui/src/component-library/styles/tokens.scss');
const button = read('src/web-ui/src/component-library/components/Button/Button.scss');
const iconButton = read('src/web-ui/src/component-library/components/IconButton/IconButton.scss');
const select = read('src/web-ui/src/component-library/components/Select/Select.scss');
const badge = read('src/web-ui/src/component-library/components/Badge/Badge.scss');
const tag = read('src/web-ui/src/component-library/components/Tag/Tag.scss');

test('component tokens define semantic control aliases from existing theme variables', () => {
  const expectedMappings = new Map([
    ['--control-bg', '--element-bg-base'],
    ['--control-bg-hover', '--element-bg-medium'],
    ['--control-bg-active', '--element-bg-soft'],
    ['--control-border', '--border-base'],
    ['--control-border-hover', '--border-medium'],
    ['--control-border-focus', '--color-accent-400'],
    ['--control-text', '--color-text-secondary'],
    ['--control-text-hover', '--color-text-primary'],
    ['--control-text-muted', '--color-text-muted'],
    ['--control-focus-ring', '--color-accent-400'],
  ]);

  for (const [alias, source] of expectedMappings) {
    assert.match(tokens, new RegExp(`${alias}:\\s*var\\(${source}\\)`));
  }

  for (const token of [
    '--control-disabled-opacity',
    '--control-radius',
    '--control-height-xs',
    '--control-height-sm',
    '--control-height-md',
    '--control-height-lg',
    '--control-square-xs',
    '--control-square-sm',
    '--control-square-md',
    '--control-square-lg',
    '--control-icon-xs',
    '--control-icon-sm',
    '--control-icon-md',
    '--control-icon-lg',
  ]) {
    assert.match(tokens, new RegExp(`${token}:`), `Missing ${token}`);
  }
});

test('component tokens define the complete shared status contract', () => {
  for (const tone of ['neutral', 'info', 'success', 'warning', 'error']) {
    for (const role of ['bg', 'border', 'text']) {
      assert.match(tokens, new RegExp(`--status-${tone}-${role}:`));
    }
  }
});

test('buttons consume the shared control contract', () => {
  for (const [name, styles] of [['Button', button], ['IconButton', iconButton]]) {
    for (const token of ['--control-bg', '--control-bg-hover', '--control-text', '--control-focus-ring']) {
      assert.match(styles, new RegExp(`var\\(${token}\\)`), `${name} must consume ${token}`);
    }
    assert.doesNotMatch(styles, /transition:\s*all/, `${name} must not transition every property`);
  }

  const combined = `${button}\n${iconButton}`;
  for (const tone of ['success', 'error']) {
    assert.match(combined, new RegExp(`var\\(--status-${tone}-bg\\)`));
    assert.match(combined, new RegExp(`var\\(--status-${tone}-text\\)`));
  }
});

test('select and labels consume shared control and status contracts', () => {
  for (const token of [
    '--control-bg',
    '--control-bg-hover',
    '--control-border',
    '--control-border-focus',
    '--control-text',
    '--control-text-muted',
    '--control-focus-ring',
    '--control-disabled-opacity',
  ]) {
    assert.match(select, new RegExp(`var\\(${token}\\)`), `Select must consume ${token}`);
  }

  const labels = `${badge}\n${tag}`;
  for (const tone of ['neutral', 'info', 'success', 'warning', 'error']) {
    assert.match(labels, new RegExp(`var\\(--status-${tone}-bg\\)`));
    assert.match(labels, new RegExp(`var\\(--status-${tone}-text\\)`));
  }
  assert.doesNotMatch(tag, /transition:\s*all/);
});
