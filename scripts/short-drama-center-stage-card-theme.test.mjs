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

function stageCardSection(style) {
  const start = style.indexOf('.short-drama-card {');
  const end = style.indexOf('.short-drama-center__stage {');
  assert.notEqual(start, -1, 'Short drama card styles must exist');
  assert.notEqual(end, -1, 'Short drama stage styles must exist');
  assert.ok(end > start, 'Stage card section must be before stage styles');
  return style.slice(start, end);
}

test('short drama stage card styles use local stage card tokens', () => {
  const style = readCenterStyle();
  const root = rootBlock(style);
  const section = stageCardSection(style);

  for (const token of [
    '--short-drama-card-surface',
    '--short-drama-card-poster-on-media',
    '--short-drama-card-poster-gradient-start',
    '--short-drama-card-poster-gradient-end',
    '--short-drama-card-poster-grid-line',
    '--short-drama-card-stage-script-start',
    '--short-drama-card-stage-script-end',
    '--short-drama-card-stage-assets-start',
    '--short-drama-card-stage-assets-end',
    '--short-drama-card-stage-storyboards-start',
    '--short-drama-card-stage-storyboards-end',
    '--short-drama-card-stage-video-start',
    '--short-drama-card-stage-video-end',
    '--short-drama-card-stage-post-start',
    '--short-drama-card-stage-post-end',
    '--short-drama-card-notice-accent',
    '--short-drama-card-media-ref-surface',
    '--short-drama-stage-rail-surface',
  ]) {
    assert.match(root, new RegExp(`${token}:`), `CenterPanel root must define ${token}`);
    assert.match(section, new RegExp(`var\\(${token}`), `Stage card section must consume ${token}`);
  }

  for (const rawColor of [
    '#edf4f7',
    '#eef4f8',
    '#2f3a4a',
    '#64748b',
    '#1f3b3b',
    '#0f766e',
    '#2f2b46',
    '#6d5ca8',
    '#242533',
    '#b45309',
    '#333323',
    '#4d7c0f',
    '#d97706',
    'rgba(28, 38, 50',
    'rgba(30, 132, 141',
    'rgba(255, 255, 255',
    'color: white',
  ]) {
    assert.equal(section.includes(rawColor), false, `Stage card section must not use raw ${rawColor}`);
  }
});
