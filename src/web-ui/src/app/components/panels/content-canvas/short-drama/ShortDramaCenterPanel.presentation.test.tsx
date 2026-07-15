// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panelSource = readFileSync(new URL('./ShortDramaCenterPanel.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
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
});
