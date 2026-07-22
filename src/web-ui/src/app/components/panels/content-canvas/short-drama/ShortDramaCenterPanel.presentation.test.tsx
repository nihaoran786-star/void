// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panelSource = readFileSync(new URL('./ShortDramaCenterPanel.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const panelStyles = readFileSync(new URL('./ShortDramaCenterPanel.scss', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const minimalPanelStyles = readFileSync(new URL('./ShortDramaCenterPanel.minimal.scss', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const flexiblePanelSource = readFileSync(new URL('../../base/FlexiblePanel.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('ShortDramaCenterPanel presentation lifecycle contract', () => {
  it('receives the existing FlexiblePanel activity signal without conditional unmounting', () => {
    expect(flexiblePanelSource).toMatch(
      /<WorkspaceMediaGallery[\s\S]{0,220}isActive=\{isActive\}/
    );
    expect(flexiblePanelSource).toMatch(
      /<ShortDramaCenterPanel[\s\S]{0,320}isActive=\{isActive\}/
    );
    expect(panelSource).toContain('isActive?: boolean;');
    expect(panelSource).toContain('isActive = true,');
  });

  it('gates only presentation polling, media scanning, scrolling, and local media playback', () => {
    expect(panelSource).toContain("if (!isActive || state.status !== 'empty' || !workspacePath)");
    expect(panelSource).toContain("if (!isActive) {\n      return undefined;\n    }\n    if (!workspacePath || state.status !== 'ready')");
    expect(panelSource).toContain("if (!isActive || !targetEpisodeId || state.status !== 'ready')");
    expect(panelSource).toContain("if (!isActive || selectedStage !== 'script')");
    expect(panelSource).toContain("querySelectorAll<HTMLMediaElement>('video, audio')");
    expect(panelSource).toContain('window.clearTimeout(retryTimeout)');
  });

  it('keeps project, FlowChat, subagent, runtime, and main-AI effects outside the activity gate', () => {
    const agentAndProjectEffects = sourceBetween(
      panelSource,
      'useEffect(() => connectShortDramaProjectChangedEventsToToolRunBus()',
      "if (!isActive || state.status !== 'empty'"
    );
    const runtimeBridgeEffect = sourceBetween(
      panelSource,
      'const bridge = createShortDramaRuntimeBridge',
      'const mediaRefreshToken = useWorkspaceMediaRefreshStore'
    );
    const mainAiEffect = sourceBetween(
      panelSource,
      'const exported = createShortDramaMainAIContextExport',
      "if (state.status !== 'ready' || !workspaceManifestAdapter || !workspacePath)"
    );
    const runtimeFocusEffect = sourceBetween(
      panelSource,
      'void writeShortDramaRuntimeFocus',
      'if (!activeStageWorkspace)'
    );
    const stageAgentTabEffects = sourceBetween(
      panelSource,
      'const result = openNativeStageAgentTab(activeStageWorkspace)',
      'setScriptContent(baseScriptDocument?.content)'
    );

    expect(agentAndProjectEffects).not.toContain('!isActive');
    expect(agentAndProjectEffects).toContain('flowChatStore.subscribe');
    expect(agentAndProjectEffects).toContain('ensureShortDramaStageAgentSessions');
    expect(agentAndProjectEffects).toContain('libraryService.loadProject(workspacePath)');
    expect(runtimeBridgeEffect).not.toContain('!isActive');
    expect(runtimeBridgeEffect).toContain('connectShortDramaRuntimeBridgeToEventBus');
    expect(mainAiEffect).not.toContain('!isActive');
    expect(mainAiEffect).toContain('syncShortDramaMainAIContextExport');
    expect(runtimeFocusEffect).not.toContain('!isActive');
    expect(runtimeFocusEffect).toContain('writeShortDramaRuntimeFocus');
    expect(stageAgentTabEffects).not.toContain('!isActive');
    expect(stageAgentTabEffects).toContain('openNativeStageAgentTab');
  });

  it('waits for persisted stage-agent bindings before bootstrapping new sessions', () => {
    expect(panelSource).toContain(
      'const [stageAgentBindingsLoaded, setStageAgentBindingsLoaded] = useState(false);'
    );
    expect(panelSource).toContain(
      'if (!workspacePath || !workspaceManifestAdapter || !stageAgentBindingsLoaded || isStageAgentBootstrapping)'
    );
    expect(panelSource).toContain('setStageAgentBindingsLoaded(true);');
    expect(panelSource).toContain('.finally(() => {\n        setIsStageAgentBootstrapping(false);\n      });');
  });

  it('keeps an empty project compact without removing the ready-project scroll anchor', () => {
    const emptyProjectBranch = sourceBetween(
      panelSource,
      "if (state.status === 'empty') {",
      "if (state.status === 'unsupported') {"
    );

    expect(emptyProjectBranch).toContain('<ShortDramaState');
    expect(emptyProjectBranch).toContain('compact');
    expect(emptyProjectBranch).not.toContain('short-drama-center__scroll-spacer');
    expect(panelSource.match(/short-drama-center__scroll-spacer/g)).toHaveLength(1);
    expect(panelStyles).toMatch(
      /\.short-drama-center__state\.is-compact \{[\s\S]*?min-height: 0;[\s\S]*?align-content: start;[\s\S]*?justify-items: start;/,
    );
    expect(minimalPanelStyles).toMatch(
      /\.void-ui--minimal \.short-drama-center__state\.is-compact \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/,
    );
  });
});

