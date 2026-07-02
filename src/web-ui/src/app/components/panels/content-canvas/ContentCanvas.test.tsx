// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.hoisted(() => {
  const matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: matchMedia,
  });
});

import { ContentCanvas } from './ContentCanvas';
import { useAgentCanvasStore } from './stores';
import { openMainSession, selectActiveBtwSessionTab } from '@/flow_chat/services/openBtwSession';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import type { WorkspaceMediaLibraryService } from '@/shared/services/workspace-media';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./editor-area', () => ({
  EditorArea: () => <div data-testid="editor-area" />,
}));

vi.mock('./empty-state', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

vi.mock('./anchor-zone', () => ({
  AnchorZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./mission-control', () => ({
  MissionControl: () => null,
}));

vi.mock('./hooks', () => ({
  useTabLifecycle: () => ({
    handleCloseWithDirtyCheck: vi.fn(),
    handleCloseAllWithDirtyCheck: vi.fn(),
  }),
  useKeyboardShortcuts: vi.fn(),
  usePanelTabCoordinator: () => ({
    collapsePanel: vi.fn(),
  }),
}));

vi.mock('@/flow_chat/services/openBtwSession', () => ({
  openMainSession: vi.fn(),
  selectActiveBtwSessionTab: vi.fn(() => null),
}));

describe('ContentCanvas workspace media opening', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.mocked(openMainSession).mockClear();
    vi.mocked(selectActiveBtwSessionTab).mockReturnValue(null);
    useAgentCanvasStore.getState().reset();
    flowChatStore.setState(() => ({ sessions: new Map(), activeSessionId: null }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useAgentCanvasStore.getState().reset();
    flowChatStore.setState(() => ({ sessions: new Map(), activeSessionId: null }));
  });

  it('auto-opens the workspace media tab once when the primary group is empty and media is available', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'available', firstDetectedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    const tabsAfterFirstRender = useAgentCanvasStore.getState().primaryGroup.tabs;
    expect(tabsAfterFirstRender).toHaveLength(1);
    expect(tabsAfterFirstRender[0].content).toMatchObject({
      type: 'workspace-media-gallery',
      data: { workspacePath: 'C:/work' },
    });

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
  });

  it('opens the workspace media tab from the global media event without duplicating existing media tab', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media'));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media'));
    });

    const mediaTabs = useAgentCanvasStore
      .getState()
      .primaryGroup
      .tabs
      .filter(tab => tab.content.type === 'workspace-media-gallery');
    expect(mediaTabs).toHaveLength(1);
  });

  it('opens the short drama center tab from the global short drama event without duplicating existing tab', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    flowChatStore.addExternalSession('media-session', 'Media session', 'Media', 'C:/work');
    flowChatStore.switchSession('media-session');

    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
    });

    const shortDramaTabs = useAgentCanvasStore
      .getState()
      .primaryGroup
      .tabs
      .filter(tab => tab.content.type === 'short-drama-center');
    expect(shortDramaTabs).toHaveLength(1);
    expect(shortDramaTabs[0].content.data).toMatchObject({
      workspacePath: 'C:/work',
      sourceSessionId: 'media-session',
    });
  });

  it('does not open the short drama center from a non-media session', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    flowChatStore.addExternalSession('code-session', 'Code session', 'agentic', 'C:/work');
    flowChatStore.switchSession('code-session');

    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
    });

    const shortDramaTabs = useAgentCanvasStore
      .getState()
      .primaryGroup
      .tabs
      .filter(tab => tab.content.type === 'short-drama-center');
    expect(shortDramaTabs).toHaveLength(0);
  });

  it('does not reopen the left main session when a short drama stage agent tab becomes active', async () => {
    vi.mocked(selectActiveBtwSessionTab).mockReturnValue({
      id: 'short-drama-video-agent-tab',
      title: 'VideoAI',
      state: 'active',
      content: {
        type: 'btw-session',
        title: 'VideoAI',
        data: {
          childSessionId: 'video-real-session',
          parentSessionId: 'parent-main-session',
          workspacePath: 'C:/work',
        },
        metadata: {
          duplicateCheckKey: 'btw-session-video-real-session',
          contentRole: 'btw-session',
          shortDramaProjectId: 'project',
          shortDramaStage: 'video',
        },
      },
      createdAt: 100,
      lastAccessedAt: 100,
    } as any);

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });

    expect(openMainSession).not.toHaveBeenCalled();
  });
});
