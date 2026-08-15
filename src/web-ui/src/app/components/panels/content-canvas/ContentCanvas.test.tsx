// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

interface WorkspaceFixture {
  id: string;
  rootPath: string;
  workspaceKind: 'normal' | 'assistant' | 'remote';
  connectionId?: string;
  sshHost?: string;
}

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

const flowChatStoreMock = vi.hoisted(() => {
  let state = {
    sessions: new Map<string, any>(),
    activeSessionId: null as string | null,
  };
  const listeners = new Set<(nextState: typeof state) => void>();
  const notify = () => {
    listeners.forEach(listener => listener(state));
  };

  return {
    getState: () => state,
    setState: (updater: ((prev: typeof state) => typeof state) | (() => typeof state)) => {
      state = updater(state);
      notify();
    },
    subscribe: (listener: (nextState: typeof state) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getListenerCount: () => listeners.size,
    addExternalSession: (
      sessionId: string,
      title: string,
      mode: string,
      workspacePath: string,
    ) => {
      state = {
        ...state,
        sessions: new Map(state.sessions).set(sessionId, {
          sessionId,
          title,
          mode,
          workspacePath,
          dialogTurns: [],
          status: 'idle',
          config: { agentType: mode },
          sessionKind: 'normal',
        }),
      };
      notify();
    },
    switchSession: (sessionId: string) => {
      state = {
        ...state,
        activeSessionId: sessionId,
      };
      notify();
    },
  };
});

const transportAdapterMock = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  request: vi.fn(async () => undefined),
  listen: vi.fn(() => () => undefined),
  disconnect: vi.fn(async () => undefined),
  isConnected: vi.fn(() => true),
}));

const workspaceContextMock = vi.hoisted(() => {
  let workspace: WorkspaceFixture | null = {
    id: 'workspace-local-1',
    rootPath: 'C:/work',
    workspaceKind: 'normal' as const,
  };
  return {
    getWorkspace: () => workspace,
    setWorkspace: (nextWorkspace: WorkspaceFixture | null) => {
      workspace = nextWorkspace;
    },
    reset: () => {
      workspace = {
        id: 'workspace-local-1',
        rootPath: 'C:/work',
        workspaceKind: 'normal',
      };
    },
  };
});

const emptyStateMock = vi.hoisted(() => ({
  onOpenWorkspaceMedia: undefined as (() => void) | undefined,
}));

import { ContentCanvas } from './ContentCanvas';
import { useKeyboardShortcuts, usePanelTabCoordinator } from './hooks';
import {
  CanvasStoreModeContext,
  useAgentCanvasStore,
  usePanelViewCanvasStore,
} from './stores';
import { openMainSession, selectActiveBtwSessionTab } from '@/flow_chat/services/openBtwSession';
import { flowChatStore } from '@/flow_chat/store/FlowChatStore';
import { SHORT_DRAMA_TEAM_CATALOG_ID } from '@/shared/services/customization/fixedTeamIds';
import type { WorkspaceMediaAvailability, WorkspaceMediaLibraryService } from '@/shared/services/workspace-media';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function waitForCanvasMutation(assertion: () => void): Promise<void> {
  await act(async () => {
    await vi.waitFor(assertion, { timeout: 5_000 });
  });
}

vi.mock('./editor-area', () => ({
  EditorArea: () => <div data-testid="editor-area" />,
}));

vi.mock('./empty-state', () => ({
  EmptyState: (props: { onOpenWorkspaceMedia?: () => void }) => {
    emptyStateMock.onOpenWorkspaceMedia = props.onOpenWorkspaceMedia;
    return <div data-testid="empty-state" />;
  },
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
  usePanelTabCoordinator: vi.fn(() => ({
    collapsePanel: vi.fn(),
  })),
}));

vi.mock('@/flow_chat/services/openBtwSession', () => ({
  openMainSession: vi.fn(),
  selectActiveBtwSessionTab: vi.fn(() => null),
}));

vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: flowChatStoreMock,
}));

