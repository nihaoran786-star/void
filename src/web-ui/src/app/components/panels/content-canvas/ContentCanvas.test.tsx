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
import { canvasSurfaceCommandService } from './registry/CanvasSurfaceCommandRuntime';
import { openFirstPartyCanvasCapability } from './registry/FirstPartyCanvasCapabilityRuntime';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function waitForCanvasMutation(assertion: () => void): Promise<void> {
  await act(async () => {
    await vi.waitFor(assertion, { timeout: 5_000 });
  });
}

function currentCommandTarget(hostId = 'agent') {
  const workspace = workspaceContextMock.getWorkspace();
  if (!workspace) return { status: 'unavailable' as const, reason: 'no-workspace' };
  if (workspace.workspaceKind === 'remote') {
    return workspace.connectionId
      ? {
          status: 'ready' as const,
          hostId,
          workspaceId: workspace.id,
          workspacePath: workspace.rootPath,
          backend: 'remote' as const,
          remoteConnectionId: workspace.connectionId,
          ...(workspace.sshHost ? { remoteHost: workspace.sshHost } : {}),
        }
      : { status: 'unavailable' as const, reason: 'invalid-workspace' };
  }
  return {
        status: 'ready' as const,
        hostId,
        workspaceId: workspace.id,
        workspacePath: workspace.rootPath,
        backend: 'local' as const,
      };
}

let commandSequence = 0;

async function openWorkspaceMediaCommand(options: {
  source?: 'capability-rail' | 'restore';
  sourceSessionId?: string;
  hostId?: string;
} = {}) {
  return await canvasSurfaceCommandService.open({
    surfaceId: 'workspace-media',
    source: options.source ?? 'capability-rail',
    input: undefined,
    idempotencyKey: `${options.source ?? 'capability-rail'}:${++commandSequence}`,
    target: currentCommandTarget(options.hostId),
    ...(options.sourceSessionId ? { sourceSessionId: options.sourceSessionId } : {}),
  });
}

