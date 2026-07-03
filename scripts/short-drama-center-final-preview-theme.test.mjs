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

function finalPreviewSection(style) {
  const start = style.indexOf('.short-drama-center__final-preview');
  const end = style.indexOf('.short-drama-center__play-mark', start);
  assert.notEqual(start, -1, 'Short drama final preview styles must exist');
  assert.notEqual(end, -1, 'Short drama play mark styles must exist');
  assert.ok(end > start, 'Final preview section must be before play mark');
  return style.slice(start, end);
}

test('short drama final preview styles use local final preview tokens', () => {
  const style = readCenterStyle();
  const root = rootBlock(style);
  const section = finalPreviewSection(style);

  for (const token of [
    '--short-drama-final-preview-surface',
    '--short-drama-final-preview-border',
    '--short-drama-final-preview-frame-start',
    '--short-drama-final-preview-frame-end',
    '--short-drama-final-preview-frame-grid-line',
    '--short-drama-final-preview-on-frame',
    '--short-drama-final-preview-media-border',
    '--short-drama-final-preview-empty-start',
    '--short-drama-final-preview-empty-end',
    '--short-drama-final-preview-empty-grid-line',
  ]) {
    assert.match(root, new RegExp(`${token}:`), `CenterPanel root must define ${token}`);
    assert.match(section, new RegExp(`var\\(${token}`), `Final preview section must consume ${token}`);
  }

  for (const rawColor of [
    '#eef4f8',
    'rgba(26, 32, 44',
    'rgba(51, 65, 85',
    'rgba(255, 255, 255',
    'rgba(100, 116, 139',
    'rgba(148, 163, 184',
    'color: white',
  ]) {
    assert.equal(section.includes(rawColor), false, `Final preview section must not use raw ${rawColor}`);
  }
});
