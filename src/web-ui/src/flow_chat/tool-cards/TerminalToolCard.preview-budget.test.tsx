import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { TerminalToolCard } from './TerminalToolCard';
import type { FlowToolItem, ToolCardConfig } from '../types/flow-chat';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  renderedTerminalOutputs: [] as Array<{ content: string; maxHeight?: number }>,
  createTerminalTab: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.code === 'number' ? `${key}:${options.code}` : key,
  }),
}));

vi.mock('../../component-library', () => ({
  DotMatrixLoader: () => <span data-testid="dot-matrix-loader" />,
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
}));

vi.mock('@/tools/terminal/components/LazyTerminalOutputRenderer', () => ({
  LazyTerminalOutputRenderer: ({ content, maxHeight }: { content: string; maxHeight?: number }) => {
    mocks.renderedTerminalOutputs.push({ content, maxHeight });
    return <pre data-testid="terminal-output-preview">{content}</pre>;
  },
}));

vi.mock('@/shared/utils/tabUtils', () => ({
  createTerminalTab: mocks.createTerminalTab,
}));

vi.mock('./BaseToolCard', () => ({
  BaseToolCard: ({
    header,
    expandedContent,
    errorContent,
    onClick,
  }: {
    header: React.ReactNode;
    expandedContent?: React.ReactNode;
    errorContent?: React.ReactNode;
    onClick?: (event: React.MouseEvent) => void;
  }) => (
    <section data-testid="base-tool-card" onClick={onClick}>
      {header}
      {expandedContent}
      {errorContent}
    </section>
  ),
  ToolCardHeader: ({
    icon,
    action,
    content,
    extra,
    statusIcon,
  }: {
    icon?: React.ReactNode;
    action?: string;
    content?: React.ReactNode;
    extra?: React.ReactNode;
    statusIcon?: React.ReactNode;
  }) => (
    <header>
      {icon}
      <span>{action}</span>
      {content}
      {extra}
      {statusIcon}
    </header>
  ),
}));

vi.mock('./CompactToolCard', () => ({
  CompactToolCard: ({
    header,
    onClick,
  }: {
    header: React.ReactNode;
    onClick?: (event: React.MouseEvent) => void;
  }) => (
    <section data-testid="compact-tool-card" onClick={onClick}>
      {header}
    </section>
  ),
  CompactToolCardHeader: ({
    icon,
    action,
    content,
    extra,
  }: {
    icon?: React.ReactNode;
    action?: string;
    content?: React.ReactNode;
    extra?: React.ReactNode;
  }) => (
    <header>
      {icon}
      <span>{action}</span>
      {content}
      {extra}
    </header>
  ),
}));

vi.mock('./ToolCardHeaderActions', () => ({
  ToolCardCopyAction: () => <button type="button">copy</button>,
  ToolCardHeaderActions: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('./ToolTimeoutIndicator', () => ({
  ToolTimeoutIndicator: () => <span data-testid="timeout-indicator" />,
}));

vi.mock('./AcpPermissionActions', () => ({
  AcpPermissionActions: () => <span data-testid="acp-permission-actions" />,
}));

const config: ToolCardConfig = {
  toolName: 'Terminal',
  displayName: 'Terminal',
  icon: 'TERMINAL',
  requiresConfirmation: false,
  resultDisplayType: 'detailed',
  displayMode: 'terminal',
};

function createTerminalToolItem(overrides: Partial<FlowToolItem>): FlowToolItem {
  return {
    id: 'terminal-tool-1',
    type: 'tool',
    toolName: 'Terminal',
    status: 'running',
    timestamp: Date.now(),
    toolCall: {
      id: 'call-terminal-1',
      input: {
        command: 'npm test',
      },
    },
    ...overrides,
  } as FlowToolItem;
}

describe('TerminalToolCard preview budget', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('ResizeObserver', undefined);

    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
    mocks.renderedTerminalOutputs.length = 0;
    mocks.createTerminalTab.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });

  it('passes a bounded live output preview to the terminal renderer', () => {
    const liveOutput = Array.from({ length: 12 }, (_, index) => `live-${index + 1}`).join('\n');
    const toolItem = createTerminalToolItem({
      status: 'running',
      _progressLogs: [liveOutput],
    } as Partial<FlowToolItem>);

    act(() => {
      root.render(<TerminalToolCard toolItem={toolItem} config={config} />);
    });

    expect(mocks.renderedTerminalOutputs).toHaveLength(1);
    expect(mocks.renderedTerminalOutputs[0].content).toBe('live-9\nlive-10\nlive-11\nlive-12');
  });

  it('passes a bounded completed result preview after expanding the completed card', () => {
    const finalOutput = Array.from({ length: 20 }, (_, index) => `final-${index + 1}`).join('\n');
    const toolItem = createTerminalToolItem({
      status: 'completed',
      toolResult: {
        success: true,
        result: {
          output: finalOutput,
          exit_code: 0,
          working_directory: 'D:/workspace/void',
          terminal_session_id: 'terminal-1',
        },
      },
    });

    act(() => {
      root.render(<TerminalToolCard toolItem={toolItem} config={config} />);
    });
    expect(mocks.renderedTerminalOutputs).toHaveLength(0);

    const compactCard = container.querySelector<HTMLElement>('[data-testid="compact-tool-card"]');
    expect(compactCard).not.toBeNull();

    act(() => {
      compactCard?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.renderedTerminalOutputs).toHaveLength(1);
    expect(mocks.renderedTerminalOutputs[0].content).toBe(
      Array.from({ length: 15 }, (_, index) => `final-${index + 6}`).join('\n')
    );
    expect(container.querySelector('button[aria-label="toolCards.terminal.openInPanel"]')).not.toBeNull();
  });
});
