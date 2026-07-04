// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { FlowChatHeader, type FlowChatHeaderProps } from './FlowChatHeader';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/component-library', () => ({
  IconButton: ({
    children,
    className,
    disabled,
    onClick,
    'aria-label': ariaLabel,
    'data-testid': testId,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tooltip?: string }) => (
    <button
      aria-label={ariaLabel}
      className={className}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ),
  Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
    <input ref={ref} {...props} />
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
});
