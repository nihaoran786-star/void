// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const source = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/session/SessionScene.scss'),
  'utf8',
);
const tsxSource = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/session/SessionScene.tsx'),
  'utf8',
);
const capabilityRailSource = readFileSync(
  resolve(process.cwd(), 'src/app/scenes/session/SessionCapabilityRail.scss'),
  'utf8',
);

describe('SessionScene Team Workspace floating layout contract', () => {
  it('团队面板是一块 9:16 竖版悬浮面,不为会话和画布预留任何列宽', () => {
    expect(source).toMatch(
      /\.void-session-scene__team-workspace\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?aspect-ratio:\s*9 \/ 16;[\s\S]*?border:\s*1px solid var\(--workspace-border-strong, var\(--border-medium\)\);[\s\S]*?border-radius:\s*16px;[\s\S]*?box-shadow:\s*var\(--workspace-shadow-raised, var\(--shadow-xs\)\), var\(--shadow-lg\);/,
    );
    // 悬浮面板浮于场景之上,旧的第三列预留已被移除。
    expect(source).not.toMatch(/--team-workspace-column-width/);
    expect(source).not.toMatch(/padding-right:\s*clamp\(340px/);
  });

  it('点击面板外部只弱化浮层外观,不降低语义内容对比度', () => {
    const dimmedBlock = source.match(
      /\[data-dimmed='true'\]\s*\{([\s\S]*?)\}/,
    )?.[1] ?? '';

    expect(dimmedBlock).not.toContain('opacity:');
    expect(dimmedBlock).toContain(
      'border-color: var(--workspace-border-subtle, var(--border-subtle));',
    );
    expect(dimmedBlock).toContain(
      'box-shadow: var(--workspace-shadow-raised, var(--shadow-xs));',
    );
  });

  it('顶栏即拖拽区,不再有独立抓手', () => {
    expect(source).not.toMatch(/team-grabber/);
    expect(source).toMatch(/&\[data-dragging='true'\] \{[\s\S]*?cursor: grabbing;/);
    expect(tsxSource).toMatch(/closest\('\[data-team-drag\]'\)/);
    expect(tsxSource).toMatch(/onPointerDown=\{handleTeamPanelPointerDown\}/);
  });

  it('拖拽偏移被限制在场景的 8px 安全区内', () => {
    expect(tsxSource).toMatch(/const teamPanelEdgeInset = 8;/);
    expect(tsxSource).toMatch(/minDx: sceneRect\.left \+ teamPanelEdgeInset - panelRect\.left/);
    expect(tsxSource).toMatch(/maxDx: sceneRect\.right - teamPanelEdgeInset - panelRect\.right/);
    expect(tsxSource).toMatch(/Math\.min\(drag\.maxDx, Math\.max\(drag\.minDx, deltaX\)\)/);
    expect(tsxSource).toMatch(/Math\.min\(drag\.maxDy, Math\.max\(drag\.minDy, deltaY\)\)/);
  });

  it('使用中与运行中的面板只改变描边,不制造外发光', () => {
    expect(source).toMatch(
      /&:hover,[\s\S]*?&:focus-within \{[\s\S]*?border-color:\s*var\(--color-accent-400\);/,
    );
    expect(source).toMatch(
      /&:has\(\.team-workspace-panel\[data-running\]\) \{[\s\S]*?border-color:\s*var\(--color-accent-500\);/,
    );
    expect(source).not.toMatch(/0 0 32px var\(--color-accent-200\)/);
    expect(source).not.toMatch(/team-edge-breathe/);
  });

  it('能力轨道始终高于团队悬浮窗,因此用户可以关闭全部右侧内容', () => {
    expect(source).toMatch(
      /\.void-session-scene__team-workspace\s*\{[\s\S]*?z-index:\s*\$z-floating;/,
    );
    expect(capabilityRailSource).toMatch(
      /\.session-capability-rail\s*\{[\s\S]*?z-index:\s*calc\(#\{\$z-floating\} \+ 1\);/,
    );
  });
});

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
