// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { FlowChatHeader, type FlowChatHeaderProps } from './FlowChatHeader';
import { FlowChatPresentationActivityProvider } from './FlowChatPresentationActivity';
import { createReviewPlatformTab } from '@/shared/utils/tabUtils';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/component-library', () => ({
  IconButton: React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      tooltip?: string;
      variant?: string;
      size?: string;
    }
  >(({ children, tooltip: _tooltip, variant: _variant, size: _size, ...props }, ref) => (
    <button ref={ref} type="button" {...props}>{children}</button>
  )),
  Input: React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement> & {
      error?: boolean;
      inputSize?: string;
      prefix?: React.ReactNode;
      suffix?: React.ReactNode;
      variant?: string;
    }
  >(({ error: _error, inputSize: _inputSize, prefix, suffix, variant: _variant, ...props }, ref) => (
    <span>
      {prefix}
      <input ref={ref} {...props} />
      {suffix}
    </span>
  )),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/infrastructure/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => ({ currentWorkspace: { rootPath: 'C:/workspace' } }),
}));

vi.mock('@/shared/utils/tabUtils', () => ({
  createReviewPlatformTab: vi.fn(),
}));

vi.mock('./SessionFilesBadge', () => ({
  SessionFilesBadge: () => <div data-testid="session-files-badge" />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; current?: number }) => (
      options?.defaultValue ?? (typeof options?.current === 'number' ? `Turn ${options.current}` : key)
    ),
  }),
}));

