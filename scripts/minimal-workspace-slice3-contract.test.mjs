import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const repoRoot = process.cwd();
const read = relativePath => readFileSync(join(repoRoot, relativePath), 'utf8');

const editorArea = read(
  'src/web-ui/src/app/components/panels/content-canvas/editor-area/EditorArea.tsx',
);
const teamControls = read(
  'src/web-ui/src/app/components/panels/content-canvas/editor-area/ShortDramaTeamPanelControls.tsx',
);
const teamControlsContainer = read(
  'src/web-ui/src/app/components/panels/content-canvas/editor-area/ShortDramaTeamPanelControlsContainer.tsx',
);
const teamSelector = read(
  'src/web-ui/src/app/components/panels/content-canvas/editor-area/shortDramaTeamPanelPresentation.ts',
);
const teamStyles = read(
  'src/web-ui/src/app/components/panels/content-canvas/editor-area/EditorArea.minimal.scss',
);
const baseStyles = read(
  'src/web-ui/src/app/components/panels/content-canvas/editor-area/EditorArea.scss',
);
const presentationBundle = read(
  'src/web-ui/src/app/presentation/minimalWorkspacePresentation.scss',
);

test('slice-three team layout is an additive minimal-presentation layer', () => {
  assert.match(baseStyles, /\.short-drama-team-panel-controls\s*\{\s*display:\s*none;/);
  assert.match(teamStyles, /\.void-ui--minimal \.canvas-editor-area\.is-short-drama-team/);
  assert.match(
    presentationBundle,
    /@use '\.\.\/components\/panels\/content-canvas\/editor-area\/EditorArea\.minimal\.scss' as editor-area;/,
  );
  assert.match(presentationBundle, /@include editor-area\.styles;/);
});

test('team selector reads canvas state without importing runtime services', () => {
  assert.match(teamSelector, /'closed' \| 'rail' \| 'open'/);
  assert.match(teamSelector, /presentation !== 'minimal'/);
  assert.match(editorArea, /presentation:\s*workspacePresentation/);
  assert.match(teamSelector, /tab\.content\.type === 'btw-session'/);
  assert.match(teamSelector, /shortDramaStage/);
  assert.match(teamSelector, /secondary-has-mixed-content/);
  assert.doesNotMatch(
    teamSelector,
    /FlowChatStore|FlowChatManager|@tauri-apps|Service|workspaceAPI|localStorage|sessionStorage/,
  );
});

test('team controls reuse real secondary tabs and do not own agent lifecycle', () => {
  assert.match(
    editorArea,
    /React\.lazy\(\s*\(\) => import\('\.\/ShortDramaTeamPanelControlsContainer'\)/,
  );
  assert.match(
    teamControlsContainer,
    /<ShortDramaTeamPanelControls \{\.\.\.props\} statuses=\{statuses\} \/>/,
  );
  assert.match(editorArea, /switchToTab\(tabId, 'secondary'\)/);
  assert.match(editorArea, /setActiveGroup\('secondary'\)/);
  assert.match(editorArea, /data-short-drama-team-mode=\{shortDramaTeamMode\}/);
  assert.doesNotMatch(
    `${editorArea}\n${teamControls}\n${teamControlsContainer}`,
    /createChatSession|sendMessage|cancelSession|pauseSession|resumeSession|skillPolicy|agentConfig|FlowChatStore|FlowChatManager/,
  );
});

test('rail remains keyboard-visible while hidden agent content is non-interactive', () => {
  assert.match(teamControls, /type="button"/);
  assert.match(teamControls, /const agentLabel = \[tab\.title, statusLabel, activityLabel\]/);
  assert.match(teamControls, /aria-label=\{agentLabel\}/);
  assert.match(teamControls, /aria-pressed=\{isActive\}/);
  assert.match(teamControls, /aria-expanded=\{isOpen\}/);
  assert.match(teamStyles, /visibility:\s*hidden;/);
  assert.match(teamStyles, /pointer-events:\s*none;/);
  assert.match(teamStyles, /:focus-visible/);
  assert.match(editorArea, /shortDramaTeamMode !== 'rail'/);
  assert.match(
    editorArea,
    /renderEditorGroup\('secondary', secondaryGroup, isSecondarySceneActive\)/,
  );
});

test('team styling is token driven, quiet, and responsive', () => {
  assert.match(teamStyles, /--workspace-/);
  assert.match(teamStyles, /width:\s*44px !important/);
  assert.match(
    teamStyles,
    /is-short-drama-team-open[\s\S]*?canvas-editor-area__primary[\s\S]*?width:\s*100% !important/,
  );
  assert.match(
    teamStyles,
    /is-short-drama-team-open[\s\S]*?canvas-editor-area__secondary[\s\S]*?position:\s*absolute[\s\S]*?width:\s*min\([\s\S]*?420px,[\s\S]*?100%[\s\S]*?\)\s*!important[\s\S]*?max-width:\s*420px/,
  );
  assert.match(
    teamStyles,
    /:has\(\.short-drama-center,\s*\.workspace-media-gallery\)[\s\S]*?min-width:\s*min\(420px,\s*36vw\)/,
  );
  assert.doesNotMatch(teamStyles, /--short-drama-team-(?:primary|secondary)-ratio/);
  assert.doesNotMatch(editorArea, /setSplitRatio\(0\.7\)/);
  assert.doesNotMatch(teamControls, /lucide-react/);
  assert.doesNotMatch(teamStyles, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.doesNotMatch(
    teamStyles,
    /linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur|transition:\s*all\b/i,
  );
});
