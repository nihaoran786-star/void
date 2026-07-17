import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const read = relativePath => readFileSync(join(repoRoot, relativePath), 'utf8');

const appLayout = read('src/web-ui/src/app/layout/AppLayout.tsx');
const shortDramaPanel = read(
  'src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.tsx',
);
const shortDramaBase = read(
  'src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.scss',
);
const shortDramaMinimal = read(
  'src/web-ui/src/app/components/panels/content-canvas/short-drama/ShortDramaCenterPanel.minimal.scss',
);
const previewOverlay = read('src/web-ui/src/shared/services/preview/MediaPreviewOverlay.tsx');
const previewBase = read('src/web-ui/src/shared/services/preview/MediaPreviewOverlay.scss');
const previewMinimal = read('src/web-ui/src/shared/services/preview/MediaPreviewOverlay.minimal.scss');
const presentationBundle = read(
  'src/web-ui/src/app/presentation/minimalWorkspacePresentation.scss',
);
const mediaGallery = read(
  'src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.tsx',
);
const mediaGalleryBase = read(
  'src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.scss',
);
const mediaGalleryMinimal = read(
  'src/web-ui/src/app/components/panels/content-canvas/workspace-media/WorkspaceMediaGallery.minimal.scss',
);

test('slice-two visual rules are additive and limited to the existing presentation mode', () => {
  assert.match(shortDramaBase, /@use '\.\/ShortDramaCenterPanel\.minimal' as minimal;/);
  assert.match(shortDramaBase, /@include minimal\.styles;/);
  assert.doesNotMatch(previewBase, /MediaPreviewOverlay\.minimal|@include minimal\.styles/);
  assert.match(
    presentationBundle,
    /@use '\.\.\/\.\.\/shared\/services\/preview\/MediaPreviewOverlay\.minimal\.scss' as media-preview;/,
  );
  assert.match(presentationBundle, /@include media-preview\.styles;/);
  assert.match(mediaGalleryBase, /@use '\.\/WorkspaceMediaGallery\.minimal' as minimal;/);
  assert.match(mediaGalleryBase, /@include minimal\.styles;/);
  assert.match(shortDramaMinimal, /\.void-ui--minimal \.short-drama-center/);
  assert.match(previewMinimal, /\.media-preview-overlay\.void-ui--minimal/);
  assert.match(mediaGalleryMinimal, /\.void-ui--minimal \.workspace-media-gallery/);
});

test('minimal short-drama and preview styles remain semantic and GPU-quiet', () => {
  for (const [path, stylesheet] of [
    ['ShortDramaCenterPanel.minimal.scss', shortDramaMinimal],
    ['MediaPreviewOverlay.minimal.scss', previewMinimal],
    ['WorkspaceMediaGallery.minimal.scss', mediaGalleryMinimal],
  ]) {
    assert.match(stylesheet, /--workspace-/);
    assert.doesNotMatch(stylesheet, /#[0-9a-f]{3,8}\b|rgba?\(/i, `${path} contains a raw color`);
    assert.doesNotMatch(
      stylesheet,
      /linear-gradient|radial-gradient|repeating-linear-gradient|filter:\s*blur/i,
      `${path} enables decorative or expensive visual effects`,
    );
    for (const match of stylesheet.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/g)) {
      assert.equal(match[1].trim(), 'none', `${path} enables a backdrop filter`);
    }
    assert.doesNotMatch(stylesheet, /transition:\s*all\b/i, `${path} transitions every property`);
  }
});

test('short-drama runtime markup and media behavior are not forked by presentation', () => {
  assert.doesNotMatch(shortDramaPanel, /workspacePresentation|void-ui--minimal/);
  assert.equal((shortDramaPanel.match(/data-testid="short-drama-center"/g) ?? []).length, 2);
  assert.match(shortDramaPanel, /resolveWorkspaceMediaPreviewUrl/);
  assert.match(shortDramaPanel, /ensureShortDramaStageAgentSessions/);
  assert.match(shortDramaPanel, /openNativeStageAgentTab/);
  assert.match(shortDramaPanel, /demoMode: staticFixtureEpisodeCount !== undefined/);
  assert.doesNotMatch(mediaGallery, /workspacePresentation|void-ui--minimal/);
  assert.match(mediaGallery, /resolveWorkspaceMediaPreviewUrl/);
  assert.match(mediaGallery, /openMediaPreviewPanel/);
});

test('the shared overlay accepts only optional presentation chrome from the shell', () => {
  assert.match(previewOverlay, /interface MediaPreviewOverlayProps \{\s*className\?: string;/);
  assert.match(
    appLayout,
    /<MediaPreviewOverlay className=\{workspacePresentationClassName\(workspacePresentation\)\} \/>/,
  );
  assert.doesNotMatch(
    previewOverlay,
    /workspacePresentation|localStorage|FlowChatManager|FlowChatStore|@tauri-apps/,
  );
  assert.equal((appLayout.match(/<MediaPreviewOverlay/g) ?? []).length, 1);
});

test('the shared overlay owns a reversible keyboard-focus boundary', () => {
  assert.match(previewOverlay, /MEDIA_PREVIEW_FOCUSABLE_SELECTOR/);
  assert.match(previewOverlay, /previouslyFocusedElementRef/);
  assert.match(previewOverlay, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(previewOverlay, /event\.key !== 'Tab'/);
  assert.match(previewOverlay, /previouslyFocusedElement\.focus\(\)/);
});
