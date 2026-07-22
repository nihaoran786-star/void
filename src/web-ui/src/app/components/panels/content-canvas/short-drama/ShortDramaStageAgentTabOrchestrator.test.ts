import { describe, expect, it, vi } from 'vitest';

import { openShortDramaRealStageAgentTab, type ShortDramaStageAgentCanvasGateway } from './ShortDramaStageAgentTabOrchestrator';
import type { CanvasTab, EditorGroupState, SplitMode } from '@/app/components/panels/content-canvas/types';
import type { PanelContent } from '@/app/components/panels/base/types';
import {
  createShortDramaStageWorkspaces,
  createShortDramaStaticProject,
  type ShortDramaStage,
  type ShortDramaStageWorkspace,
} from '@/shared/services/short-drama';

describe('ShortDramaStageAgentTabOrchestrator', () => {
  it('moves an existing real subagent tab to secondary and removes the legacy fake stage tab', () => {
    const realTab = createBtwTab({
      id: 'real-asset-tab',
      childSessionId: 'asset-real-session',
      parentSessionId: 'main-session',
      duplicateCheckKey: 'btw-session-asset-real-session',
      title: 'AssetAI: Test AssetAI',
    });
    const fakeTab = createBtwTab({
      id: 'fake-asset-tab',
      childSessionId: 'short-drama-assets-fake',
      parentSessionId: 'main-session',
      duplicateCheckKey: 'short-drama-stage-agent:project-1:assets',
      title: 'Short drama assets agent',
      shortDramaStage: 'assets',
    });
    const canvas = createCanvasGateway({
      primaryTabs: [realTab],
      secondaryTabs: [fakeTab],
      splitMode: 'none',
    });

    const result = openShortDramaRealStageAgentTab(createWorkspace(), 'C:/work', canvas, {
      contentBuilder: (childSessionId, parentSessionId, workspacePath) => ({
        type: 'btw-session',
        title: 'AssetAI: Test AssetAI',
        data: { childSessionId, parentSessionId, workspacePath },
        metadata: {
          duplicateCheckKey: `btw-session-${childSessionId}`,
          childSessionId,
          parentSessionId,
          contentRole: 'btw-session',
        },
      }),
    });

    expect(result).toEqual({
      status: 'ready',
      source: 'short-drama-stage-agent-tab',
      childSessionId: 'asset-real-session',
      groupId: 'secondary',
    });
    expect(canvas.closeTab).toHaveBeenCalledWith('fake-asset-tab', 'secondary', { forceRemove: true });
    expect(canvas.moveTabToGroup).toHaveBeenCalledWith('real-asset-tab', 'primary', 'secondary', 0);
    expect(canvas.switchToTab).toHaveBeenCalledWith('real-asset-tab', 'secondary');
    expect(canvas.setSplitMode).toHaveBeenCalledWith('horizontal');
    expect(canvas.updateTabContent).toHaveBeenCalledWith(
      'real-asset-tab',
      'primary',
      expect.objectContaining({
        metadata: expect.objectContaining({
          duplicateCheckKey: 'btw-session-asset-real-session',
          shortDramaProjectId: 'project-1',
          shortDramaWorkspacePath: 'C:/work',
          shortDramaStage: 'assets',
        }),
      }),
    );
  });

  it('does not create a fake tab when no real session is bound', () => {
    const canvas = createCanvasGateway({ primaryTabs: [], secondaryTabs: [], splitMode: 'horizontal' });

    const result = openShortDramaRealStageAgentTab({
      ...createWorkspace(),
      specialistSessionId: undefined,
    }, 'C:/work', canvas);

    expect(result).toEqual({
      status: 'pending',
      source: 'short-drama-stage-agent-tab',
      reason: 'session_missing',
    });
    expect(canvas.addTab).not.toHaveBeenCalled();
  });

  it('closes a stale same-stage tab when the persistent binding no longer resolves to a real session', () => {
    const staleTab = createBtwTab({
      id: 'stale-script-tab',
      childSessionId: 'script-old-session',
      parentSessionId: 'main-session',
      duplicateCheckKey: 'btw-session-script-old-session',
      title: 'ScriptAI: old',
      shortDramaStage: 'script',
    });
    const canvas = createCanvasGateway({
      primaryTabs: [],
      secondaryTabs: [staleTab],
      splitMode: 'horizontal',
    });

    const result = openShortDramaRealStageAgentTab({
      projectId: 'project-1',
      stage: 'script',
      specialistAgentRole: 'director',
      specialistSessionId: undefined,
      stageAgentBindingStatus: 'missing',
      stageAgentSessionResolution: {
        status: 'pending',
        source: 'short-drama-real-stage-agent-resolver',
        stage: 'script',
        nativeAgentName: 'ScriptAI',
        reason: 'session_missing',
        bindingStatus: 'missing',
      },
      panelState: 'open',
      lastFocusSource: 'initial',
    }, 'C:/work', canvas);

    expect(result).toEqual({
      status: 'pending',
      source: 'short-drama-stage-agent-tab',
      reason: 'session_missing',
    });
    expect(canvas.closeTab).toHaveBeenCalledWith('stale-script-tab', 'secondary', { forceRemove: true });
    expect(canvas.addTab).not.toHaveBeenCalled();
  });

  it('opens real stage agent sessions in the secondary canvas without switching the main conversation tab', () => {
    const project = createShortDramaStaticProject();
    const parentSessionId = 'live-main-session';
    const sessions = [
      {
        childSessionId: 'asset-live-session',
        parentSessionId,
        subagentType: 'AssetAI',
        title: 'AssetAI: Wake AssetAI',
        lastActiveAt: 10,
      },
      {
        childSessionId: 'video-live-session',
        parentSessionId,
        subagentType: 'VideoAI',
        title: 'VideoAI: Wake VideoAI',
        lastActiveAt: 20,
      },
    ];
    const stages: ShortDramaStage[] = ['assets', 'video'];

    for (const stage of stages) {
      const workspace = createShortDramaStageWorkspaces(project, {
        selectedStage: stage,
        activeArtifactIdOrHandle: stage === 'assets' ? 'episode-01-character-guard' : 'episode-01-video-01',
        parentSessionId,
        stageAgentSessions: sessions,
      }).find(item => item.stage === stage)!;
      const canvas = createCanvasGateway({
        primaryTabs: [
          {
            id: 'main-chat-tab',
            title: 'Main AI',
            state: 'active',
            content: {
              type: 'chat',
              title: 'Main AI',
              data: { sessionId: parentSessionId },
              metadata: { sessionId: parentSessionId },
            } as PanelContent,
            createdAt: 1,
            lastAccessedAt: 1,
          },
        ],
        secondaryTabs: [],
        splitMode: 'none',
      });
      const expandRightPanel = vi.fn();

      const result = openShortDramaRealStageAgentTab(workspace, 'C:/work', canvas, { expandRightPanel });

      expect(result.status).toBe('ready');
      expect(canvas.addTab).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'btw-session',
          metadata: expect.objectContaining({
            childSessionId: workspace.specialistSessionId,
            parentSessionId,
            shortDramaWorkspacePath: 'C:/work',
            shortDramaStage: stage,
          }),
        }),
        'active',
        'secondary',
      );
      expect(canvas.setSplitMode).toHaveBeenCalledWith('horizontal');
      expect(canvas.switchToTab).not.toHaveBeenCalledWith('main-chat-tab', 'primary');
      expect(canvas.addTab).not.toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            duplicateCheckKey: expect.stringMatching(/^short-drama-stage-agent:/),
          }),
        }),
        expect.anything(),
        expect.anything(),
      );
      expect(expandRightPanel).toHaveBeenCalledTimes(1);
    }
  });

  it('recreates the split after closing the only legacy secondary tab instead of adding the new ScriptAI to primary', () => {
    const shortDramaTab: CanvasTab = {
      id: 'short-drama',
      title: 'AI短剧',
      state: 'active',
      content: {
        type: 'short-drama-center',
        title: 'AI短剧',
        data: { workspacePath: 'C:/work' },
        metadata: { workspacePath: 'C:/work' },
      } as PanelContent,
      createdAt: 1,
      lastAccessedAt: 1,
    };
    const legacyScriptTab = createBtwTab({
      id: 'legacy-script',
      childSessionId: 'script-old-session',
      parentSessionId: 'main-session',
      duplicateCheckKey: 'btw-session-script-old-session',
      title: 'ScriptAI: old',
      shortDramaStage: 'script',
      shortDramaWorkspacePath: 'C:/work',
    });
    const canvas = createCanvasGateway({
      primaryTabs: [shortDramaTab],
      secondaryTabs: [legacyScriptTab],
      splitMode: 'horizontal',
    });

    const result = openShortDramaRealStageAgentTab({
      projectId: 'project-1',
      stage: 'script',
      specialistAgentRole: 'director',
      specialistSessionId: 'script-new-session',
      parentSessionId: 'main-session',
      panelState: 'open',
      lastFocusSource: 'initial',
    }, 'C:/work', canvas);

    expect(result).toEqual({
      status: 'ready',
      source: 'short-drama-stage-agent-tab',
      childSessionId: 'script-new-session',
      groupId: 'secondary',
    });
    expect(canvas.closeTab).toHaveBeenCalledWith('legacy-script', 'secondary', { forceRemove: true });
    expect(canvas.layout.splitMode).toBe('horizontal');
    expect(canvas.getSplitMode).toHaveReturnedWith('none');
    expect(canvas.setSplitMode).toHaveBeenCalledWith('horizontal');
    expect(canvas.addTab).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          childSessionId: 'script-new-session',
          shortDramaStage: 'script',
        }),
      }),
      'active',
      'secondary',
    );
  });

  it('does not close a stage agent tab from another workspace', () => {
    const otherWorkspaceTab = createBtwTab({
      id: 'asset-other-workspace',
      childSessionId: 'asset-other-session',
      parentSessionId: 'main-session',
      duplicateCheckKey: 'btw-session-asset-other-session',
      title: 'AssetAI: other workspace',
      shortDramaStage: 'assets',
      shortDramaWorkspacePath: 'C:/other-workspace',
    });
    const canvas = createCanvasGateway({
      primaryTabs: [],
      secondaryTabs: [otherWorkspaceTab],
      splitMode: 'horizontal',
    });

    const result = openShortDramaRealStageAgentTab(createWorkspace(), 'C:/work', canvas);

    expect(result.status).toBe('ready');
    expect(canvas.closeTab).not.toHaveBeenCalledWith(
      'asset-other-workspace',
      expect.anything(),
      expect.anything(),
    );
  });

  it('keeps sibling stage agent tabs of the same project open so the team coexists', () => {
    const scriptTab = createBtwTab({
      id: 'script-tab',
      childSessionId: 'script-live-session',
      parentSessionId: 'main-session',
      duplicateCheckKey: 'btw-session-script-live-session',
      title: 'ScriptAI: live',
      shortDramaStage: 'script',
    });
    const canvas = createCanvasGateway({
      primaryTabs: [],
      secondaryTabs: [scriptTab],
      splitMode: 'horizontal',
    });

    const result = openShortDramaRealStageAgentTab(createWorkspace(), 'C:/work', canvas);

    expect(result.status).toBe('ready');
    expect(canvas.closeTab).not.toHaveBeenCalledWith(
      'script-tab',
      expect.anything(),
      expect.anything(),
    );
    expect(canvas.addTab).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ shortDramaStage: 'assets' }),
      }),
      'active',
      'secondary',
    );
  });

  it('leaves ordinary btw child-session tabs without stage metadata untouched', () => {
    const plainBtwTab = createBtwTab({
      id: 'plain-btw-tab',
      childSessionId: 'review-live-session',
      parentSessionId: 'main-session',
      duplicateCheckKey: 'btw-session-review-live-session',
      title: 'ReviewBot: live',
    });
    const canvas = createCanvasGateway({
      primaryTabs: [],
      secondaryTabs: [plainBtwTab],
      splitMode: 'horizontal',
    });

    const result = openShortDramaRealStageAgentTab(createWorkspace(), 'C:/work', canvas);

    expect(result.status).toBe('ready');
    expect(canvas.closeTab).not.toHaveBeenCalledWith(
      'plain-btw-tab',
      expect.anything(),
      expect.anything(),
    );
  });

  it('still closes stage-less legacy tabs that belong to the same project', () => {
    const stagelessProjectTab: CanvasTab = {
      id: 'stageless-project-tab',
      title: 'Legacy short drama session',
      state: 'active',
      content: {
        type: 'btw-session',
        title: 'Legacy short drama session',
        data: {
          childSessionId: 'legacy-project-session',
          parentSessionId: 'main-session',
          workspacePath: 'C:/work',
        },
        metadata: {
          duplicateCheckKey: 'btw-session-legacy-project-session',
          childSessionId: 'legacy-project-session',
          parentSessionId: 'main-session',
          shortDramaProjectId: 'project-1',
        },
      } as PanelContent,
      createdAt: 1,
      lastAccessedAt: 1,
    };
    const canvas = createCanvasGateway({
      primaryTabs: [],
      secondaryTabs: [stagelessProjectTab],
      splitMode: 'horizontal',
    });

    const result = openShortDramaRealStageAgentTab(createWorkspace(), 'C:/work', canvas);

    expect(result.status).toBe('ready');
    expect(canvas.closeTab).toHaveBeenCalledWith(
      'stageless-project-tab',
      'secondary',
      { forceRemove: true },
    );
  });
});

