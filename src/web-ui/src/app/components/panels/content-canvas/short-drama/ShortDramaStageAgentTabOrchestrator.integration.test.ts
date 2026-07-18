import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { PanelContent } from '@/app/components/panels/base/types';
import { useAgentCanvasStore } from '@/app/components/panels/content-canvas/stores';

import { openShortDramaRealStageAgentTab } from './ShortDramaStageAgentTabOrchestrator';

describe('ShortDramaStageAgentTabOrchestrator canvas integration', () => {
  beforeEach(() => {
    useAgentCanvasStore.getState().reset();
  });

  afterEach(() => {
    useAgentCanvasStore.getState().reset();
  });

  it('keeps the short-drama center in primary when replacing the only legacy secondary agent', () => {
    const store = useAgentCanvasStore.getState();
    store.addTab({
      type: 'short-drama-center',
      title: 'AI短剧',
      data: { workspacePath: 'C:/work' },
      metadata: {
        duplicateCheckKey: 'short-drama-center:C:/work',
        workspacePath: 'C:/work',
      },
    } as PanelContent, 'active', 'primary');
    store.setSplitMode('horizontal');
    store.setSplitRatio(0.42);
    store.addTab({
      type: 'btw-session',
      title: 'ScriptAI: old',
      data: {
        childSessionId: 'script-old-session',
        parentSessionId: 'main-session',
        workspacePath: 'C:/work',
      },
      metadata: {
        duplicateCheckKey: 'btw-session-script-old-session',
        childSessionId: 'script-old-session',
        parentSessionId: 'main-session',
        shortDramaProjectId: 'project-1',
        shortDramaWorkspacePath: 'C:/work',
        shortDramaStage: 'script',
      },
    } as PanelContent, 'active', 'secondary');

    const snapshot = useAgentCanvasStore.getState();
    const result = openShortDramaRealStageAgentTab({
      projectId: 'project-1',
      stage: 'script',
      specialistAgentRole: 'director',
      specialistSessionId: 'script-new-session',
      parentSessionId: 'main-session',
      panelState: 'open',
      lastFocusSource: 'initial',
    }, 'C:/work', {
      ...snapshot,
      getSplitMode: () => useAgentCanvasStore.getState().layout.splitMode,
    });

    const next = useAgentCanvasStore.getState();
    expect(result.status).toBe('ready');
    expect(next.layout.splitMode).toBe('horizontal');
    expect(next.layout.splitRatio).toBe(0.42);
    expect(next.primaryGroup.tabs).toHaveLength(1);
    expect(next.primaryGroup.tabs[0]?.content.type).toBe('short-drama-center');
    expect(next.secondaryGroup.tabs).toHaveLength(1);
    expect(next.secondaryGroup.tabs[0]?.content).toEqual(expect.objectContaining({
      type: 'btw-session',
      data: expect.objectContaining({
        childSessionId: 'script-new-session',
        parentSessionId: 'main-session',
      }),
      metadata: expect.objectContaining({
        childSessionId: 'script-new-session',
        shortDramaWorkspacePath: 'C:/work',
        shortDramaStage: 'script',
      }),
    }));
    expect(next.primaryGroup.tabs.some(tab => (
      (tab.content.data as { childSessionId?: string } | undefined)?.childSessionId === 'script-new-session'
    ))).toBe(false);
  });

  it('moves an existing stage-agent tab from tertiary into the real secondary group', () => {
    const store = useAgentCanvasStore.getState();
    store.addTab({
      type: 'short-drama-center',
      title: 'AI短剧',
      data: { workspacePath: 'C:/work' },
      metadata: {
        duplicateCheckKey: 'short-drama-center:C:/work',
        workspacePath: 'C:/work',
      },
    } as PanelContent, 'active', 'primary');
    store.setSplitMode('grid');
    store.addTab({
      type: 'btw-session',
      title: 'ScriptAI',
      data: {
        childSessionId: 'script-new-session',
        parentSessionId: 'main-session',
        workspacePath: 'C:/work',
      },
      metadata: {
        duplicateCheckKey: 'btw-session-script-new-session',
        childSessionId: 'script-new-session',
        parentSessionId: 'main-session',
        shortDramaProjectId: 'project-1',
        shortDramaWorkspacePath: 'C:/work',
        shortDramaStage: 'script',
      },
    } as PanelContent, 'active', 'tertiary');

    const snapshot = useAgentCanvasStore.getState();
    const result = openShortDramaRealStageAgentTab({
      projectId: 'project-1',
      stage: 'script',
      specialistAgentRole: 'director',
      specialistSessionId: 'script-new-session',
      parentSessionId: 'main-session',
      panelState: 'open',
      lastFocusSource: 'initial',
    }, 'C:/work', {
      ...snapshot,
      getSplitMode: () => useAgentCanvasStore.getState().layout.splitMode,
    });

    const next = useAgentCanvasStore.getState();
    expect(result).toEqual(expect.objectContaining({
      status: 'ready',
      groupId: 'secondary',
    }));
    expect(next.secondaryGroup.tabs).toHaveLength(1);
    expect(next.secondaryGroup.tabs[0]?.content.metadata).toEqual(expect.objectContaining({
      childSessionId: 'script-new-session',
      shortDramaStage: 'script',
    }));
    expect(next.tertiaryGroup.tabs).toHaveLength(0);
    expect(next.activeGroupId).toBe('secondary');
  });
});
