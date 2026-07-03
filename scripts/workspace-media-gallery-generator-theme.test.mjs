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

function generatorSection(style) {
  const start = style.indexOf('.workspace-media-card.is-pending');
  const end = style.indexOf('.workspace-media-card__fallback');
  assert.notEqual(start, -1, 'Gallery pending card styles must exist');
  assert.notEqual(end, -1, 'Gallery fallback styles must exist');
  assert.ok(end > start, 'Gallery generator section must be before fallback styles');
  return style.slice(start, end);
}

test('workspace media gallery pending generator styles use local visual tokens', () => {
  const style = readGalleryStyle();
  const root = rootBlock(style);
  const section = generatorSection(style);

  for (const token of [
    '--workspace-media-generator-glow',
    '--workspace-media-generator-surface-start',
    '--workspace-media-generator-surface-end',
    '--workspace-media-generator-text',
    '--workspace-media-generator-ring',
    '--workspace-media-generator-grid',
    '--workspace-media-generator-outline',
    '--workspace-media-generator-beam',
    '--workspace-media-generator-beam-hot',
    '--workspace-media-generator-core',
  ]) {
    assert.match(root, new RegExp(`${token}:`), `Gallery root must define ${token}`);
    assert.match(section, new RegExp(`var\\(${token}`), `Generator section must consume ${token}`);
  }

  for (const rawColor of [
    'rgba(56, 189, 248',
    'rgba(125, 211, 252',
    'rgba(34, 211, 238',
    'rgba(15, 23, 42',
    'rgba(17, 24, 39',
    '#e5f4ff',
  ]) {
    assert.equal(section.includes(rawColor), false, `Generator section must not use raw ${rawColor}`);
  }
});
