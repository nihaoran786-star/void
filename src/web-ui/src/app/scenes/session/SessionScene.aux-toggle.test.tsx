// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionModeStore } from '@/app/stores/sessionModeStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  toggleRightPanel: vi.fn(),
  updateRightPanelWidth: vi.fn(),
  layout: {
    rightPanelWidth: 540,
    rightPanelCollapsed: false,
    chatCollapsed: false,
    centerPanelCollapsed: false,
  },
  chatPaneProps: null as null | Record<string, unknown>,
  activeSessionId: 'session-1' as string | null,
  capabilities: [] as Array<{
    id: 'short-drama' | 'workspace-media';
    status: 'running' | 'attention' | 'ready' | 'failed';
    usageCount: number;
    latestActivityAt: number;
  }>,
  auxPaneAutoReady: true,
  auxPaneReadyCallback: null as null | (() => void),
  teamWorkspace: {
    status: 'disabled' as const,
    sessionId: null as string | null,
    hasTeamBinding: false,
    teamBindingKey: null as string | null,
    displayName: undefined as string | undefined,
    presentationStatus: 'disabled' as
      | 'disabled'
      | 'unsupported'
      | 'loading'
      | 'ready'
      | 'running'
      | 'attention'
      | 'completed'
      | 'error',
    reload: vi.fn(),
    snapshot: undefined as undefined | {
      parentSessionId: string;
      activeTeam: { teamDefinitionId: string; members: [] };
    },
  },
  teamPresentation: (() => {
    const listeners = new Set<() => void>();
    let sessions: Record<string, {
      bindingKey: string;
      isOpen: boolean;
      selectedMemberId: string | null;
      members: [];
    }> = {};
    const emit = () => listeners.forEach(listener => listener());
    const actions = {
      activateBinding: (sessionId: string, bindingKey: string) => {
        const current = sessions[sessionId];
        if (current?.bindingKey === bindingKey) return;
        sessions = {
          ...sessions,
          [sessionId]: {
            bindingKey,
            isOpen: true,
            selectedMemberId: null,
            members: [],
          },
        };
        emit();
      },
      registerSnapshot: () => {},
      open: (sessionId: string) => {
        const current = sessions[sessionId];
        if (!current) return;
        sessions = { ...sessions, [sessionId]: { ...current, isOpen: true } };
        emit();
      },
      close: (sessionId: string) => {
        const current = sessions[sessionId];
        if (!current) return;
        sessions = { ...sessions, [sessionId]: { ...current, isOpen: false } };
        emit();
      },
      selectMember: (sessionId: string, memberId: string | null) => {
        const current = sessions[sessionId];
        if (!current) return;
        sessions = {
          ...sessions,
          [sessionId]: { ...current, selectedMemberId: memberId },
        };
        emit();
      },
    };
    return {
      getState: () => ({ sessions, ...actions }),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      reset: () => {
        sessions = {};
        emit();
      },
    };
  })(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/component-library', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/infrastructure/runtime', () => ({
  isTauriRuntime: () => false,
}));

vi.mock('@/flow_chat/hooks/useActiveSessionCapabilities', () => ({
  useActiveSessionCapabilities: () => ({
    sessionId: mocks.activeSessionId,
    capabilities: mocks.capabilities,
  }),
}));

vi.mock('@/team_workspace', async () => {
  const ReactModule = await import('react');
  return {
    useActiveSessionTeamWorkspace: () => mocks.teamWorkspace,
    useTeamWorkspacePresentationStore: (selector: (state: ReturnType<typeof mocks.teamPresentation.getState>) => unknown) =>
      ReactModule.useSyncExternalStore(
        mocks.teamPresentation.subscribe,
        () => selector(mocks.teamPresentation.getState()),
        () => selector(mocks.teamPresentation.getState()),
      ),
    resolveTeamCanvasCapability: (teamDefinitionId?: string) =>
      teamDefinitionId === 'custom-00000000000000000000000000000001'
        ? 'short-drama'
        : teamDefinitionId === 'workspace-media-team'
          ? 'workspace-media'
        : null,
    TeamWorkspacePanel: ({
      onClose,
      selectedMemberId,
      onSelectedMemberChange,
    }: {
      onClose?: () => void;
      selectedMemberId?: string | null;
      onSelectedMemberChange?: (memberId: string | null) => void;
    }) => (
      <div
        data-testid="mock-team-workspace"
        data-selected-member-id={selectedMemberId ?? ''}
      >
        <button type="button" onClick={onClose}>close</button>
        <button
          type="button"
          onClick={() => onSelectedMemberChange?.('member-1')}
        >
          select member
        </button>
      </div>
    ),
  };
});

