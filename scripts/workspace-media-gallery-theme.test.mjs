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

test('workspace media gallery styles use local theme tokens instead of void iframe tokens', () => {
  const style = readGalleryStyle();
  const root = rootBlock(style);

  assert.equal(style.includes('--void-'), false, 'Gallery styles must not directly depend on --void-* tokens');

  for (const token of [
    '--workspace-media-gallery-bg',
    '--workspace-media-gallery-text',
    '--workspace-media-gallery-muted',
    '--workspace-media-gallery-border',
    '--workspace-media-gallery-surface',
    '--workspace-media-gallery-accent',
    '--workspace-media-gallery-error-text',
    '--workspace-media-gallery-error-border',
    '--workspace-media-gallery-error-bg',
  ]) {
    assert.match(root, new RegExp(`${token}:`), `Gallery root must define ${token}`);
    assert.match(style, new RegExp(`var\\(${token}`), `Gallery styles must consume ${token}`);
  }

  for (const [localToken, expectedValue] of [
    ['--workspace-media-gallery-bg', String.raw`var\(--color-bg-primary\)`],
    ['--workspace-media-gallery-text', String.raw`var\(--control-text-hover\)`],
    ['--workspace-media-gallery-muted', String.raw`var\(--control-text-muted\)`],
    ['--workspace-media-gallery-border', String.raw`var\(--control-border\)`],
    [
      '--workspace-media-gallery-surface',
      String.raw`color-mix\(in srgb,\s*var\(--control-bg\)\s+88%,\s*var\(--color-bg-elevated\)\)`,
    ],
    ['--workspace-media-gallery-accent', String.raw`var\(--color-accent-500\)`],
    ['--workspace-media-gallery-error-text', String.raw`var\(--status-error-text\)`],
    ['--workspace-media-gallery-error-border', String.raw`var\(--status-error-border\)`],
    ['--workspace-media-gallery-error-bg', String.raw`var\(--status-error-bg\)`],
  ]) {
    assert.match(
      root,
      new RegExp(`${localToken}\\s*:\\s*${expectedValue};`),
      `${localToken} must map to the shared theme contract`,
    );
  }
});
