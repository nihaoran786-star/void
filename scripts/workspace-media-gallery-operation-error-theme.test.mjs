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

function operationErrorBlock(style) {
  const match = style.match(/\.workspace-media-gallery__operation-error\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'Gallery operation-error block must exist');
  return match[1];
}

test('workspace media gallery operation errors use local error tokens', () => {
  const style = readGalleryStyle();
  const block = operationErrorBlock(style);

  assert.match(style, /--workspace-media-gallery-error-text:/, 'Gallery root must define error text token');
  assert.match(style, /--workspace-media-gallery-error-border:/, 'Gallery root must define error border token');
  assert.match(block, /var\(--workspace-media-gallery-error-border\)/, 'Operation error border must use local error border token');
  assert.match(block, /var\(--workspace-media-gallery-error-text\)/, 'Operation error text must use local error text token');

  for (const rawColor of ['#dc2626', '#b91c1c']) {
    assert.equal(block.includes(rawColor), false, `Operation error block must not use raw ${rawColor}`);
  }
});
