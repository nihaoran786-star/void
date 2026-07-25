/**
 * @vitest-environment jsdom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInputWorkspaceStrip } from './ChatInputWorkspaceStrip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/component-library', () => ({
  IconButton: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/tools/git/hooks/useGitState', () => ({
  useGitState: () => ({ currentBranch: '', isRepository: false }),
}));

describe('ChatInputWorkspaceStrip permission control', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('remains visible without a workspace and changes mode from the menu', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <ChatInputWorkspaceStrip
          repositoryPath=""
          workspaceLabel=""
          permissionControl={{ mode: 'ask', saving: false, onChange }}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-input-permission-trigger"]',
    );
    expect(trigger?.dataset.permissionMode).toBe('ask');

    await act(async () => trigger?.click());
    expect(container.querySelector('[data-testid="chat-input-permission-menu"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="chat-input-permission-option-auto"]',
      )?.click();
    });
    expect(onChange).toHaveBeenCalledWith('auto');
  });

  it('disables the trigger while the persisted mode is saving', async () => {
    await act(async () => {
      root.render(
        <ChatInputWorkspaceStrip
          repositoryPath="D:/workspace/Void"
          workspaceLabel="Void"
          permissionControl={{ mode: 'full_access', saving: true, onChange: vi.fn() }}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-input-permission-trigger"]',
    );
    expect(trigger?.disabled).toBe(true);
  });

  it('shows ACP ownership without exposing native permission choices', async () => {
    await act(async () => {
      root.render(
        <ChatInputWorkspaceStrip
          repositoryPath=""
          workspaceLabel=""
          permissionControl={{ mode: 'acp', saving: false }}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-input-permission-trigger"]',
    );
    expect(trigger?.disabled).toBe(true);
    expect(trigger?.dataset.permissionMode).toBe('acp');
    expect(container.querySelector('[data-testid="chat-input-permission-menu"]')).toBeNull();
  });

  it('supports menu keyboard navigation and returns focus on Escape', async () => {
    await act(async () => {
      root.render(
        <ChatInputWorkspaceStrip
          repositoryPath=""
          workspaceLabel=""
          permissionControl={{ mode: 'ask', saving: false, onChange: vi.fn() }}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-input-permission-trigger"]',
    )!;
    trigger.focus();
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
      }));
    });
    expect(document.activeElement?.getAttribute('data-testid'))
      .toBe('chat-input-permission-option-ask');

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
      }));
    });
    expect(document.activeElement?.getAttribute('data-testid'))
      .toBe('chat-input-permission-option-auto');

    await act(async () => {
      (document.activeElement as HTMLButtonElement).click();
    });
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector('[data-testid="chat-input-permission-menu"]')).toBeNull();

    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
      }));
    });
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector('[data-testid="chat-input-permission-menu"]')).toBeNull();
  });

  it('disables permission changes when loading fails', async () => {
    await act(async () => {
      root.render(
        <ChatInputWorkspaceStrip
          repositoryPath=""
          workspaceLabel=""
          permissionControl={{
            mode: 'ask',
            status: 'failed',
            saving: false,
            onChange: vi.fn(),
          }}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-input-permission-trigger"]',
    );
    expect(trigger?.disabled).toBe(true);
    expect(trigger?.getAttribute('aria-label')).toBe('chatInput.permissionMode.loadFailed');
  });
});
