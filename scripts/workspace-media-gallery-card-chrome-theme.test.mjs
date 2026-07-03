import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const galleryPath = join(
  repoRoot,
  'src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.scss',
);

function readGalleryStyle() {
  return readFileSync(galleryPath, 'utf8');
}

function rootBlock(style) {
  const match = style.match(/\.workspace-media-gallery\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'WorkspaceMediaGallery root block must exist');
  return match[1];
}

function cardChromeSection(style) {
  const start = style.indexOf('.workspace-media-card__fallback');
  const end = style.indexOf('.workspace-media-gallery__views');
  assert.notEqual(start, -1, 'Gallery fallback styles must exist');
  assert.notEqual(end, -1, 'Gallery views styles must exist');
  assert.ok(end > start, 'Gallery card chrome section must be before view controls');
  return style.slice(start, end);
}

test('workspace media gallery card chrome styles use local visual tokens', () => {
  const style = readGalleryStyle();
  const root = rootBlock(style);
  const section = cardChromeSection(style);

  for (const token of [
    '--workspace-media-card-chrome-muted',
    '--workspace-media-card-chrome-soft-shadow',
    '--workspace-media-card-chrome-soft-fill',
    '--workspace-media-card-chrome-waveform-start',
    '--workspace-media-card-chrome-waveform-end',
    '--workspace-media-card-chrome-waveform-bar',
    '--workspace-media-card-chrome-glass',
    '--workspace-media-card-chrome-glass-strong',
    '--workspace-media-card-chrome-ink',
    '--workspace-media-card-chrome-type-ink',
    '--workspace-media-card-chrome-pending-type-bg',
    '--workspace-media-card-chrome-pending-type-text',
    '--workspace-media-card-chrome-pending-overlay-start',
    '--workspace-media-card-chrome-pending-overlay-mid',
    '--workspace-media-card-chrome-pending-overlay-text',
    '--workspace-media-card-chrome-pending-meta',
    '--workspace-media-card-chrome-overlay-start',
    '--workspace-media-card-chrome-overlay-mid',
    '--workspace-media-card-chrome-overlay-text',
    '--workspace-media-card-chrome-overlay-meta',
    '--workspace-media-card-chrome-unavailable',
    '--workspace-media-card-chrome-divider',
  ]) {
    assert.match(root, new RegExp(`${token}:`), `Gallery root must define ${token}`);
    assert.match(section, new RegExp(`var\\(${token}`), `Card chrome section must consume ${token}`);
  }

  for (const rawColor of [
    '#64748b',
    '#0f172a',
    '#334155',
    '#dff7ff',
    '#e6f7ff',
    '#f8fafc',
    '#fecaca',
    'rgba(15, 23, 42',
    'rgba(148, 163, 184',
    'rgba(241, 245, 249',
    'rgba(226, 232, 240',
    'rgba(71, 85, 105',
    'rgba(255, 255, 255',
    'rgba(14, 165, 233',
    'rgba(8, 13, 23',
  ]) {
    assert.equal(section.includes(rawColor), false, `Card chrome section must not use raw ${rawColor}`);
  }
});