describe('FlowChatHeader', () => {
  let container: HTMLDivElement;
  let root: Root;

  const createProps = (overrides: Partial<FlowChatHeaderProps> = {}): FlowChatHeaderProps => ({
    currentTurn: 1,
    totalTurns: 2,
    currentUserMessage: 'Current user message',
    visible: true,
    turns: [
      { turnId: 'turn-1', turnIndex: 1, title: 'First turn' },
      { turnId: 'turn-2', turnIndex: 2, title: 'Second turn' },
    ],
    onJumpToTurn: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const openMoreMenu = () => {
    const moreButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="flowchat-header-more-actions"]',
    );
    act(() => {
      moreButton?.click();
    });
    return moreButton;
  };

  const waitForAnimationFrame = () => new Promise<void>(
    resolve => requestAnimationFrame(() => resolve()),
  );

  it('keeps only the core header controls mounted until the more menu opens', () => {
    act(() => {
      root.render(<FlowChatHeader {...createProps()} />);
    });

    const moreButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="flowchat-header-more-actions"]',
    );
    expect(moreButton).not.toBeNull();
    expect(moreButton?.getAttribute('aria-haspopup')).toBe('menu');
    expect(moreButton?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[data-testid="flowchat-header-search"]')).toBeNull();

    openMoreMenu();

    expect(moreButton?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="flowchat-header-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="flowchat-header-turn-list"]')).not.toBeNull();
  });

  it('keeps the canvas control in flow immediately before the unobstructed more menu', () => {
    const onCanvasToggle = vi.fn();
    act(() => {
      root.render(
        <FlowChatHeader
          {...createProps({
            showCanvasToggle: true,
            isCanvasExpanded: true,
            onCanvasToggle,
          })}
        />,
      );
    });

    const canvasButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="session-aux-pane-toggle"]',
    );
    const moreButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="flowchat-header-more-actions"]',
    );

    expect(canvasButton?.getAttribute('aria-label')).toBe('layout.collapseCanvas');
    expect(canvasButton?.getAttribute('aria-expanded')).toBe('true');
    expect(canvasButton?.parentElement).toBe(moreButton?.parentElement?.parentElement);
    expect(
      canvasButton?.compareDocumentPosition(moreButton as Node)
      ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    act(() => {
      canvasButton?.click();
      moreButton?.click();
    });

    expect(onCanvasToggle).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('keeps a canvas reopen action in the header before a conversation exists', () => {
    const onCanvasToggle = vi.fn();
    act(() => {
      root.render(
        <FlowChatHeader
          {...createProps({
            visible: false,
            totalTurns: 0,
            turns: [],
            showCanvasToggle: true,
            isCanvasExpanded: false,
            onCanvasToggle,
          })}
        />,
      );
    });

    const canvasButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="session-aux-pane-toggle"]',
    );
    expect(canvasButton?.getAttribute('aria-label')).toBe('layout.expandCanvas');
    expect(canvasButton?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="flowchat-header-more-actions"]')).toBeNull();

    act(() => canvasButton?.click());
    expect(onCanvasToggle).toHaveBeenCalledOnce();
  });

  it('renders the preview-first floating chat action in the right chat header actions', () => {
    const onPreviewFirstToggle = vi.fn();

    act(() => {
      root.render(
        <FlowChatHeader
          currentTurn={1}
          totalTurns={1}
          currentUserMessage="Can you generate an image?"
          visible
          showPreviewFirstToggle
          onPreviewFirstToggle={onPreviewFirstToggle}
        />,
      );
    });

    openMoreMenu();
    const button = container.querySelector('[data-testid="flowchat-header-preview-first-toggle"]') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.closest('.flowchat-header__actions')).toBeTruthy();
    expect(button.closest('.flowchat-header__actions--left')).toBeNull();
    expect(container.querySelector('.void-session-scene__preview-first-button')).toBeNull();

    act(() => {
      button.click();
    });

    expect(onPreviewFirstToggle).toHaveBeenCalledTimes(1);
  });

  it('renders a workspace media action next to the preview-first action', () => {
    const onOpenWorkspaceMedia = vi.fn();

    act(() => {
      root.render(
        <FlowChatHeader
          currentTurn={1}
          totalTurns={1}
          currentUserMessage="Can you generate an image?"
          visible
          showPreviewFirstToggle
          onPreviewFirstToggle={vi.fn()}
          onOpenWorkspaceMedia={onOpenWorkspaceMedia}
        />,
      );
    });

    openMoreMenu();
    const previewButton = container.querySelector('[data-testid="flowchat-header-preview-first-toggle"]') as HTMLButtonElement;
    const mediaButton = container.querySelector('[data-testid="flowchat-header-workspace-media"]') as HTMLButtonElement;
    expect(previewButton).toBeTruthy();
    expect(mediaButton).toBeTruthy();
    expect(mediaButton.compareDocumentPosition(previewButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    act(() => {
      mediaButton.click();
    });

    expect(onOpenWorkspaceMedia).toHaveBeenCalledTimes(1);
  });

  it('closes the turn list as soon as a different turn selection is accepted', () => {
    const onJumpToTurn = vi.fn(() => true);

    act(() => {
      root.render(<FlowChatHeader {...createProps({ onJumpToTurn })} />);
    });

    openMoreMenu();
    const turnListButton = container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-turn-list"]');
    act(() => {
      turnListButton?.click();
    });

    const turnItems = Array.from(container.querySelectorAll<HTMLButtonElement>('.flowchat-header__turn-list-item'));
    act(() => {
      turnItems[1]?.click();
    });

    expect(onJumpToTurn).toHaveBeenCalledWith('turn-2');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes the turn list when the selected current turn is accepted', () => {
    const onJumpToTurn = vi.fn(() => true);

    act(() => {
      root.render(<FlowChatHeader {...createProps({ onJumpToTurn })} />);
    });

    openMoreMenu();
    const turnListButton = container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-turn-list"]');
    act(() => {
      turnListButton?.click();
    });

    const turnItems = Array.from(container.querySelectorAll<HTMLButtonElement>('.flowchat-header__turn-list-item'));
    act(() => {
      turnItems[0]?.click();
    });

    expect(onJumpToTurn).toHaveBeenCalledWith('turn-1');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the turn list open when the container rejects the selection', () => {
    const onJumpToTurn = vi.fn(() => false);

    act(() => {
      root.render(<FlowChatHeader {...createProps({ onJumpToTurn })} />);
    });

    openMoreMenu();
    const turnListButton = container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-turn-list"]');
    act(() => {
      turnListButton?.click();
    });

    const turnItems = Array.from(container.querySelectorAll<HTMLButtonElement>('.flowchat-header__turn-list-item'));
    act(() => {
      turnItems[1]?.click();
    });

    expect(onJumpToTurn).toHaveBeenCalledWith('turn-2');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('focuses and scrolls the active turn when the turn list opens', async () => {
    act(() => {
      root.render(<FlowChatHeader {...createProps({ currentTurn: 2 })} />);
    });

    openMoreMenu();
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-turn-list"]')?.click();
    });
    await act(waitForAnimationFrame);

    const activeTurn = container.querySelector<HTMLButtonElement>(
      '.flowchat-header__turn-list-item--active',
    );
    expect(document.activeElement).toBe(activeTurn);
    expect(activeTurn?.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
    });
  });

  it('closes the turn list with Escape and restores focus to the more trigger', async () => {
    act(() => {
      root.render(<FlowChatHeader {...createProps({ currentTurn: 2 })} />);
    });

    const moreButton = openMoreMenu();
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-turn-list"]')?.click();
    });
    await act(waitForAnimationFrame);
    expect(document.activeElement).toBe(
      container.querySelector('.flowchat-header__turn-list-item--active'),
    );

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    await act(waitForAnimationFrame);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(moreButton);
  });

  it('restores the more trigger after an accepted turn selection', async () => {
    const onJumpToTurn = vi.fn(() => true);
    act(() => {
      root.render(<FlowChatHeader {...createProps({ onJumpToTurn })} />);
    });

    const moreButton = openMoreMenu();
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-turn-list"]')?.click();
    });
    await act(waitForAnimationFrame);
    act(() => {
      container.querySelector<HTMLButtonElement>('.flowchat-header__turn-list-item')?.click();
    });
    await act(waitForAnimationFrame);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(moreButton);
  });

  it('unmounts the session files badge while hidden and restores it when active again', () => {
    const renderHeader = (isActive: boolean) => {
      root.render(
        <FlowChatPresentationActivityProvider isActive={isActive}>
          <FlowChatHeader {...createProps({ sessionId: 'session-1' })} />
        </FlowChatPresentationActivityProvider>,
      );
    };

    act(() => {
      renderHeader(true);
    });
    expect(container.querySelector('[data-testid="session-files-badge"]')).not.toBeNull();

    act(() => {
      renderHeader(false);
    });
    expect(container.querySelector('[data-testid="session-files-badge"]')).toBeNull();

    act(() => {
      renderHeader(true);
    });
    expect(container.querySelector('[data-testid="session-files-badge"]')).not.toBeNull();
  });

  it('supports keyboard navigation in the more menu and skips disabled items', () => {
    act(() => {
      root.render(
        <FlowChatHeader
          {...createProps({
            currentTurn: 1,
            onJumpToPreviousTurn: vi.fn(),
            onJumpToNextTurn: vi.fn(),
          })}
        />,
      );
    });

    openMoreMenu();
    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    const pullRequests = container.querySelector<HTMLButtonElement>(
      '[data-testid="flowchat-header-pull-requests"]',
    );
    const previous = container.querySelector<HTMLButtonElement>(
      '[data-testid="flowchat-header-turn-prev"]',
    );
    expect(previous?.disabled).toBe(true);

    act(() => {
      pullRequests?.focus();
      menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });

    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="flowchat-header-turn-next"]'),
    );
  });

  it('does not steal focus when an external pointer closes the more menu', async () => {
    act(() => {
      root.render(<FlowChatHeader {...createProps()} />);
    });

    openMoreMenu();
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    act(() => {
      outsideButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await act(waitForAnimationFrame);

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });

  it('runs PR, previous, and next callbacks and restores the more trigger', async () => {
    const onJumpToPreviousTurn = vi.fn();
    const onJumpToNextTurn = vi.fn();
    act(() => {
      root.render(
        <FlowChatHeader
          {...createProps({
            currentTurn: 2,
            totalTurns: 3,
            onJumpToPreviousTurn,
            onJumpToNextTurn,
          })}
        />,
      );
    });

    const moreButton = openMoreMenu();
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-pull-requests"]')?.click();
    });
    await act(waitForAnimationFrame);
    expect(createReviewPlatformTab).toHaveBeenCalledWith('C:/workspace');
    expect(document.activeElement).toBe(moreButton);

    openMoreMenu();
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-turn-prev"]')?.click();
    });
    await act(waitForAnimationFrame);
    expect(onJumpToPreviousTurn).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(moreButton);

    openMoreMenu();
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-turn-next"]')?.click();
    });
    await act(waitForAnimationFrame);
    expect(onJumpToNextTurn).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(moreButton);
  });

  it('only shows the background-subagent entry for active items and opens the selected item', () => {
    const onOpenBackgroundSubagent = vi.fn();
    const render = (withSubagent: boolean) => {
      root.render(
        <FlowChatHeader
          {...createProps({
            backgroundSubagents: withSubagent
              ? [{
                sessionId: 'subagent-1',
                title: 'Asset extraction',
                agentType: 'AssetAI',
                status: 'processing',
              }]
              : [],
            onOpenBackgroundSubagent,
          })}
        />,
      );
    };

    act(() => render(false));
    expect(container.querySelector('[data-testid="flowchat-header-background-subagents"]')).toBeNull();

    act(() => render(true));
    const entry = container.querySelector<HTMLButtonElement>(
      '[data-testid="flowchat-header-background-subagents"]',
    );
    expect(entry).not.toBeNull();
    act(() => entry?.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('.flowchat-header__subagent-list-item')?.click();
    });
    expect(onOpenBackgroundSubagent).toHaveBeenCalledWith('subagent-1');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes the background-subagent dialog with Escape and restores its trigger', async () => {
    act(() => {
      root.render(
        <FlowChatHeader
          {...createProps({
            backgroundSubagents: [{
              sessionId: 'subagent-1',
              title: 'Asset extraction',
              status: 'processing',
            }],
          })}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="flowchat-header-background-subagents"]',
    );
    act(() => trigger?.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await act(waitForAnimationFrame);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps click, Enter, and Space paths for jumping to the current message', () => {
    const onJumpToCurrentTurn = vi.fn();
    act(() => {
      root.render(<FlowChatHeader {...createProps({ onJumpToCurrentTurn })} />);
    });

    const message = container.querySelector<HTMLElement>('.flowchat-header__message');
    act(() => {
      message?.click();
      message?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      message?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(onJumpToCurrentTurn).toHaveBeenCalledTimes(3);
  });

  it('closes the more menu with Escape and restores focus to its trigger', async () => {
    act(() => {
      root.render(<FlowChatHeader {...createProps()} />);
    });

    const moreButton = openMoreMenu();
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(moreButton);
  });

  it('opens search from the menu and preserves Enter, Shift+Enter, and Escape behavior', () => {
    const onSearchNext = vi.fn();
    const onSearchPrev = vi.fn();
    const onSearchClose = vi.fn();

    act(() => {
      root.render(
        <FlowChatHeader
          {...createProps({
            onSearchNext,
            onSearchPrev,
            onSearchClose,
          })}
        />,
      );
    });

    openMoreMenu();
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="flowchat-header-search"]')?.click();
    });

    const input = container.querySelector<HTMLInputElement>('[role="search"] input');
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(input).not.toBeNull();

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
      }));
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onSearchNext).toHaveBeenCalledTimes(1);
    expect(onSearchPrev).toHaveBeenCalledTimes(1);
    expect(onSearchClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="search"]')).toBeNull();
  });
});
