// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { FlowChatHeader } from './FlowChatHeader';

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
});
