// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionCapabilityRailOutletProvider } from '@/app/presentation/sessionCapabilityRailOutlet';
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
  EditorGroup: ({
    groupId,
    group,
    onTabClose,
    onCloseAllTabs,
    closeAllTabsLabel,
  }: {
    groupId: string;
    group: EditorGroupState;
    onTabClose?: (tabId: string) => void;
    onCloseAllTabs?: () => void;
    closeAllTabsLabel?: string;
  }) => (
    <div
      data-testid={`editor-group-${groupId}`}
      data-tab-titles={group.tabs.map(tab => tab.title).join('|')}
    >
      {onTabClose && group.tabs[0] && (
        <button
          data-testid={`tab-close-${groupId}`}
          type="button"
          onClick={() => onTabClose(group.tabs[0]!.id)}
        >
          close tab
        </button>
      )}
      {onCloseAllTabs && (
        <button
          data-testid={`group-close-all-${groupId}`}
          aria-label={closeAllTabsLabel}
          type="button"
          onClick={onCloseAllTabs}
        >
          close
        </button>
      )}
    </div>
  ),
}));

vi.mock('./SplitHandle', () => ({
  SplitHandle: () => <div data-testid="split-handle" />,
}));

vi.mock('./ShortDramaTeamPanelControlsContainer', () => ({
  default: ({
    isExpanded,
    onToggle,
  }: {
    isExpanded?: boolean;
    onToggle: () => void;
  }) => (
    <div
      data-testid="team-controls"
      data-expanded={isExpanded ? 'true' : 'false'}
    >
      <button data-testid="team-toggle" type="button" onClick={onToggle}>
        toggle
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
    container.className = 'void-ui--minimal';
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderArea = async (props: React.ComponentProps<typeof EditorArea> = {}) => {
    await act(async () => {
      root.render(<EditorArea workspacePath="C:/work" {...props} />);
      await Promise.resolve();
    });
  };

  it('opens the shared BTW group with localized canonical tabs without mutating the split ratio', async () => {
    await renderArea();

    const toggle = container.querySelector(
      '[data-testid="team-toggle"]',
    ) as HTMLButtonElement;
    act(() => toggle.click());
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');
    expect(container.querySelector(
      '[data-testid="editor-group-secondary"]',
    )?.getAttribute('data-tab-titles')).toBe(
      'shortDrama.tabs.script AI|shortDrama.tabs.assets AI',
    );
    expect(canvasState.setSplitRatio).not.toHaveBeenCalled();
  });

  it('reopens the outer canvas without collapsing an already open team', async () => {
    const ensureCanvasExpanded = vi.fn();
    const renderWithCanvasState = async (isCanvasExpanded: boolean) => {
      await act(async () => {
        root.render(
          <SessionCapabilityRailOutletProvider
            isCanvasExpanded={isCanvasExpanded}
            ensureCanvasExpanded={ensureCanvasExpanded}
          >
            <EditorArea workspacePath="C:/work" />
          </SessionCapabilityRailOutletProvider>,
        );
        await Promise.resolve();
      });
    };

    await renderWithCanvasState(true);
    act(() => {
      (container.querySelector(
        '[data-testid="team-toggle"]',
      ) as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');

    await renderWithCanvasState(false);
    act(() => {
      (container.querySelector(
        '[data-testid="team-toggle"]',
      ) as HTMLButtonElement).click();
    });
    expect(ensureCanvasExpanded).toHaveBeenCalledOnce();

    await renderWithCanvasState(true);
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');
  });

  it('treats the short-drama team close action as a reversible collapse', async () => {
    await renderArea();

    act(() => {
      (container.querySelector('[data-testid="team-toggle"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');

    act(() => {
      (container.querySelector(
        '[data-testid="group-close-all-secondary"]',
      ) as HTMLButtonElement).click();
    });

    expect(canvasState.closeAllTabs).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="team-controls"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="team-toggle"]')).not.toBeNull();
    expect(container.querySelector(
      '[data-testid="group-close-all-secondary"]',
    )?.getAttribute('aria-label')).toBe('canvas.collapseShortDramaTeam');

    act(() => {
      (container.querySelector('[data-testid="team-toggle"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');
  });

  it('turns closing the final team tab into a reversible collapse', async () => {
    const dirtyCheck = vi.fn().mockResolvedValue(true);
    canvasState.secondaryGroup = createGroup([teamGroup.tabs[0]!]);
    await renderArea({ onTabCloseWithDirtyCheck: dirtyCheck });

    act(() => {
      (container.querySelector('[data-testid="team-toggle"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-testid="tab-close-secondary"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(dirtyCheck).not.toHaveBeenCalled();
    expect(canvasState.closeTab).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="team-controls"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="team-toggle"]')).not.toBeNull();
  });

  it('keeps normal close behavior while another team tab remains', async () => {
    const dirtyCheck = vi.fn().mockResolvedValue(true);
    await renderArea({ onTabCloseWithDirtyCheck: dirtyCheck });

    await act(async () => {
      (container.querySelector('[data-testid="tab-close-secondary"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(dirtyCheck).toHaveBeenCalledWith('script-agent', 'secondary');
  });

  it('keeps the team open when switching between the center and its media wall', async () => {
    await renderArea();
    act(() => {
      (container.querySelector('[data-testid="team-toggle"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');

    canvasState.primaryGroup = mediaGroup;
    await renderArea();
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');

    canvasState.primaryGroup = centerGroup;
    await renderArea();
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');
  });

  it('keeps the team open when switching from the browser to the media wall', async () => {
    const browserTab = createTab('browser', 'browser');
    const centerTab = centerGroup.tabs[0]!;
    const mediaTab = mediaGroup.tabs[0]!;
    canvasState.primaryGroup = createGroup(
      [browserTab, centerTab, mediaTab],
      centerTab.id,
    );
    await renderArea();
    act(() => {
      (container.querySelector('[data-testid="team-toggle"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');

    canvasState.primaryGroup = createGroup(
      [browserTab, centerTab, mediaTab],
      browserTab.id,
    );
    await renderArea();
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');

    canvasState.primaryGroup = createGroup(
      [browserTab, centerTab, mediaTab],
      mediaTab.id,
    );
    await renderArea();
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');
  });

  it('does not collapse an open team when real stage tabs are only reordered', async () => {
    await renderArea();
    act(() => {
      (container.querySelector('[data-testid="team-toggle"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');

    canvasState.secondaryGroup = createGroup([...teamGroup.tabs].reverse());
    await renderArea();
    expect(container.querySelector('[data-testid="team-controls"]')
      ?.getAttribute('data-expanded')).toBe('true');
    expect(container.querySelector(
      '[data-testid="editor-group-secondary"]',
    )?.getAttribute('data-tab-titles')).toBe(
      'shortDrama.tabs.script AI|shortDrama.tabs.assets AI',
    );
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
