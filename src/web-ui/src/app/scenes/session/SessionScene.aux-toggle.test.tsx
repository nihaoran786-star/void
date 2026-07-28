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
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<HTMLDivElement>((_props, ref) => (
      <div ref={ref} data-testid="aux-pane" />
    )),
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
      root.render(<SessionScene workspacePath="D:\\workspace" />);
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
