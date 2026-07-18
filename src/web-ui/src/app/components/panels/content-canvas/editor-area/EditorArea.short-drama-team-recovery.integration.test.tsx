// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PanelContent } from '@/app/components/panels/base/types';
import { useAgentCanvasStore } from '@/app/components/panels/content-canvas/stores';

vi.mock('@/app/presentation/workspacePresentation', () => ({
  readWorkspacePresentation: () => 'minimal',
}));

vi.mock('./EditorGroup', () => ({
  EditorGroup: ({ groupId }: { groupId: string }) => (
    <div data-testid={`editor-group-${groupId}`} />
  ),
}));

vi.mock('./SplitHandle', () => ({
  SplitHandle: () => <div data-testid="split-handle" />,
}));

vi.mock('./ShortDramaTeamPanelControlsContainer', () => ({
  default: ({ mode }: { mode: string }) => (
    <div data-testid="team-controls" data-mode={mode} />
  ),
}));

import { EditorArea } from './EditorArea';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('EditorArea short-drama team recovery integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useAgentCanvasStore.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useAgentCanvasStore.getState().reset();
  });

  it('repairs the persisted duplicate-pane layout without dropping any real child session', async () => {
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
    store.setSplitRatio(0.41);

    const secondaryAgents = [
      ['asset-session', 'assets'],
      ['storyboard-session', 'storyboards'],
      ['video-session', 'video'],
      ['post-session', 'post'],
    ] as const;
    secondaryAgents.forEach(([childSessionId, stage]) => {
      store.addTab(createStageAgentContent(childSessionId, stage), 'active', 'secondary');
    });
    store.addTab(
      createStageAgentContent('script-session', 'script'),
      'active',
      'primary',
    );

    await act(async () => {
      root.render(<EditorArea workspacePath="C:/work" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const next = useAgentCanvasStore.getState();
    expect(next.layout.splitMode).toBe('horizontal');
    expect(next.layout.splitRatio).toBe(0.41);
    expect(next.primaryGroup.tabs).toHaveLength(1);
    expect(next.primaryGroup.tabs[0]?.content.type).toBe('short-drama-center');
    expect(next.primaryGroup.activeTabId).toBe(next.primaryGroup.tabs[0]?.id);
    expect(next.secondaryGroup.tabs).toHaveLength(5);
    expect(new Set(next.secondaryGroup.tabs.map(tab => (
      (tab.content.data as { childSessionId?: string } | undefined)?.childSessionId
    )))).toEqual(new Set([
      'script-session',
      'asset-session',
      'storyboard-session',
      'video-session',
      'post-session',
    ]));
    expect(next.closedTabs).toHaveLength(0);
    expect(container.querySelector('[data-testid="team-controls"]')?.getAttribute('data-mode'))
      .toBe('rail');
    expect(container.firstElementChild?.getAttribute('data-short-drama-team-mode'))
      .toBe('rail');
  });
});

function createStageAgentContent(
  childSessionId: string,
  shortDramaStage: string,
): PanelContent {
  return {
    type: 'btw-session',
    title: childSessionId,
    data: {
      childSessionId,
      parentSessionId: 'main-session',
      workspacePath: 'C:/work',
    },
    metadata: {
      duplicateCheckKey: `btw-session-${childSessionId}`,
      childSessionId,
      parentSessionId: 'main-session',
      shortDramaProjectId: 'project-1',
      shortDramaWorkspacePath: 'C:/work',
      shortDramaStage,
    },
  } as PanelContent;
}
