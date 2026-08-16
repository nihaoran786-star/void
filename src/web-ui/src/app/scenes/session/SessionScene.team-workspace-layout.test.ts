// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sceneMocks = vi.hoisted(() => ({
  teamOpen: true,
  activateBinding: vi.fn(),
  registerSnapshot: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  selectMember: vi.fn(),
  updateRightPanelWidth: vi.fn(),
  toggleRightPanel: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks/useApp', () => ({
  useApp: () => ({
    state: {
      layout: {
        rightPanelWidth: 480,
        rightPanelCollapsed: true,
        chatCollapsed: false,
        centerPanelCollapsed: false,
      },
    },
    updateRightPanelWidth: sceneMocks.updateRightPanelWidth,
    toggleRightPanel: sceneMocks.toggleRightPanel,
  }),
}));

vi.mock('./ChatPane', () => ({ default: () => null }));
vi.mock('./AuxPane', async () => {
  const { forwardRef } = await import('react');
  return { default: forwardRef(() => null) };
});
vi.mock('./SessionCapabilityRail', () => ({ default: () => null }));
vi.mock('@/app/presentation/sessionCapabilityRailOutlet', async () => {
  const { createElement } = await import('react');
  return {
    SessionCapabilityRailOutletProvider: ({ children }: { children: React.ReactNode }) => (
      createElement(React.Fragment, null, children)
    ),
  };
});
vi.mock('@/infrastructure/runtime', () => ({ isTauriRuntime: () => false }));
vi.mock('@/app/stores/sessionModeStore', () => ({
  useSessionModeStore: (selector: (state: { draftStatus: string }) => unknown) => (
    selector({ draftStatus: 'idle' })
  ),
}));
vi.mock('@/app/components/panels/content-canvas/stores', () => {
  const canvasState = { primaryGroup: { tabs: [], activeTabId: null } };
  return {
    useAgentCanvasStore: { getState: () => ({}) },
    useCanvasStore: (selector: (state: typeof canvasState) => unknown) => selector(canvasState),
  };
});
vi.mock('@/app/presentation/TeamMemberCanvasPresentation', () => ({
  removeDuplicateTeamMemberCanvasTabs: vi.fn(),
}));
vi.mock('@/flow_chat/hooks/useActiveSessionCapabilities', () => ({
  useActiveSessionCapabilities: () => ({ sessionId: 'session-1', capabilities: [] }),
}));
vi.mock('@/team_workspace', async () => {
  const { createElement } = await import('react');
  const useTeamWorkspacePresentationStore = (
    selector: (state: Record<string, unknown>) => unknown,
  ) => selector({
    sessions: {
      'session-1': {
        isOpen: sceneMocks.teamOpen,
        selectedMemberId: null,
      },
    },
    activateBinding: sceneMocks.activateBinding,
    registerSnapshot: sceneMocks.registerSnapshot,
    open: sceneMocks.open,
    close: sceneMocks.close,
    selectMember: sceneMocks.selectMember,
  });
  return {
    TeamWorkspacePanel: () => createElement('div', { 'data-team-drag': true }),
    resolveTeamCanvasCapability: () => undefined,
    useTeamWorkspacePresentationStore,
    useActiveSessionTeamWorkspace: () => ({
      hasTeamBinding: true,
      sessionId: 'session-1',
      teamBindingKey: 'binding-1',
      snapshot: undefined,
      displayName: 'Review Team',
      presentationStatus: 'running',
    }),
  };
});

import SessionScene from './SessionScene';

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    clientY,
  });
}

describe('SessionScene Team Workspace drag lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root | null;

  const renderScene = () => {
    act(() => {
      root?.render(React.createElement(SessionScene));
    });
  };

  const getPanel = () => {
    const panel = container.querySelector<HTMLElement>('[data-testid="session-team-workspace-panel"]');
    expect(panel).toBeTruthy();
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 600, top: 100, right: 900, bottom: 600, width: 300, height: 500 }),
    });
    Object.defineProperty(panel!.parentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }),
    });
    return panel!;
  };

  beforeEach(() => {
    sceneMocks.teamOpen = true;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('cleans one active drag on pointer cancellation, blur, close, replacement, and unmount', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    renderScene();

    let panel = getPanel();
    let dragTarget = panel.querySelector<HTMLElement>('[data-team-drag]')!;

    act(() => dragTarget.dispatchEvent(pointerEvent('pointerdown', 700, 120)));
    expect(panel.getAttribute('data-dragging')).toBe('true');
    act(() => document.dispatchEvent(pointerEvent('pointermove', 750, 140)));
    const cancelledOffset = panel.style.transform;
    act(() => document.dispatchEvent(pointerEvent('pointercancel', 750, 140)));
    expect(panel.getAttribute('data-dragging')).toBeNull();
    act(() => document.dispatchEvent(pointerEvent('pointermove', 850, 240)));
    expect(panel.style.transform).toBe(cancelledOffset);

    act(() => dragTarget.dispatchEvent(pointerEvent('pointerdown', 700, 120)));
    act(() => window.dispatchEvent(new Event('blur')));
    expect(panel.getAttribute('data-dragging')).toBeNull();

    const movesAddedBeforeReplacement = addListener.mock.calls
      .filter(([type]) => type === 'pointermove').length;
    const movesRemovedBeforeReplacement = removeListener.mock.calls
      .filter(([type]) => type === 'pointermove').length;
    act(() => dragTarget.dispatchEvent(pointerEvent('pointerdown', 700, 120)));
    act(() => dragTarget.dispatchEvent(pointerEvent('pointerdown', 720, 120)));
    expect(addListener.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(
      movesAddedBeforeReplacement + 2,
    );
    expect(removeListener.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(
      movesRemovedBeforeReplacement + 1,
    );

    sceneMocks.teamOpen = false;
    renderScene();
    act(() => document.dispatchEvent(pointerEvent('pointermove', 900, 260)));
    sceneMocks.teamOpen = true;
    renderScene();
    panel = getPanel();
    expect(panel.style.transform).toBe('');

    dragTarget = panel.querySelector<HTMLElement>('[data-team-drag]')!;
    act(() => dragTarget.dispatchEvent(pointerEvent('pointerdown', 700, 120)));
    const removalsBeforeUnmount = removeListener.mock.calls
      .filter(([type]) => type === 'pointermove').length;
    act(() => root?.unmount());
    root = null;
    expect(removeListener.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(
      removalsBeforeUnmount + 1,
    );
  });
});
