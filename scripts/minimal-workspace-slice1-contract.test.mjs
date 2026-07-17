import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const read = relativePath => readFileSync(join(repoRoot, relativePath), 'utf8');

const presentation = read('src/web-ui/src/app/presentation/workspacePresentation.ts');
const appLayout = read('src/web-ui/src/app/layout/AppLayout.tsx');
const chatInput = read('src/web-ui/src/flow_chat/components/ChatInput.tsx');
const embeddedDriver = read('tests/e2e/config/embedded-driver.ts');
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
