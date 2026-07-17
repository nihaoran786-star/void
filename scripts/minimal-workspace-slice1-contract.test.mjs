import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const read = relativePath => readFileSync(join(repoRoot, relativePath), 'utf8');

const presentation = read('src/web-ui/src/app/presentation/workspacePresentation.ts');
const presentationStyles = read(
  'src/web-ui/src/app/presentation/workspacePresentationStyles.ts',
);
const presentationBundle = read(
  'src/web-ui/src/app/presentation/minimalWorkspacePresentation.scss',
);
const main = read('src/web-ui/src/main.tsx');
const appLayout = read('src/web-ui/src/app/layout/AppLayout.tsx');
const chatInput = read('src/web-ui/src/flow_chat/components/ChatInput.tsx');
const embeddedDriver = read('tests/e2e/config/embedded-driver.ts');
const staticBaseStyles = [
  'src/web-ui/src/app/layout/AppLayout.scss',
  'src/web-ui/src/app/components/NavPanel/NavPanel.scss',
  'src/web-ui/src/flow_chat/components/ChatInput.scss',
  'src/web-ui/src/flow_chat/components/ModelSelector.scss',
  'src/web-ui/src/shared/services/preview/MediaPreviewOverlay.scss',
].map(path => [path, read(path)]);
const scopedStyles = [
  'src/web-ui/src/app/layout/AppLayout.minimal.scss',
  'src/web-ui/src/app/components/NavPanel/NavPanel.minimal.scss',
  'src/web-ui/src/flow_chat/components/ChatInput.minimal.scss',
  'src/web-ui/src/flow_chat/components/ModelSelector.minimal.scss',
].map(path => [path, read(path)]);

test('presentation preference stays pure and provides an explicit rollback', () => {
  assert.doesNotMatch(
    presentation,
    /@tauri-apps|FlowChatManager|FlowChatStore|workspaceAPI|Manager|Service/,
  );
  assert.match(presentation, /'classic' \| 'minimal'/);
  assert.match(presentation, /parseWorkspacePresentation\(configured\)/);
  assert.match(presentation, /parseWorkspacePresentation\(stored\)/);
  assert.match(presentation, /\?\? 'classic'/);
  assert.match(presentation, /WORKSPACE_PRESENTATION_QUERY_KEY = 'void-ui'/);
});

test('only the application shell selects the presentation', () => {
  assert.match(appLayout, /workspacePresentationClassName\(workspacePresentation\)/);
  assert.match(appLayout, /data-ui-presentation=\{workspacePresentation\}/);
  assert.doesNotMatch(chatInput, /workspacePresentation|void-ui--minimal/);
});

test('slice-one styles stay scoped and token driven', () => {
  for (const [path, stylesheet] of scopedStyles) {
    assert.match(stylesheet, /\.void-(?:app-layout\.)?void-ui--minimal|\.void-ui--minimal/);
    assert.doesNotMatch(stylesheet, /#[0-9a-f]{3,8}\b|rgba?\(/i, `${path} contains a raw color`);
    assert.doesNotMatch(stylesheet, /linear-gradient|radial-gradient|--(?:glass|glow|blur|color-purple)-/);
    for (const match of stylesheet.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;]+);/g)) {
      assert.equal(match[1].trim(), 'none', `${path} enables a backdrop filter`);
    }
    assert.match(stylesheet, /--workspace-/);
  }
});

test('minimal presentation chrome is loaded before first paint but outside the entry CSS', () => {
  assert.match(presentationStyles, /presentation !== 'minimal'/);
  assert.match(
    presentationStyles,
    /import\('\.\/minimalWorkspacePresentation\.scss'\)/,
  );
  assert.match(main, /loadWorkspacePresentationStyles/);
  assert.match(main, /\(\) => loadWorkspacePresentationStyles\(\)/);

  for (const [path, stylesheet] of staticBaseStyles) {
    assert.doesNotMatch(
      stylesheet,
      /@use ['"].*\.minimal(?:\.scss)?['"]|@include minimal\.styles/,
      `${path} statically includes minimal presentation CSS`,
    );
  }

  for (const mixin of [
    'app-layout',
    'nav-panel',
    'chat-input',
    'model-selector',
    'media-preview',
  ]) {
    assert.match(presentationBundle, new RegExp(`@include ${mixin}\\.styles;`));
  }
});

test('existing navigation and composer controllers are not duplicated', () => {
  assert.equal((appLayout.match(/<WorkspaceBody/g) ?? []).length, 1);
  assert.equal((appLayout.match(/<FloatingMiniChat/g) ?? []).length, 1);
  assert.doesNotMatch(presentation, /useEffect|subscribe|addEventListener/);
});

test('scoped descendant state selectors do not duplicate the presentation ancestor', () => {
  for (const [, stylesheet] of scopedStyles) {
    assert.doesNotMatch(stylesheet, /&[^,\n{]*&/);
  }
});

test('desktop visual verification reuses the single WebDriver session', () => {
  assert.doesNotMatch(embeddedDriver, /createProbeSession|deleteProbeSession/);
  assert.match(embeddedDriver, /await waitForActiveSessionDocumentReady\(\)/);
});
