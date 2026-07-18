// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasTab, EditorGroupState } from '../types';

const canvasState = vi.hoisted(() => ({
  primaryGroup: null as EditorGroupState | null,
  secondaryGroup: null as EditorGroupState | null,
  tertiaryGroup: { tabs: [], activeTabId: null } as EditorGroupState,
  activeGroupId: 'primary' as const,
  layout: {
    splitMode: 'horizontal' as const,
    splitRatio: 0.5,
    splitRatio2: 0.5,
  },
  draggingTabId: null,
  draggingFromGroupId: null,
  switchToTab: vi.fn(),
  closeTab: vi.fn(),
  closeAllTabs: vi.fn(),
  promoteTab: vi.fn(),
  togglePinTab: vi.fn(),
  startDrag: vi.fn(),
  endDrag: vi.fn(),
  reorderTab: vi.fn(),
  handleDrop: vi.fn(),
  moveTabToGroup: vi.fn(),
  setSplitRatio: vi.fn(),
  setSplitRatio2: vi.fn(),
  setActiveGroup: vi.fn(),
  updateTabContent: vi.fn(),
  setTabDirty: vi.fn(),
  setTabFileDeletedFromDisk: vi.fn(),
}));

vi.mock('@/app/presentation/workspacePresentation', () => ({
  readWorkspacePresentation: () => 'minimal',
}));

vi.mock('../stores', () => ({
  useCanvasStore: () => canvasState,
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
  default: ({
    mode,
    onToggle,
    onSelectTab,
  }: {
    mode: string;
    onToggle: () => void;
    onSelectTab: (tabId: string) => void;
  }) => (
    <div data-testid="team-controls" data-mode={mode}>
      <button data-testid="team-toggle" type="button" onClick={onToggle}>
        toggle
      </button>
      <button
        data-testid="team-agent"
        type="button"
        onClick={() => onSelectTab('asset-agent')}
      >
        agent
      </button>
    </div>
  ),
}));

import { EditorArea } from './EditorArea';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const createTab = (
  id: string,
  type: CanvasTab['content']['type'],
  data: Record<string, unknown> = {},
  metadata?: Record<string, unknown>,
): CanvasTab => ({
  id,
  title: id,
  content: { type, title: id, data, metadata },
  state: 'active',
  isDirty: false,
  createdAt: 1,
  lastAccessedAt: 1,
});

const createGroup = (
  tabs: CanvasTab[],
  activeTabId = tabs[0]?.id ?? null,
): EditorGroupState => ({ tabs, activeTabId });

const centerGroup = createGroup([
  createTab('short-drama', 'short-drama-center', { workspacePath: 'C:/work' }),
]);
const mediaGroup = createGroup([
  createTab('short-drama-media', 'workspace-media-gallery', {
    workspacePath: 'C:/work',
  }),
]);
const teamGroup = createGroup([
  createTab(
    'asset-agent',
    'btw-session',
    {},
    {
      shortDramaStage: 'assets',
      shortDramaWorkspacePath: 'C:/work',
    },
  ),
  createTab(
    'script-agent',
    'btw-session',
    {},
    {
      shortDramaStage: 'script',
      shortDramaWorkspacePath: 'C:/work',
    },
  ),
]);

describe('EditorArea short-drama team presentation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    canvasState.primaryGroup = centerGroup;
    canvasState.secondaryGroup = teamGroup;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderArea = async () => {
    await act(async () => {
      root.render(<EditorArea workspacePath="C:/work" />);
      await Promise.resolve();
    });
  };

  it('opens real agent tabs without mutating the shared split ratio', async () => {
    await renderArea();

    const toggle = container.querySelector(
      '[data-testid="team-toggle"]',
    ) as HTMLButtonElement;
    act(() => toggle.click());
    expect(container.querySelector('[data-testid="team-controls"]')?.getAttribute('data-mode'))
      .toBe('open');

    const agent = container.querySelector(
      '[data-testid="team-agent"]',
    ) as HTMLButtonElement;
    act(() => agent.click());

    expect(canvasState.switchToTab).toHaveBeenCalledWith('asset-agent', 'secondary');
    expect(canvasState.setActiveGroup).toHaveBeenCalledWith('secondary');
    expect(canvasState.setSplitRatio).not.toHaveBeenCalled();
  });

  it('returns to the compact rail after leaving and revisiting a surface', async () => {
    await renderArea();
    act(() => {
      (container.querySelector('[data-testid="team-toggle"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="team-controls"]')?.getAttribute('data-mode'))
      .toBe('open');

    canvasState.primaryGroup = mediaGroup;
    await renderArea();
    expect(container.querySelector('[data-testid="team-controls"]')?.getAttribute('data-mode'))
      .toBe('rail');

    canvasState.primaryGroup = centerGroup;
    await renderArea();
    expect(container.querySelector('[data-testid="team-controls"]')?.getAttribute('data-mode'))
      .toBe('rail');
  });

  it('does not collapse an open team when real stage tabs are only reordered', async () => {
    await renderArea();
    act(() => {
      (container.querySelector('[data-testid="team-toggle"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="team-controls"]')?.getAttribute('data-mode'))
      .toBe('open');

    canvasState.secondaryGroup = createGroup([...teamGroup.tabs].reverse());
    await renderArea();
    expect(container.querySelector('[data-testid="team-controls"]')?.getAttribute('data-mode'))
      .toBe('open');
  });

  it('recovers one misplaced primary stage agent into the existing secondary team without deleting sessions', async () => {
    const misplacedScriptTab = createTab(
      'script-agent',
      'btw-session',
      {},
      {
        shortDramaStage: 'script',
        shortDramaWorkspacePath: 'C:/work',
      },
    );
    canvasState.primaryGroup = createGroup(
      [misplacedScriptTab, ...centerGroup.tabs],
      misplacedScriptTab.id,
    );
    canvasState.secondaryGroup = teamGroup;

    await renderArea();

    expect(canvasState.moveTabToGroup).toHaveBeenCalledWith(
      misplacedScriptTab.id,
      'primary',
      'secondary',
      0,
    );
    expect(canvasState.switchToTab).toHaveBeenCalledWith(
      'short-drama',
      'primary',
    );
    expect(canvasState.closeTab).not.toHaveBeenCalled();
    expect(canvasState.setSplitRatio).not.toHaveBeenCalled();
  });
});