describe('ShortDramaCenterPanel storyboard disclosure contract', () => {
  const storyboardGrid = sourceBetween(
    panelSource,
    'function StoryboardGrid({',
    'function openShortDramaArtifactPreview('
  );

  it('owns one storyboard-only expansion id above every episode section', () => {
    expect(panelSource).toContain(
      'const [expandedStoryboardArtifactId, setExpandedStoryboardArtifactId] = useState<string>();'
    );
    expect(panelSource).toContain('expandedStoryboardArtifactId={expandedStoryboardArtifactId}');
    expect(panelSource).toContain('onStoryboardExpandedChange={setExpandedStoryboardArtifactId}');
    expect(storyboardGrid).toContain('expandedArtifactId?: string;');
    expect(storyboardGrid).not.toContain('activeArtifactFocusByStage');
  });

  it('renders one tile media preview with a scene badge behind a full-tile toggle', () => {
    expect(storyboardGrid).toContain(
      '<MediaPreview artifact={artifact} mediaEntry={mediaEntry} t={t} variant="tile" />'
    );
    expect(storyboardGrid).toContain('className="short-drama-storyboard-row__badge"');
    expect(storyboardGrid).toContain(
      "const cardTitle = t('shortDrama.storyboards.cardTitle', { scene: index + 1, shot: index + 1 });"
    );
    expect(storyboardGrid).toContain('aria-pressed={isSelected}');
    expect(storyboardGrid).toContain(
      '<ArtifactFocusButton artifact={artifact} onArtifactFocus={onArtifactFocus} t={t} />'
    );

    const toggle = sourceBetween(
      storyboardGrid,
      '<button\n              type="button"',
      '</button>'
    );
    expect(toggle).not.toContain('<MediaPreview');
    expect(toggle).toContain('{cardTitle}');
    expect(toggle).not.toContain('<StatusPill');
  });

  it('focuses once, then selects on first tap and opens the lightbox on second tap', () => {
    const toggle = sourceBetween(
      storyboardGrid,
      '<button\n              type="button"',
      '</button>'
    );
    expect(toggle).toContain(
      'event.stopPropagation();\n                handleTileActivate();'
    );
    expect(storyboardGrid).toContain(
      "const handleTileActivate = () => {\n          onArtifactFocus(artifact);\n          if (isSelected) {\n            handleOpenPreview();\n          } else {\n            onExpandedArtifactChange(artifact.id);\n          }\n        };"
    );
    expect(storyboardGrid).toContain('className="short-drama-storyboard-row__zoom"');
    expect(storyboardGrid).toContain('data-status={artifact.status}');
  });

  it('shows the summary and reference thumbnails only through the tile overlay', () => {
    expect(storyboardGrid).toContain('className="short-drama-storyboard-row__overlay"');
    expect(storyboardGrid).toContain('{artifact.summary}');
    expect(storyboardGrid).toContain('{isSelected && references.length > 0 && (');
    expect(storyboardGrid).toContain('className="short-drama-storyboard-row__references"');
    expect(storyboardGrid).toContain('createShortDramaStoryboardReferenceViewItems({');
    expect(storyboardGrid).not.toContain('<ArtifactRevisionStrip');
    expect(storyboardGrid).not.toContain('<StoryboardReferenceChips');
    expect(storyboardGrid).not.toContain('aria-expanded');
  });

  it('keeps the disclosure focus ring explicit in base and minimal themes', () => {
    expect(panelStyles).toMatch(
      /\.short-drama-storyboard-row__toggle:focus-visible \{[\s\S]*?outline: 2px solid/
    );
    expect(minimalPanelStyles).toMatch(
      /\.void-ui--minimal \.short-drama-storyboard-row__toggle:focus-visible,[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\)/
    );
  });

  it('overrides the later base card minimum height with a specific compact-row rule', () => {
    const baseCardRuleIndex = panelStyles.indexOf('.short-drama-card {');
    const compactRowRuleIndex = panelStyles.indexOf(
      '.short-drama-card.short-drama-storyboard-row {'
    );
    const compactRowRule = sourceBetween(
      panelStyles,
      '.short-drama-card.short-drama-storyboard-row {',
      '}'
    );

    expect(baseCardRuleIndex).toBeGreaterThanOrEqual(0);
    expect(compactRowRuleIndex).toBeGreaterThan(baseCardRuleIndex);
    expect(compactRowRule).toContain('min-height: 0;');
  });
});

describe('ShortDramaCenterPanel asset disclosure contract', () => {
  const assetStage = sourceBetween(
    panelSource,
    'function AssetStage({',
    'function PendingStageGenerationGrid({'
  );
  const pendingAssetCard = sourceBetween(
    panelSource,
    'function PendingAssetGenerationCard({',
    'function AssetAnchorCard({'
  );
  const assetAnchorCard = sourceBetween(
    panelSource,
    'function AssetAnchorCard({',
    'function ArtifactGrid({'
  );
  const artifactGrid = sourceBetween(
    panelSource,
    'function ArtifactGrid({',
    'function StoryboardGrid({'
  );
  const artifactCard = sourceBetween(
    panelSource,
    'function ArtifactCard({',
    'function ArtifactCardBody({'
  );
  const artifactCardBody = sourceBetween(
    panelSource,
    'function ArtifactCardBody({',
    'function ArtifactFocusButton({'
  );

  it('owns one asset-only expansion id and passes it through both AssetStage render paths', () => {
    expect(panelSource).toContain(
      'const [expandedAssetArtifactId, setExpandedAssetArtifactId] = useState<string>();'
    );
    const assetStageCalls = panelSource.match(/<AssetStage\b[\s\S]*?\/>/g) ?? [];
    expect(assetStageCalls).toHaveLength(2);
    assetStageCalls.forEach(call => {
      expect(call).toContain('expandedArtifactId={expandedAssetArtifactId}');
      expect(call).toContain('onExpandedArtifactChange={setExpandedAssetArtifactId}');
    });
    expect(assetStage).toContain('expandedArtifactId?: string;');
    expect(assetStage).not.toContain('activeArtifactFocusByStage');
    expect(assetStage).not.toContain('expandedStoryboardArtifactId');
    expect(assetAnchorCard).not.toContain('activeArtifactFocusByStage');
    expect(assetAnchorCard).not.toContain('expandedStoryboardArtifactId');
  });

  it('uses a dedicated responsive asset grid and keeps the category title on the group header', () => {
    expect(assetStage).toContain(
      'const assetTypeLabel = t(`shortDrama.assets.${category.id}`);'
    );
    expect(assetStage).toContain('className="short-drama-center__asset-list"');
    expect(assetStage).not.toContain('assetTypeLabel={assetTypeLabel}');
    expect(assetStage).not.toContain('short-drama-center__grid');
    expect(artifactGrid).toContain('className="short-drama-center__grid"');
    expect(artifactGrid).not.toContain('short-drama-asset-row');
    expect(panelStyles).toContain('grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));');
  });

  it('renders one tile media preview behind a full-tile toggle and a text overlay', () => {
    expect(assetAnchorCard).toContain(
      '<MediaPreview artifact={artifact} mediaEntry={mediaEntry} t={t} variant="tile" />'
    );
    expect(assetAnchorCard).toContain('type="button"');
    expect(assetAnchorCard).toContain('aria-pressed={isSelected}');
    expect(assetAnchorCard).toContain('className="short-drama-asset-row__overlay"');
    expect(assetAnchorCard).not.toContain('<StatusPill');
    expect(assetAnchorCard).not.toContain('<ArtifactRevisionStrip');

    const toggle = sourceBetween(
      assetAnchorCard,
      '<button\n        type="button"',
      '</button>'
    );
    expect(toggle).not.toContain('<MediaPreview');
    expect(toggle).not.toContain('<ArtifactCardBody');
    expect(toggle).toContain('{artifact.title}');
    expect(toggle).not.toContain('{assetTypeLabel}');
    expect(toggle).not.toContain('<StatusPill');
    expect(toggle).not.toContain('artifact.summary');
  });

  it('focuses once, then selects on first tap and opens the lightbox on second tap', () => {
    const toggle = sourceBetween(
      assetAnchorCard,
      '<button\n        type="button"',
      '</button>'
    );
    expect(toggle).toContain(
      'event.stopPropagation();\n          handleTileActivate();'
    );
    const activate = sourceBetween(
      assetAnchorCard,
      'const handleTileActivate = () => {',
      '};'
    );
    expect(activate.match(/onArtifactFocus\(artifact\)/g)).toHaveLength(1);
    expect(assetAnchorCard).toContain(
      "const handleTileActivate = () => {\n    onArtifactFocus(artifact);\n    if (isSelected) {\n      handleOpenPreview();\n    } else {\n      onExpandedArtifactChange(artifact.id);\n    }\n  };"
    );
    expect(assetAnchorCard).toContain('openShortDramaArtifactPreview(artifact, preview)');
    const previewHelper = sourceBetween(
      panelSource,
      'function openShortDramaArtifactPreview(',
      'function VideoStage({'
    );
    expect(previewHelper).toContain('openMediaPreviewPanel({');
    expect(previewHelper).toContain('resolveWorkspaceMediaPreviewUrl({');
  });

  it('extracts the original complete card body without changing ArtifactGrid or ArtifactCard structure', () => {
    expect(artifactCard).toContain(
      '<ArtifactFocusButton artifact={artifact} onArtifactFocus={onArtifactFocus} t={t} />'
    );
    expect(artifactCard).toContain(
      '<MediaPreview artifact={artifact} mediaEntry={mediaEntry} t={t} />'
    );
    expect(artifactCard).toContain('<ArtifactCardBody artifact={artifact} t={t} />');
    expect(artifactCardBody).toContain('createShortDramaArtifactCardViewModel(artifact)');
    expect(artifactCardBody).toContain('{artifact.summary}');
    expect(artifactCardBody).toContain("t('shortDrama.card.mediaReference')");
    expect(artifactCardBody).toContain('artifact.failureReason || artifact.statusReason');
    expect(artifactCardBody).toContain("t('shortDrama.card.revisions'");
    expect(artifactCardBody).toContain("t('shortDrama.card.attempts'");
  });

  it('keeps pending generations non-interactive while preserving every existing field', () => {
    expect(pendingAssetCard).toContain('short-drama-pending-row__preview is-generating');
    expect(pendingAssetCard).toContain("t('shortDrama.assets.pendingTitle'");
    expect(pendingAssetCard).toContain(
      "item.model ?? t('shortDrama.assets.pendingModelUnknown')"
    );
    expect(pendingAssetCard).toContain('{item.prompt ?? item.batchId}');
    expect(pendingAssetCard).toContain('<StatusPill status="generating" t={t} />');
    expect(pendingAssetCard).toContain('{item.requestedAspectRatio}');
    expect(pendingAssetCard).not.toContain('<button');
    expect(pendingAssetCard).not.toContain('<ArtifactFocusButton');
    expect(pendingAssetCard).not.toContain('aria-expanded');
  });

  it('overrides the base card height later and responds at the 420px container boundary', () => {
    const baseCardRuleIndex = panelStyles.indexOf('.short-drama-card {');
    const compactAssetRuleIndex = panelStyles.indexOf(
      '.short-drama-card.short-drama-asset-row,'
    );
    const compactAssetRule = sourceBetween(
      panelStyles,
      '.short-drama-card.short-drama-asset-row,',
      '}'
    );
    const narrowContainer = panelStyles.slice(
      panelStyles.indexOf('@container short-drama-panel (max-width: 420px)')
    );

    expect(baseCardRuleIndex).toBeGreaterThanOrEqual(0);
    expect(compactAssetRuleIndex).toBeGreaterThan(baseCardRuleIndex);
    expect(compactAssetRule).toContain('.short-drama-card.short-drama-pending-row');
    expect(compactAssetRule).toContain('min-height: 0;');
    expect(panelStyles).toContain('grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));');
    expect(narrowContainer).toMatch(/\.short-drama-center__asset-list,[\s\S]*?\.short-drama-center__storyboard-list \{/);
    expect(narrowContainer).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(panelStyles).toMatch(
      /\.short-drama-asset-row__toggle:focus-visible,[\s\S]*?\.short-drama-storyboard-row__toggle:focus-visible \{[\s\S]*?outline: 2px solid/
    );
    expect(minimalPanelStyles).toMatch(
      /\.void-ui--minimal \.short-drama-asset-row__toggle:focus-visible,[\s\S]*?outline: 2px solid var\(--workspace-focus-ring\)/
    );
  });

  it('keeps asset tiles image-only with a selection and hover text overlay', () => {
    expect(panelStyles).toMatch(/\.short-drama-asset-row__overlay,[\s\S]*?\.short-drama-storyboard-row__overlay \{/);
    expect(panelStyles).toContain(
      '.short-drama-asset-row.is-selected .short-drama-asset-row__overlay'
    );
    expect(panelStyles).toContain(
      '.short-drama-asset-row__toggle:focus-visible ~ .short-drama-asset-row__overlay'
    );
    expect(panelStyles).toContain('clip-path: inset(50%);');
    expect(minimalPanelStyles).toMatch(
      /\.void-ui--minimal \.short-drama-asset-row__overlay,[\s\S]*?\.void-ui--minimal \.short-drama-storyboard-row__overlay \{/
    );
  });

  it('enlarges the selected tile across two grid tracks and exposes a zoom shortcut', () => {
    expect(assetAnchorCard).toContain("{preview.status === 'ready' && (");
    expect(assetAnchorCard).toContain('className="short-drama-asset-row__zoom"');
    expect(assetAnchorCard).toContain(
      "t('shortDrama.accessibility.openArtifact', { title: artifact.title })"
    );
    const zoom = sourceBetween(
      assetAnchorCard,
      'className="short-drama-asset-row__zoom"',
      '</button>'
    );
    expect(zoom).toContain('event.stopPropagation();');
    expect(zoom).toContain('handleOpenPreview();');
    expect(panelStyles).toContain('grid-auto-flow: dense;');
    expect(panelStyles).toMatch(
      /\.short-drama-asset-row\.is-selected,[\s\S]*?\.short-drama-storyboard-row\.is-selected \{[\s\S]*?grid-column: span 2;/
    );
    expect(panelStyles).toMatch(/\.short-drama-asset-row__zoom,[\s\S]*?\.short-drama-storyboard-row__zoom \{/);
    const narrowContainer = panelStyles.slice(
      panelStyles.indexOf('@container short-drama-panel (max-width: 420px)')
    );
    expect(narrowContainer).toMatch(
      /\.short-drama-asset-row\.is-selected,[\s\S]*?\.short-drama-storyboard-row\.is-selected \{[\s\S]*?grid-column: auto;/
    );
  });
});

describe('ShortDramaCenterPanel artifact focus follow contract', () => {
  const videoStage = sourceBetween(
    panelSource,
    'function VideoStage({',
    'function selectVideoPosterArtifact('
  );
  const postStage = sourceBetween(
    panelSource,
    'function PostStage({',
    'function FinalVideoPreview({'
  );

  it('threads the single stage focus key into every media stage render path', () => {
    expect(panelSource).toContain(
      'const [activeArtifactFocusByStage, setActiveArtifactFocusByStage] = useState'
    );
    expect(panelSource).toContain(
      'focusedArtifactIdOrHandle={activeArtifactFocusByStage[selectedStage]}'
    );

    const assetStageCalls = panelSource.match(/<AssetStage\b[\s\S]*?\/>/g) ?? [];
    expect(assetStageCalls).toHaveLength(2);
    assetStageCalls.forEach(call => {
      expect(call).toContain('focusedArtifactIdOrHandle={activeArtifactFocusByStage.assets}');
    });
  });

  it('lets an external focus key drive the large video player before local rail selection', () => {
    expect(videoStage).toContain('focusedArtifactIdOrHandle?: string;');
    expect(videoStage).toContain('artifact.id === focusedArtifactIdOrHandle');
    expect(videoStage).toContain('artifact.handle === focusedArtifactIdOrHandle');
    expect(videoStage).toMatch(
      /const activeVideo = focusedVideo\s*\?\?\s*artifacts\.find\(artifact => artifact\.id === selectedVideoId\)\s*\?\?\s*artifacts\[0\];/
    );
  });

  it('marks the focused artifact card in asset, storyboard, and post stages', () => {
    const assetAnchorCard = sourceBetween(
      panelSource,
      'function AssetAnchorCard({',
      'function ArtifactGrid({'
    );
    const storyboardGrid = sourceBetween(
      panelSource,
      'function StoryboardGrid({',
      'function openShortDramaArtifactPreview('
    );

    expect(assetAnchorCard).toContain("isFocused ? 'is-focused' : ''");
    expect(storyboardGrid).toContain("isFocused ? 'is-focused' : ''");
    expect(postStage).toContain("isFocused ? 'is-focused' : ''");
    expect(postStage).toContain('focusedArtifactIdOrHandle?: string;');
  });

  it('scrolls the focused card into view only while active and visible-nearest', () => {
    expect(panelSource).toContain(
      "if (!isActive || state.status !== 'ready' || selectedStage === 'script')"
    );
    expect(panelSource).toContain(
      'document.getElementById(getShortDramaArtifactDomId(focusedArtifact.id))'
    );
    expect(panelSource).toContain(
      "element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })"
    );
  });

  it('keeps the focused-card highlight themed in base and minimal styles', () => {
    expect(panelStyles).toContain('.short-drama-card.is-focused {');
    expect(panelStyles).toContain('.short-drama-center__post-row.is-focused {');
    expect(minimalPanelStyles).toContain('.void-ui--minimal .short-drama-card.is-focused {');
    expect(minimalPanelStyles).toContain(
      '.void-ui--minimal .short-drama-center__post-row.is-focused {'
    );
  });
});