function createWorkspace(): ShortDramaStageWorkspace {
  return {
    projectId: 'project-1',
    stage: 'assets',
    specialistAgentRole: 'asset',
    specialistSessionId: 'asset-real-session',
    parentSessionId: 'main-session',
    panelState: 'open',
    lastFocusSource: 'initial',
  };
}

function createBtwTab(input: {
  id: string;
  title: string;
  childSessionId: string;
  parentSessionId: string;
  duplicateCheckKey: string;
  shortDramaStage?: string;
  shortDramaWorkspacePath?: string;
}): CanvasTab {
  return {
    id: input.id,
    title: input.title,
    state: 'active',
    content: {
      type: 'btw-session',
      title: input.title,
      data: {
        childSessionId: input.childSessionId,
        parentSessionId: input.parentSessionId,
        workspacePath: 'C:/work',
      },
      metadata: {
        duplicateCheckKey: input.duplicateCheckKey,
        childSessionId: input.childSessionId,
        parentSessionId: input.parentSessionId,
        contentRole: 'btw-session',
        shortDramaProjectId: input.shortDramaStage ? 'project-1' : undefined,
        shortDramaWorkspacePath: input.shortDramaWorkspacePath,
        shortDramaStage: input.shortDramaStage,
      },
    } as PanelContent,
    createdAt: 1,
    lastAccessedAt: 1,
  };
}

