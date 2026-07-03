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

function mediaPreviewSection(style) {
  const start = style.indexOf('.short-drama-media-preview');
  const end = style.indexOf('.short-drama-card__body');
  assert.notEqual(start, -1, 'Short drama media preview styles must exist');
  assert.notEqual(end, -1, 'Short drama card body styles must exist');
  assert.ok(end > start, 'Media preview section must be before card body');
  return style.slice(start, end);
}

test('short drama media preview styles use local media preview tokens', () => {
  const style = readCenterStyle();
  const root = rootBlock(style);
  const section = mediaPreviewSection(style);

  for (const token of [
    '--short-drama-preview-gradient-start',
    '--short-drama-preview-gradient-end',
    '--short-drama-preview-grid-line',
    '--short-drama-preview-on-media',
    '--short-drama-preview-media-fallback',
    '--short-drama-preview-empty-start',
    '--short-drama-preview-empty-end',
    '--short-drama-preview-empty-grid-line',
    '--short-drama-preview-generating-start',
    '--short-drama-preview-generating-end',
    '--short-drama-preview-generating-grid-line',
    '--short-drama-preview-caption-bg',
    '--short-drama-preview-caption-muted',
  ]) {
    assert.match(root, new RegExp(`${token}:`), `CenterPanel root must define ${token}`);
    assert.match(section, new RegExp(`var\\(${token}`), `Media preview section must consume ${token}`);
  }

  for (const rawColor of [
    'rgba(28, 38, 50',
    'rgba(30, 132, 141',
    'rgba(255, 255, 255',
    'rgba(100, 116, 139',
    'rgba(148, 163, 184',
    'rgba(15, 118, 110',
    'rgba(14, 165, 233',
    'rgba(15, 23, 42',
    '#111827',
    'color: white',
  ]) {
    assert.equal(section.includes(rawColor), false, `Media preview section must not use raw ${rawColor}`);
  }
});
