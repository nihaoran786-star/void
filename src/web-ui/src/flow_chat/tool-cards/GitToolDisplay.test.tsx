import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { GitToolDisplay } from './GitToolDisplay';
import { copyTextToClipboard } from '@/shared/utils/textSelection';
import type { FlowToolItem, ToolCardConfig } from '../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('../../component-library', () => ({
  CubeLoading: () => <span data-testid="cube-loading" />,
  IconButton: ({
    children,
    tooltip,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tooltip?: React.ReactNode }) => (
    <button
      type="button"
      aria-label={typeof tooltip === 'string' ? tooltip : undefined}
      {...props}
    >
      {children}
    </button>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/shared/utils/textSelection', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/utils/textSelection')>(),
  copyTextToClipboard: vi.fn(async () => true),
}));

vi.mock('@/shared/notification-system', () => ({
  notificationService: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GitToolDisplay', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });

    vi.mocked(copyTextToClipboard).mockClear();

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });

  it('offers a header action for copying the git command', async () => {
    const toolItem: FlowToolItem = {
      id: 'tool-git-1',
      type: 'tool',
      toolName: 'Git',
      status: 'completed',
      timestamp: Date.now(),
      toolCall: {
        id: 'call-git-1',
        input: {
          operation: 'status',
          args: '--short',
        },
      },
      toolResult: {
        success: true,
        result: {
          success: true,
          exit_code: 0,
          stdout: ' M src/app.tsx',
          command: 'git status --short',
        },
      },
    };

    const config: ToolCardConfig = {
      toolName: 'Git',
      displayName: 'Git',
      icon: 'GIT',
      requiresConfirmation: false,
      resultDisplayType: 'detailed',
      description: 'Run Git commands',
      displayMode: 'compact',
    };

    act(() => {
      root.render(<GitToolDisplay toolItem={toolItem} config={config} />);
    });

    expect(container.textContent).not.toContain('Gitgit status --short');
    expect(container.textContent?.trim().startsWith('git status --short')).toBe(true);

    let activation = container.querySelector<HTMLButtonElement>(
      '.tool-card-header-activation'
    );
    expect(activation?.getAttribute('aria-label')).toBe('Expand details');
    expect(activation?.getAttribute('aria-expanded')).toBe('false');

    const copyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy git command"]'
    );
    expect(copyButton).not.toBeNull();

    await act(async () => {
      copyButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(copyTextToClipboard).toHaveBeenCalledWith('git status --short');

    act(() => activation?.click());
    activation = container.querySelector<HTMLButtonElement>(
      '.tool-card-header-activation'
    );
    expect(activation?.getAttribute('aria-label')).toBe('Collapse details');
    expect(activation?.getAttribute('aria-expanded')).toBe('true');
  });
});