vi.mock('@/infrastructure/api/adapters', () => ({
  getTransportAdapter: () => transportAdapterMock,
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useOptionalCurrentWorkspace: () => ({
    workspace: workspaceContextMock.getWorkspace(),
  }),
}));

vi.mock('@/shared/services/short-drama/ShortDramaWorkspaceManifestAdapter', () => ({
  createShortDramaWorkspaceManifestAdapter: vi.fn(() => ({})),
}));

vi.mock('@/shared/services/short-drama/ShortDramaStageAgentSessionBinding', () => ({
  readShortDramaStageAgentBindings: vi.fn(() => new Promise(() => undefined)),
}));

describe('ContentCanvas workspace media opening', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.mocked(openMainSession).mockClear();
    vi.mocked(selectActiveBtwSessionTab).mockReturnValue(null);
    vi.mocked(useKeyboardShortcuts).mockClear();
    vi.mocked(usePanelTabCoordinator).mockClear();
    workspaceContextMock.reset();
    emptyStateMock.onOpenWorkspaceMedia = undefined;
    useAgentCanvasStore.getState().reset();
    usePanelViewCanvasStore.getState().reset();
    flowChatStore.setState(() => ({ sessions: new Map(), activeSessionId: null }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    container.remove();
    useAgentCanvasStore.getState().reset();
    usePanelViewCanvasStore.getState().reset();
    flowChatStore.setState(() => ({ sessions: new Map(), activeSessionId: null }));
  });

  it('keeps restored or newly added canvas tabs hidden until an explicit canvas control opens them', async () => {
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });

    expect(usePanelTabCoordinator).toHaveBeenLastCalledWith({
      autoCollapseOnEmpty: true,
      autoExpandOnTabOpen: false,
    });
  });

  it('opens the media tab immediately when a media session becomes active', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };
    act(() => {
      flowChatStore.addExternalSession('media-session', 'Media session', 'Media', 'C:/work');
      flowChatStore.switchSession('media-session');
    });

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    await act(async () => {
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toEqual([
        expect.objectContaining({
          content: expect.objectContaining({
            type: 'workspace-media-gallery',
            data: { workspacePath: 'C:/work' },
            metadata: expect.objectContaining({
              canvasSurfaceSource: 'session-default',
            }),
          }),
        }),
      ]);
    });
    expect(service.checkAvailability).not.toHaveBeenCalled();
  });

  it('auto-opens the workspace media tab once when the primary group is empty and media is available', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'available', firstDetectedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });
    const tabsAfterFirstRender = useAgentCanvasStore.getState().primaryGroup.tabs;
    expect(tabsAfterFirstRender).toHaveLength(1);
    expect(tabsAfterFirstRender[0].content).toMatchObject({
      type: 'workspace-media-gallery',
      data: { workspacePath: 'C:/work' },
      metadata: {
        canvasSurfaceSource: 'background-discovery',
      },
    });

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
  });

  it('pauses media discovery while hidden, restarts immediately, and ignores the previous visible period', async () => {
    vi.useFakeTimers();
    let resolveFirstCheck!: (value: WorkspaceMediaAvailability) => void;
    const checkAvailability = vi.fn()
      .mockImplementationOnce(() => new Promise<WorkspaceMediaAvailability>((resolve) => {
        resolveFirstCheck = resolve;
      }))
      .mockResolvedValue({ status: 'unavailable', checkedAt: 200 });
    const service: WorkspaceMediaLibraryService = {
      checkAvailability,
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(
        <ContentCanvas
          workspacePath="C:/work"
          workspaceMediaService={service}
          isSceneActive={false}
        />
      );
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(checkAvailability).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <ContentCanvas
          workspacePath="C:/work"
          workspaceMediaService={service}
          isSceneActive
        />
      );
    });
    expect(checkAvailability).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(checkAvailability).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <ContentCanvas
          workspacePath="C:/work"
          workspaceMediaService={service}
          isSceneActive={false}
        />
      );
    });
    await act(async () => {
      resolveFirstCheck({ status: 'available', firstDetectedAt: 100 });
      await Promise.resolve();
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);

    await act(async () => {
      root.render(
        <ContentCanvas
          workspacePath="C:/work"
          workspaceMediaService={service}
          isSceneActive
        />
      );
      await Promise.resolve();
    });
    expect(checkAvailability).toHaveBeenCalledTimes(2);
  });

  it('releases hidden presentation listeners and resyncs the latest FlowChat state once on resume', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(
        <ContentCanvas
          workspacePath="C:/work"
          workspaceMediaService={service}
          isSceneActive={false}
        />
      );
    });

    expect(flowChatStoreMock.getListenerCount()).toBe(0);
    expect(vi.mocked(useKeyboardShortcuts)).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    act(() => window.dispatchEvent(new CustomEvent('void:open-workspace-media')));
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);

    act(() => {
      flowChatStore.addExternalSession('media-session', 'Media session', 'Media', 'C:/work');
      flowChatStore.switchSession('media-session');
    });

    await act(async () => {
      root.render(
        <ContentCanvas
          workspacePath="C:/work"
          workspaceMediaService={service}
          isSceneActive
        />
      );
    });
    await act(async () => {
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    expect(flowChatStoreMock.getListenerCount()).toBe(1);
    expect(vi.mocked(useKeyboardShortcuts)).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
    act(() => window.dispatchEvent(new CustomEvent('void:open-short-drama-center')));
    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(2);
    });
    const resumedTabTypes = useAgentCanvasStore
      .getState()
      .primaryGroup
      .tabs
      .map(tab => tab.content.type);
    expect(resumedTabTypes).toHaveLength(2);
    expect(resumedTabTypes).toEqual(expect.arrayContaining([
      'workspace-media-gallery',
      'short-drama-center',
    ]));

    await act(async () => {
      root.render(
        <ContentCanvas
          workspacePath="C:/work"
          workspaceMediaService={service}
          isSceneActive={false}
        />
      );
    });
    expect(flowChatStoreMock.getListenerCount()).toBe(0);
  });

  it('defers BTW main-session navigation while hidden and performs it on resume', async () => {
    vi.mocked(selectActiveBtwSessionTab).mockReturnValue({
      id: 'btw-tab',
      content: {
        data: {
          childSessionId: 'child-session',
          parentSessionId: 'parent-session',
          workspacePath: 'C:/work',
        },
        metadata: {},
      },
    });

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" isSceneActive={false} />);
    });
    expect(openMainSession).not.toHaveBeenCalled();

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" isSceneActive />);
    });
    expect(openMainSession).toHaveBeenCalledTimes(1);
    expect(openMainSession).toHaveBeenCalledWith('parent-session');
  });

  it('resyncs an already-open BTW tab only when its parent session changed while hidden', async () => {
    vi.mocked(selectActiveBtwSessionTab).mockReturnValue({
      id: 'btw-tab',
      content: {
        data: {
          childSessionId: 'child-session',
          parentSessionId: 'parent-session',
          workspacePath: 'C:/work',
        },
        metadata: {},
      },
    });
    flowChatStore.addExternalSession('parent-session', 'Parent', 'agentic', 'C:/work');
    flowChatStore.addExternalSession('other-session', 'Other', 'agentic', 'C:/work');
    flowChatStore.switchSession('parent-session');

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" isSceneActive />);
    });
    expect(openMainSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" isSceneActive={false} />);
    });
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" isSceneActive />);
    });
    expect(openMainSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" isSceneActive={false} />);
      flowChatStore.switchSession('other-session');
    });
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" isSceneActive />);
    });
    expect(openMainSession).toHaveBeenCalledTimes(2);
    expect(openMainSession).toHaveBeenLastCalledWith('parent-session');
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

    await waitForCanvasMutation(() => {
      const mediaTabs = useAgentCanvasStore
        .getState()
        .primaryGroup
        .tabs
        .filter(tab => tab.content.type === 'workspace-media-gallery');
      expect(mediaTabs).toHaveLength(1);
    });

    const mediaTabs = useAgentCanvasStore
      .getState()
      .primaryGroup
      .tabs
      .filter(tab => tab.content.type === 'workspace-media-gallery');
    expect(mediaTabs).toHaveLength(1);
    expect(mediaTabs[0].content.metadata).toMatchObject({
      canvasSurfaceId: 'workspace-media',
      canvasSurfaceInstanceKey: 'workspace-media:workspace-local-1',
      canvasWorkspaceId: 'workspace-local-1',
      canvasWorkspacePath: 'C:/work',
      canvasSurfaceSource: 'capability-rail',
    });
  });

  it('records the empty-state Canvas control as an explicit canvas-control source', async () => {
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });

    act(() => emptyStateMock.onOpenWorkspaceMedia?.());

    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0].content.metadata).toMatchObject({
      canvasSurfaceSource: 'canvas-control',
    });
  });

  it('fails closed before discovery or opening when Workspace Media is remote', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };
    workspaceContextMock.setWorkspace({
      id: 'remote-workspace-a',
      rootPath: '/srv/app',
      workspaceKind: 'remote',
      connectionId: 'connection-a',
      sshHost: 'host-a',
    });

    await act(async () => {
      root.render(<ContentCanvas workspacePath="/srv/app" workspaceMediaService={service} />);
    });
    act(() => window.dispatchEvent(new CustomEvent('void:open-workspace-media')));

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
    expect(service.checkAvailability).not.toHaveBeenCalled();
  });

  it('records restore event facts instead of treating restore as a capability click', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    act(() => window.dispatchEvent(new CustomEvent('void:open-workspace-media', {
      detail: {
        source: 'restore',
        sourceSessionId: 'team-session-1',
        workspaceId: 'workspace-local-1',
        workspacePath: 'C:/work',
      },
    })));

    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0].content.metadata).toMatchObject({
      canvasSurfaceSource: 'restore',
      canvasSourceSessionId: 'team-session-1',
    });
  });

  it('ignores an incomplete restore event instead of treating it as a capability click', async () => {
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });

    act(() => window.dispatchEvent(new CustomEvent('void:open-workspace-media', {
      detail: {
        source: 'restore',
        sourceSessionId: 'team-session-without-workspace',
      },
    })));

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });

  it('retries a restore event when workspace facts become ready', async () => {
    workspaceContextMock.setWorkspace(null);
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media', {
        detail: {
          source: 'restore',
          sourceSessionId: 'team-session-restore',
          workspaceId: 'workspace-local-1',
          workspacePath: 'C:/work',
        },
      }));
      await Promise.resolve();
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);

    workspaceContextMock.reset();
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
      await Promise.resolve();
    });

    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0].content.metadata).toMatchObject({
      canvasSurfaceSource: 'restore',
      canvasSourceSessionId: 'team-session-restore',
    });
  });

  it('drops a pending restore instead of replaying it into another workspace', async () => {
    workspaceContextMock.setWorkspace(null);
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work-a" />);
    });
    await act(async () => {
      window.dispatchEvent(new CustomEvent('void:open-workspace-media', {
        detail: {
          source: 'restore',
          sourceSessionId: 'team-session-a',
          workspaceId: 'workspace-a',
          workspacePath: 'C:/work-a',
        },
      }));
      await Promise.resolve();
    });

    workspaceContextMock.setWorkspace({
      id: 'workspace-b',
      rootPath: 'C:/work-b',
      workspaceKind: 'normal',
    });
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work-b" />);
      await Promise.resolve();
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });

  it('retries the default media open after workspace facts become available', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };
    workspaceContextMock.setWorkspace(null);
    act(() => {
      flowChatStore.addExternalSession('media-session', 'Media session', 'Media', 'C:/work');
      flowChatStore.switchSession('media-session');
    });
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    await act(async () => {
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);

    workspaceContextMock.reset();
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    await act(async () => {
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
    });
    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });
  });

  it('accepts an equivalent workspace path with a trailing separator', async () => {
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work/" />);
    });
    act(() => window.dispatchEvent(new CustomEvent('void:open-workspace-media')));

    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });
  });

  it('opens through the Canvas store selected by the current host context', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(
        <CanvasStoreModeContext.Provider value="panel-view">
          <ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />
        </CanvasStoreModeContext.Provider>,
      );
    });
    act(() => window.dispatchEvent(new CustomEvent('void:open-workspace-media')));

    await waitForCanvasMutation(() => {
      expect(usePanelViewCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });

  it('fails closed when presentation path disagrees with workspace facts', async () => {
    workspaceContextMock.setWorkspace({
      id: 'workspace-local-2',
      rootPath: 'C:/other',
      workspaceKind: 'normal',
    });

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });
    act(() => window.dispatchEvent(new CustomEvent('void:open-workspace-media')));

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });

  it('opens the short drama center tab from the global short drama event without duplicating existing tab', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    act(() => {
      flowChatStore.addExternalSession('media-session', 'Media session', 'Media', 'C:/work');
      flowChatStore.switchSession('media-session');
    });

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

  it('rebinds a reused short drama center tab to the current media session', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    act(() => {
      flowChatStore.addExternalSession('legacy-media-session', 'Legacy Media', 'Media', 'C:/work');
      flowChatStore.switchSession('legacy-media-session');
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
    });

    act(() => {
      flowChatStore.addExternalSession('team-media-session', 'Team Media', 'Media', 'C:/work');
      flowChatStore.switchSession('team-media-session');
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
      sourceSessionId: 'team-media-session',
    });
    expect(shortDramaTabs[0].content.metadata).toMatchObject({
      sourceSessionId: 'team-media-session',
    });
  });

  it('removes restored stage-agent tabs when the short-drama Team opens its canonical workspace', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };
    const canvas = useAgentCanvasStore.getState();
    canvas.setSplitMode('horizontal');
    canvas.addTab({
      type: 'btw-session',
      title: '剧本 AI',
      data: {
        childSessionId: 'legacy-script-child',
        parentSessionId: 'legacy-media-session',
      },
      metadata: {
        shortDramaStage: 'script',
        shortDramaWorkspacePath: 'C:/work',
      },
    }, 'active', 'secondary');
    canvas.addTab({
      type: 'btw-session',
      title: '普通 BTW',
      data: {
        childSessionId: 'ordinary-child',
        parentSessionId: 'team-media-session',
      },
      metadata: {},
    }, 'active', 'secondary');

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    act(() => {
      flowChatStore.addExternalSession('team-media-session', 'Team Media', 'Media', 'C:/work');
      flowChatStore.setState(previous => {
        const sessions = new Map(previous.sessions);
        const session = sessions.get('team-media-session');
        sessions.set('team-media-session', {
          ...session,
          activePersonaBinding: {
            kind: 'team_lead',
            personaId: 'short-drama-team-lead',
            personaRevision: { status: 'known', value: 'revision:1' },
            teamDefinitionId: SHORT_DRAMA_TEAM_CATALOG_ID,
            teamInstanceId: 'team-instance',
          },
        });
        return { ...previous, sessions };
      });
      flowChatStore.switchSession('team-media-session');
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('void:open-short-drama-center'));
    });

    const allTabs = [
      ...useAgentCanvasStore.getState().primaryGroup.tabs,
      ...useAgentCanvasStore.getState().secondaryGroup.tabs,
      ...useAgentCanvasStore.getState().tertiaryGroup.tabs,
    ];
    expect(allTabs.some(tab => tab.title === '剧本 AI')).toBe(false);
    expect(allTabs.some(tab => tab.title === '普通 BTW')).toBe(true);
    expect(allTabs.some(tab => tab.content.type === 'short-drama-center')).toBe(true);
  });

  it('does not open the short drama center from a non-media session', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });
    act(() => {
      flowChatStore.addExternalSession('code-session', 'Code session', 'agentic', 'C:/work');
      flowChatStore.switchSession('code-session');
    });

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