vi.mock('../../hooks/useApp', () => ({
  useApp: () => ({
    state: { layout: mocks.layout },
    toggleRightPanel: mocks.toggleRightPanel,
    updateRightPanelWidth: mocks.updateRightPanelWidth,
  }),
}));

vi.mock('./ChatPane', () => ({
  default: (props: typeof mocks.chatPaneProps) => {
    mocks.chatPaneProps = props;
    return <div data-testid="chat-pane" />;
  },
}));

vi.mock('./AuxPane', async () => {
  const { forwardRef, useEffect } = await import('react');
  return {
    default: forwardRef<HTMLDivElement, { onReady?: () => void }>((props, ref) => {
      mocks.auxPaneReadyCallback = props.onReady ?? null;
      useEffect(() => {
        if (mocks.auxPaneAutoReady) props.onReady?.();
      }, [props.onReady]);
      return <div ref={ref} data-testid="aux-pane" />;
    }),
  };
});

import SessionScene from './SessionScene';

describe('SessionScene universal canvas toggle control', () => {
  let container: HTMLDivElement;
  let root: Root;
  let containerWidth: number;
  let offsetWidthSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.toggleRightPanel.mockReset();
    mocks.updateRightPanelWidth.mockReset();
    mocks.chatPaneProps = null;
    mocks.layout.rightPanelWidth = 540;
    mocks.layout.rightPanelCollapsed = false;
    mocks.layout.chatCollapsed = false;
    mocks.layout.centerPanelCollapsed = false;
    mocks.activeSessionId = 'session-1';
    mocks.capabilities = [];
    mocks.auxPaneAutoReady = true;
    mocks.auxPaneReadyCallback = null;
    mocks.teamWorkspace.status = 'disabled';
    mocks.teamWorkspace.sessionId = null;
    mocks.teamWorkspace.hasTeamBinding = false;
    mocks.teamWorkspace.teamBindingKey = null;
    mocks.teamWorkspace.displayName = undefined;
    mocks.teamWorkspace.presentationStatus = 'disabled';
    mocks.teamWorkspace.snapshot = undefined;
    mocks.teamPresentation.reset();
    useSessionModeStore.setState({
      mode: 'code',
      draftStatus: 'idle',
      draftWorkspace: null,
    });
    containerWidth = 1600;
    offsetWidthSpy = vi.spyOn(
      HTMLElement.prototype,
      'offsetWidth',
      'get',
    ).mockImplementation(() => containerWidth);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    offsetWidthSpy.mockRestore();
    localStorage.clear();
    container.remove();
  });

  it('renders the outer canvas control outside the streaming chat surface', async () => {
    await act(async () => {
      root.render(<SessionScene workspacePath="D:\\workspace" />);
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="session-aux-pane-toggle"]',
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(mocks.chatPaneProps).not.toHaveProperty('showCanvasToggle');

    await act(async () => {
      toggle?.click();
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps the same edge control available after the outer canvas is collapsed', async () => {
    mocks.layout.rightPanelCollapsed = true;

    await act(async () => {
      root.render(<SessionScene />);
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="session-aux-pane-toggle"]',
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      toggle?.click();
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps preview-first mode as the sole full-surface owner', async () => {
    mocks.layout.chatCollapsed = true;

    await act(async () => {
      root.render(<SessionScene />);
    });

    expect(mocks.chatPaneProps).toBeNull();
  });

  it('collapses the auxiliary preview when an unpersisted session draft opens', async () => {
    await act(async () => {
      root.render(<SessionScene />);
    });
    expect(mocks.toggleRightPanel).not.toHaveBeenCalled();

    await act(async () => {
      useSessionModeStore.getState().beginDraft('media', null);
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps the auxiliary preview unavailable until the draft becomes a session', async () => {
    await act(async () => {
      root.render(<SessionScene />);
      useSessionModeStore.getState().beginDraft('cowork', null);
    });
    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);

    mocks.layout.rightPanelCollapsed = true;
    await act(async () => {
      root.render(<SessionScene />);
    });
    expect(
      container.querySelector('[data-testid="session-aux-pane-toggle"]'),
    ).toBeNull();

    // A background event must not make the canvas visible before the first
    // message has created a real session.
    mocks.layout.rightPanelCollapsed = false;
    await act(async () => {
      root.render(<SessionScene />);
    });
    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(2);

    mocks.layout.rightPanelCollapsed = true;
    await act(async () => {
      useSessionModeStore.getState().clearDraft();
      root.render(<SessionScene />);
    });
    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector('[data-testid="session-aux-pane-toggle"]'),
    ).not.toBeNull();
  });

  it('opens a persisted session capability and expands a collapsed canvas', async () => {
    mocks.layout.rightPanelCollapsed = true;
    mocks.capabilities = [{
      id: 'short-drama',
      status: 'running',
      usageCount: 2,
      latestActivityAt: 10,
    }];
    const openShortDrama = vi.fn();
    window.addEventListener('void:open-short-drama-center', openShortDrama);

    await act(async () => {
      root.render(<SessionScene workspacePath="D:\\workspace" />);
    });

    const capability = container.querySelector<HTMLButtonElement>(
      '[data-capability-id="short-drama"]',
    );
    expect(capability).not.toBeNull();

    await act(async () => {
      capability?.click();
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
    expect(openShortDrama).toHaveBeenCalledTimes(1);
    window.removeEventListener('void:open-short-drama-center', openShortDrama);
  });

  it('delivers a queued capability only after the Canvas scene becomes active', async () => {
    mocks.auxPaneAutoReady = false;
    mocks.capabilities = [{
      id: 'workspace-media',
      status: 'ready',
      usageCount: 0,
      latestActivityAt: 0,
    }];
    const openWorkspaceMedia = vi.fn();
    window.addEventListener('void:open-workspace-media', openWorkspaceMedia);

    await act(async () => {
      root.render(
        <SessionScene
          isActive
          workspaceId="workspace-a"
          workspacePath={'D:\\workspace-a'}
        />,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-capability-id="workspace-media"]',
      )?.click();
      root.render(
        <SessionScene
          isActive={false}
          workspaceId="workspace-a"
          workspacePath={'D:\\workspace-a'}
        />,
      );
      mocks.auxPaneReadyCallback?.();
    });
    expect(openWorkspaceMedia).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <SessionScene
          isActive
          workspaceId="workspace-a"
          workspacePath={'D:\\workspace-a'}
        />,
      );
    });
    expect(openWorkspaceMedia).toHaveBeenCalledTimes(1);
    window.removeEventListener('void:open-workspace-media', openWorkspaceMedia);
  });

  it('drops a queued capability when the session or workspace changes before Canvas is ready', async () => {
    mocks.auxPaneAutoReady = false;
    mocks.capabilities = [{
      id: 'short-drama',
      status: 'ready',
      usageCount: 1,
      latestActivityAt: 1,
    }];
    const openShortDrama = vi.fn();
    window.addEventListener('void:open-short-drama-center', openShortDrama);

    await act(async () => {
      root.render(
        <SessionScene workspaceId="workspace-a" workspacePath={'D:\\workspace-a'} />,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-capability-id="short-drama"]',
      )?.click();
    });

    mocks.activeSessionId = 'session-2';
    await act(async () => {
      root.render(
        <SessionScene workspaceId="workspace-b" workspacePath={'D:\\workspace-b'} />,
      );
      mocks.auxPaneReadyCallback?.();
    });
    expect(openShortDrama).not.toHaveBeenCalled();
    window.removeEventListener('void:open-short-drama-center', openShortDrama);
  });

  it('preserves one queued intent for each capability while Canvas is loading', async () => {
    mocks.auxPaneAutoReady = false;
    mocks.capabilities = [
      {
        id: 'short-drama',
        status: 'ready',
        usageCount: 1,
        latestActivityAt: 1,
      },
      {
        id: 'workspace-media',
        status: 'ready',
        usageCount: 1,
        latestActivityAt: 2,
      },
    ];
    const openShortDrama = vi.fn();
    const openWorkspaceMedia = vi.fn();
    window.addEventListener('void:open-short-drama-center', openShortDrama);
    window.addEventListener('void:open-workspace-media', openWorkspaceMedia);

    await act(async () => {
      root.render(
        <SessionScene workspaceId="workspace-a" workspacePath={'D:\\workspace-a'} />,
      );
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-capability-id="short-drama"]',
      )?.click();
      container.querySelector<HTMLButtonElement>(
        '[data-capability-id="workspace-media"]',
      )?.click();
      mocks.auxPaneReadyCallback?.();
    });

    expect(openShortDrama).toHaveBeenCalledTimes(1);
    expect(openWorkspaceMedia).toHaveBeenCalledTimes(1);
    window.removeEventListener('void:open-short-drama-center', openShortDrama);
    window.removeEventListener('void:open-workspace-media', openWorkspaceMedia);
  });

  it('opens a bound general team as the dedicated third column without changing the canvas', async () => {
    mocks.teamWorkspace.status = 'ready';
    mocks.teamWorkspace.sessionId = 'session-1';
    mocks.teamWorkspace.hasTeamBinding = true;
    mocks.teamWorkspace.teamBindingKey = 'team-1:revision-1:instance-1';
    mocks.teamWorkspace.displayName = '软件交付团队';
    mocks.teamWorkspace.presentationStatus = 'running';
    mocks.layout.rightPanelCollapsed = true;

    await act(async () => {
      root.render(<SessionScene workspacePath="D:\\workspace" />);
    });

    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="session-team-workspace-toggle"]',
    );
    expect(toggle).not.toBeNull();
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .not.toBeNull();

    await act(async () => {
      toggle?.click();
    });
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .toBeNull();
    await act(async () => {
      toggle?.click();
    });
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .not.toBeNull();
    expect(mocks.toggleRightPanel).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="mock-team-workspace"] button',
      )?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('reopens the team workspace when the active team binding changes', async () => {
    mocks.teamWorkspace.status = 'ready';
    mocks.teamWorkspace.sessionId = 'session-1';
    mocks.teamWorkspace.hasTeamBinding = true;
    mocks.teamWorkspace.teamBindingKey = 'team-1:revision-1:instance-1';
    mocks.teamWorkspace.displayName = '软件交付团队';
    mocks.teamWorkspace.presentationStatus = 'ready';

    await act(async () => {
      root.render(<SessionScene />);
    });
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="mock-team-workspace"] button',
      )?.click();
    });
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .toBeNull();

    mocks.teamWorkspace.teamBindingKey = 'team-2:revision-1:instance-2';
    await act(async () => {
      root.render(<SessionScene />);
    });
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .not.toBeNull();
  });

  it('关闭重开保留已选成员，同会话切换团队时才重置成员路由', async () => {
    mocks.teamWorkspace.status = 'ready';
    mocks.teamWorkspace.sessionId = 'session-1';
    mocks.teamWorkspace.hasTeamBinding = true;
    mocks.teamWorkspace.teamBindingKey = 'team-1:revision-1:instance-1';
    mocks.teamWorkspace.presentationStatus = 'ready';

    await act(async () => {
      root.render(<SessionScene />);
    });
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="mock-team-workspace"] button',
      )[1]?.click();
    });
    expect(container.querySelector('[data-testid="mock-team-workspace"]')
      ?.getAttribute('data-selected-member-id')).toBe('member-1');

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="mock-team-workspace"] button',
      )[0]?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="session-team-workspace-toggle"]',
      )?.click();
    });
    expect(container.querySelector('[data-testid="mock-team-workspace"]')
      ?.getAttribute('data-selected-member-id')).toBe('member-1');

    mocks.teamWorkspace.teamBindingKey = 'team-2:revision-1:instance-2';
    await act(async () => {
      root.render(<SessionScene />);
    });
    expect(container.querySelector('[data-testid="mock-team-workspace"]')
      ?.getAttribute('data-selected-member-id')).toBe('');
  });

  it('restores bound short-drama canvas content without expanding the collapsed canvas', async () => {
    mocks.teamWorkspace.status = 'ready';
    mocks.teamWorkspace.sessionId = 'session-1';
    mocks.teamWorkspace.hasTeamBinding = true;
    mocks.teamWorkspace.teamBindingKey = 'short-drama:revision-1:instance-1';
    mocks.teamWorkspace.displayName = 'AI 短剧制作团队';
    mocks.teamWorkspace.presentationStatus = 'ready';
    mocks.teamWorkspace.snapshot = {
      parentSessionId: 'session-1',
      activeTeam: {
        teamDefinitionId: 'custom-00000000000000000000000000000001',
        members: [],
      },
    };
    mocks.layout.rightPanelCollapsed = true;
    const openShortDrama = vi.fn();
    window.addEventListener('void:open-short-drama-center', openShortDrama);

    await act(async () => {
      root.render(<SessionScene workspacePath="D:\\workspace" />);
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });

    expect(mocks.toggleRightPanel).not.toHaveBeenCalled();
    expect(openShortDrama).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .not.toBeNull();
    window.removeEventListener('void:open-short-drama-center', openShortDrama);
  });

  it('waits for typed workspace identity before restoring bound media canvas content', async () => {
    mocks.teamWorkspace.status = 'ready';
    mocks.teamWorkspace.sessionId = 'team-session-1';
    mocks.teamWorkspace.hasTeamBinding = true;
    mocks.teamWorkspace.teamBindingKey = 'media-team:revision-1:instance-1';
    mocks.teamWorkspace.presentationStatus = 'ready';
    mocks.teamWorkspace.snapshot = {
      parentSessionId: 'team-session-1',
      activeTeam: {
        teamDefinitionId: 'workspace-media-team',
        members: [],
      },
    };
    const openWorkspaceMedia = vi.fn();
    window.addEventListener('void:open-workspace-media', openWorkspaceMedia);

    await act(async () => {
      root.render(<SessionScene workspacePath={'D:\\workspace'} />);
    });
    expect(openWorkspaceMedia).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <SessionScene workspaceId="workspace-1" workspacePath={'D:\\workspace'} />,
      );
    });

    expect(openWorkspaceMedia).toHaveBeenCalledTimes(1);
    expect((openWorkspaceMedia.mock.calls[0][0] as CustomEvent).detail).toEqual({
      source: 'restore',
      sourceSessionId: 'team-session-1',
      workspaceId: 'workspace-1',
      workspacePath: 'D:\\workspace',
    });
    window.removeEventListener('void:open-workspace-media', openWorkspaceMedia);
  });

  it('restores Team media once when an inactive session becomes active', async () => {
    mocks.teamWorkspace.status = 'ready';
    mocks.teamWorkspace.sessionId = 'team-session-1';
    mocks.teamWorkspace.hasTeamBinding = true;
    mocks.teamWorkspace.teamBindingKey = 'media-team:revision-1:instance-1';
    mocks.teamWorkspace.presentationStatus = 'ready';
    mocks.teamWorkspace.snapshot = {
      parentSessionId: 'team-session-1',
      activeTeam: {
        teamDefinitionId: 'workspace-media-team',
        members: [],
      },
    };
    const openWorkspaceMedia = vi.fn();
    window.addEventListener('void:open-workspace-media', openWorkspaceMedia);

    await act(async () => {
      root.render(
        <SessionScene
          isActive={false}
          workspaceId="workspace-1"
          workspacePath={'D:\\workspace'}
        />,
      );
    });
    expect(openWorkspaceMedia).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        <SessionScene
          isActive
          workspaceId="workspace-1"
          workspacePath={'D:\\workspace'}
        />,
      );
    });
    expect(openWorkspaceMedia).toHaveBeenCalledTimes(1);
    expect((openWorkspaceMedia.mock.calls[0][0] as CustomEvent).detail).toEqual({
      source: 'restore',
      sourceSessionId: 'team-session-1',
      workspaceId: 'workspace-1',
      workspacePath: 'D:\\workspace',
    });
    window.removeEventListener('void:open-workspace-media', openWorkspaceMedia);
  });

  it('collapses the canvas and bound team workspace as one right-side surface', async () => {
    mocks.teamWorkspace.status = 'ready';
    mocks.teamWorkspace.sessionId = 'session-1';
    mocks.teamWorkspace.hasTeamBinding = true;
    mocks.teamWorkspace.teamBindingKey = 'short-drama:revision-1:instance-1';
    mocks.teamWorkspace.displayName = 'AI 短剧制作团队';
    mocks.teamWorkspace.presentationStatus = 'ready';
    mocks.teamWorkspace.snapshot = {
      parentSessionId: 'session-1',
      activeTeam: {
        teamDefinitionId: 'custom-00000000000000000000000000000001',
        members: [],
      },
    };
    mocks.layout.rightPanelCollapsed = false;
    const openShortDrama = vi.fn();
    window.addEventListener('void:open-short-drama-center', openShortDrama);

    await act(async () => {
      root.render(<SessionScene workspacePath="D:\\workspace" />);
    });
    mocks.toggleRightPanel.mockClear();
    openShortDrama.mockClear();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="session-aux-pane-toggle"]',
      )?.click();
    });
    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .toBeNull();

    mocks.layout.rightPanelCollapsed = true;
    await act(async () => {
      root.render(<SessionScene workspacePath="D:\\workspace" />);
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
    expect(openShortDrama).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="session-team-workspace-panel"]'))
      .toBeNull();
    expect(container.querySelector('[data-testid="session-team-workspace-toggle"]')
      ?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="session-aux-pane-toggle"]')
      ?.getAttribute('aria-expanded')).toBe('false');
    window.removeEventListener('void:open-short-drama-center', openShortDrama);
  });

  it('keeps an empty media-session capability available to reopen the media canvas', async () => {
    mocks.layout.rightPanelCollapsed = true;
    mocks.capabilities = [{
      id: 'workspace-media',
      status: 'ready',
      usageCount: 0,
      latestActivityAt: 0,
    }];
    const openWorkspaceMedia = vi.fn();
    window.addEventListener('void:open-workspace-media', openWorkspaceMedia);

    await act(async () => {
      root.render(
        <SessionScene workspaceId="workspace-1" workspacePath={'D:\\workspace'} />,
      );
    });

    const capability = container.querySelector<HTMLButtonElement>(
      '[data-capability-id="workspace-media"]',
    );
    expect(capability).not.toBeNull();
    expect(capability?.textContent).toContain(
      'layout.sessionCapabilities.status.ready',
    );

    await act(async () => {
      capability?.click();
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);
    expect(openWorkspaceMedia).toHaveBeenCalledTimes(1);
    expect((openWorkspaceMedia.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      source: 'capability-rail',
      workspaceId: 'workspace-1',
      workspacePath: 'D:\\workspace',
    });
    window.removeEventListener('void:open-workspace-media', openWorkspaceMedia);
  });

  it('collapses the auxiliary preview again for a consecutive new-task draft', async () => {
    await act(async () => {
      root.render(<SessionScene />);
      useSessionModeStore.getState().beginDraft('media', null);
    });
    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(1);

    mocks.layout.rightPanelCollapsed = true;
    await act(async () => {
      root.render(<SessionScene />);
    });

    mocks.layout.rightPanelCollapsed = false;
    await act(async () => {
      root.render(<SessionScene />);
      useSessionModeStore.getState().beginDraft('code', null);
    });

    expect(mocks.toggleRightPanel).toHaveBeenCalledTimes(2);
  });

  it('restores the preferred canvas width after a temporary narrow-window clamp', async () => {
    localStorage.setItem('void:rightPanelLastWidth', '900');
    mocks.layout.rightPanelWidth = 900;
    containerWidth = 800;

    await act(async () => {
      root.render(<SessionScene />);
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(mocks.updateRightPanelWidth).toHaveBeenLastCalledWith(396);

    mocks.layout.rightPanelWidth = 396;
    containerWidth = 1600;
    mocks.updateRightPanelWidth.mockClear();
    await act(async () => {
      root.render(<SessionScene />);
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(mocks.updateRightPanelWidth).toHaveBeenLastCalledWith(900);
  });
});
