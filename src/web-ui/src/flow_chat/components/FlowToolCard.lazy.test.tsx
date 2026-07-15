// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowToolItem, ToolCardProps } from '../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const lazyState = vi.hoisted(() => ({
  load: vi.fn(),
}));
const recoveryState = vi.hoisted(() => ({
  reloadApplication: vi.fn(),
}));

vi.mock('../tool-cards/toolCardRegistry', () => {
  const cards = new Map<
    string,
    React.LazyExoticComponent<React.ComponentType<ToolCardProps>>
  >();

  return {
    getToolCardComponent: (toolName: string) => {
      const existing = cards.get(toolName);
      if (existing) return existing;

      const card = React.lazy(() => lazyState.load(toolName));
      cards.set(toolName, card);
      return card;
    },
  };
});

vi.mock('../tool-cards/chunkLoadRecovery', () => ({
  isChunkLoadError: (error: unknown) => (
    error instanceof Error && error.message.includes('dynamically imported module')
  ),
  reloadApplication: recoveryState.reloadApplication,
}));

vi.mock('../tool-cards/toolCardMetadata', () => ({
  getToolCardConfig: (toolName: string) => ({
    toolName,
    displayName: 'Read File',
    icon: 'R',
    requiresConfirmation: false,
    resultDisplayType: 'summary',
  }),
}));

vi.mock('../tool-cards/CompactToolCard', () => ({
  CompactToolCard: ({
    expandedContent,
    header,
    status,
  }: {
    expandedContent?: React.ReactNode;
    header: React.ReactNode;
    status: string;
  }) => (
    <div data-testid={status === 'error' ? 'tool-card-error' : 'tool-card-loading'}>
      {header}
      {expandedContent}
    </div>
  ),
  CompactToolCardHeader: ({ action, content }: { action: React.ReactNode; content: React.ReactNode }) => (
    <>{action} {content}</>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn() }),
}));

vi.mock('../utils/toolInterruption', () => ({
  getToolInterruptionNote: () => null,
}));

import { FlowToolCard } from './FlowToolCard';

const toolItem: FlowToolItem = {
  id: 'tool-1',
  type: 'tool',
  toolName: 'Read',
  status: 'running',
  timestamp: 1,
  toolCall: { id: 'call-1', input: { file_path: 'README.md' } },
};

describe('FlowToolCard lazy presentation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let resolveCard: (module: { default: React.ComponentType<ToolCardProps> }) => void;
  let preventWindowError: (event: ErrorEvent) => void;
  let windowErrorCount: number;

  beforeEach(() => {
    windowErrorCount = 0;
    preventWindowError = event => {
      windowErrorCount += 1;
      event.preventDefault();
    };
    window.addEventListener('error', preventWindowError);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    lazyState.load.mockReset();
    recoveryState.reloadApplication.mockClear();
    lazyState.load.mockReturnValue(new Promise(resolve => {
      resolveCard = resolve;
    }));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    window.removeEventListener('error', preventWindowError);
    container.remove();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('shows a stable compact fallback until the concrete card resolves', async () => {
    await act(async () => {
      root.render(<FlowToolCard toolItem={toolItem} sessionId="session-1" />);
    });

    expect(container.querySelector('[data-testid="tool-card-loading"]')?.textContent)
      .toContain('Read File Loading…');

    await act(async () => {
      resolveCard({
        default: ({ toolItem: item, sessionId }) => (
          <div data-testid="resolved-tool-card">{item.toolName}:{sessionId}</div>
        ),
      });
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="tool-card-loading"]')).toBeNull();
    expect(container.querySelector('[data-testid="resolved-tool-card"]')?.textContent)
      .toBe('Read:session-1');
    expect(lazyState.load).toHaveBeenCalledTimes(1);
  });

  it('isolates a rejected chunk and offers application reload', async () => {
    const writeItem: FlowToolItem = {
      ...toolItem,
      id: 'tool-2',
      toolName: 'Write',
      toolCall: { id: 'call-2', input: { file_path: 'retry.txt' } },
    };
    lazyState.load.mockRejectedValueOnce(
      new Error('Failed to fetch dynamically imported module'),
    );

    await act(async () => {
      root.render(<FlowToolCard toolItem={writeItem} sessionId="session-2" />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const alert = container.querySelector('[role="alert"]');
    expect(container.innerHTML).toContain('Tool card render failed');
    expect(alert).not.toBeNull();
    const reloadButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Reload application'));
    expect(reloadButton).toBeDefined();

    const errorCountBeforeStreamingUpdate = windowErrorCount;
    await act(async () => {
      root.render(
        <FlowToolCard
          toolItem={{
            ...writeItem,
            status: 'completed',
            toolResult: { success: true, result: 'late result' },
          }}
          sessionId="session-2"
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(windowErrorCount).toBe(errorCountBeforeStreamingUpdate);

    await act(async () => {
      reloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(recoveryState.reloadApplication).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(lazyState.load).toHaveBeenCalledTimes(1);
  });
});