async function openShortDramaCommand(sourceSessionId: string) {
  return await openFirstPartyCanvasCapability({
    capabilityId: 'short-drama',
    source: 'capability-rail',
    input: undefined,
    idempotencyKey: `short-drama:${++commandSequence}`,
    sourceSessionId,
    target: currentCommandTarget(),
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
    commandSequence = 0;
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
    await expect(openWorkspaceMediaCommand()).resolves.toMatchObject({
      status: 'unavailable',
    });
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
    await act(async () => {
      await openShortDramaCommand('media-session');
    });
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

  it('opens the workspace media tab through the typed command port without duplicating it', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };

    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    await act(async () => {
      await openWorkspaceMediaCommand();
      await openWorkspaceMediaCommand();
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
    await act(async () => {
      await openWorkspaceMediaCommand();
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
    expect(service.checkAvailability).not.toHaveBeenCalled();
  });

  it('records typed restore facts instead of treating restore as a capability click', async () => {
    const service: WorkspaceMediaLibraryService = {
      checkAvailability: vi.fn(async () => ({ status: 'unavailable', checkedAt: 100 })),
      scanLibrary: vi.fn(),
    };
    act(() => {
      flowChatStore.addExternalSession('team-session-1', 'Team', 'Media', 'C:/work');
      flowChatStore.switchSession('team-session-1');
    });
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" workspaceMediaService={service} />);
    });

    await act(async () => {
      await openWorkspaceMediaCommand({
        source: 'restore',
        sourceSessionId: 'team-session-1',
      });
    });

    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0].content.metadata).toMatchObject({
      canvasSurfaceSource: 'restore',
      canvasSourceSessionId: 'team-session-1',
    });
  });

  it('rejects a restore command without a workspace target', async () => {
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });

    await expect(canvasSurfaceCommandService.open({
      surfaceId: 'workspace-media',
      source: 'restore',
      input: undefined,
      idempotencyKey: 'incomplete-restore',
      sourceSessionId: 'team-session-without-workspace',
      target: { status: 'unavailable', reason: 'no-workspace' },
    })).resolves.toEqual({ status: 'unavailable', reason: 'no-workspace' });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });

  it('accepts an explicit restore retry when workspace facts become ready', async () => {
    act(() => {
      flowChatStore.addExternalSession(
        'team-session-restore',
        'Team restore',
        'Media',
        'C:/work',
      );
      flowChatStore.switchSession('team-session-restore');
    });
    workspaceContextMock.setWorkspace(null);
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });
    await expect(openWorkspaceMediaCommand({
      source: 'restore',
      sourceSessionId: 'team-session-restore',
    })).resolves.toMatchObject({ status: 'unavailable' });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);

    workspaceContextMock.reset();
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });
    await act(async () => {
      await openWorkspaceMediaCommand({
        source: 'restore',
        sourceSessionId: 'team-session-restore',
      });
    });

    await waitForCanvasMutation(() => {
      expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(1);
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs[0].content.metadata).toMatchObject({
      canvasSurfaceSource: 'restore',
      canvasSourceSessionId: 'team-session-restore',
    });
  });

  it('does not replay an unavailable restore into another workspace', async () => {
    workspaceContextMock.setWorkspace(null);
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work-a" />);
    });
    await expect(openWorkspaceMediaCommand({
      source: 'restore',
      sourceSessionId: 'team-session-a',
    })).resolves.toMatchObject({ status: 'unavailable' });

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
    await act(async () => {
      await canvasSurfaceCommandService.open({
        surfaceId: 'workspace-media',
        source: 'capability-rail',
        input: undefined,
        idempotencyKey: 'equivalent-path',
        target: {
          status: 'ready',
          hostId: 'agent',
          workspaceId: 'workspace-local-1',
          workspacePath: 'C:/work/',
          backend: 'local',
        },
      });
    });

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
    await act(async () => {
      await openWorkspaceMediaCommand({ hostId: 'panel-view' });
    });

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
    await expect(openWorkspaceMediaCommand()).resolves.toMatchObject({
      status: 'unavailable',
    });

    expect(useAgentCanvasStore.getState().primaryGroup.tabs).toHaveLength(0);
  });

  it('opens the Short Drama surface through the typed capability port without duplicating it', async () => {
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

    await act(async () => {
      await openShortDramaCommand('media-session');
      await openShortDramaCommand('media-session');
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
    await act(async () => {
      await openShortDramaCommand('legacy-media-session');
    });

    act(() => {
      flowChatStore.addExternalSession('team-media-session', 'Team Media', 'Media', 'C:/work');
      flowChatStore.switchSession('team-media-session');
    });
    await act(async () => {
      await openShortDramaCommand('team-media-session');
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

    await act(async () => {
      await openShortDramaCommand('team-media-session');
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

    await expect(openShortDramaCommand('code-session')).resolves.toEqual({
      status: 'restricted',
      reason: 'media_session_required',
    });

    const shortDramaTabs = useAgentCanvasStore
      .getState()
      .primaryGroup
      .tabs
      .filter(tab => tab.content.type === 'short-drama-center');
    expect(shortDramaTabs).toHaveLength(0);
  });

  it('rejects a Short Drama command from a no-longer-active session in the same workspace', async () => {
    act(() => {
      flowChatStore.addExternalSession('media-session-a', 'Media A', 'Media', 'C:/work');
      flowChatStore.addExternalSession('media-session-b', 'Media B', 'Media', 'C:/work');
      flowChatStore.switchSession('media-session-b');
    });
    await act(async () => {
      root.render(<ContentCanvas workspacePath="C:/work" />);
    });

    await expect(openShortDramaCommand('media-session-a')).resolves.toMatchObject({
      status: 'unavailable',
    });
    expect(useAgentCanvasStore.getState().primaryGroup.tabs.filter(
      tab => tab.content.type === 'short-drama-center',
    )).toHaveLength(0);
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