function createCanvasGateway(input: {
  primaryTabs: CanvasTab[];
  secondaryTabs: CanvasTab[];
  splitMode: SplitMode;
}): ShortDramaStageAgentCanvasGateway {
  const primaryGroup = createGroup(input.primaryTabs);
  const secondaryGroup = createGroup(input.secondaryTabs);
  const tertiaryGroup = createGroup([]);
  let currentSplitMode = input.splitMode;
  const canvas = {
    primaryGroup,
    secondaryGroup,
    tertiaryGroup,
    layout: { splitMode: input.splitMode },
    getSplitMode: vi.fn(() => currentSplitMode),
    findTabByMetadata: vi.fn((metadata: Record<string, unknown>) => {
      for (const [groupId, group] of [
        ['primary', primaryGroup],
        ['secondary', secondaryGroup],
        ['tertiary', tertiaryGroup],
      ] as const) {
        const tab = group.tabs.find(item => Object.entries(metadata)
          .every(([key, value]) => item.content.metadata?.[key] === value));
        if (tab) return { tab, groupId };
      }
      return null;
    }),
    addTab: vi.fn(),
    updateTabContent: vi.fn(),
    switchToTab: vi.fn(),
    moveTabToGroup: vi.fn(),
    closeTab: vi.fn((tabId: string, groupId: 'primary' | 'secondary' | 'tertiary') => {
      const group = groupId === 'primary'
        ? primaryGroup
        : groupId === 'secondary'
          ? secondaryGroup
          : tertiaryGroup;
      group.tabs = group.tabs.filter(tab => tab.id !== tabId);
      if (currentSplitMode !== 'none' && secondaryGroup.tabs.length === 0 && tertiaryGroup.tabs.length === 0) {
        currentSplitMode = 'none';
      }
    }),
    setSplitMode: vi.fn((mode: Extract<SplitMode, 'horizontal' | 'vertical'>) => {
      currentSplitMode = mode;
    }),
  };
  return canvas;
}

function createGroup(tabs: CanvasTab[]): EditorGroupState {
  return {
    id: 'primary',
    tabs,
    activeTabId: tabs[0]?.id ?? null,
  } as EditorGroupState;
}
