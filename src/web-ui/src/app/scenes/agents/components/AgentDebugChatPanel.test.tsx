// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/flow_chat/types/flow-chat';

const composerRenderMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/flow_chat/components/LazyChatInput', () => ({
  LazyChatInput: (props: {
    sessionId?: string;
    parentSessionId?: string;
    className?: string;
    onSendMessage?: (message: string) => void;
  }) => {
    composerRenderMock(props);
    return <div data-testid="mock-debug-composer" />;
  },
}));

vi.mock('@/flow_chat', () => ({
  ScrollToBottomButton: () => <div />,
}));

vi.mock('@/flow_chat/store/modernFlowChatStore', () => ({
  sessionToVirtualItems: () => [
    { turnId: 'turn-1', type: 'user-message' },
    { turnId: 'turn-1', type: 'model-round' },
  ],
}));

vi.mock('@/flow_chat/components/modern/VirtualItemRenderer', () => ({
  VirtualItemRenderer: ({ index }: { item: unknown; index: number }) => (
    <div data-testid="virtual-item" data-index={index} />
  ),
}));

vi.mock('@/flow_chat/components/modern/ProcessingIndicator', () => ({
  ProcessingIndicator: () => <div />,
}));

vi.mock('@/flow_chat/components/modern/processingIndicatorVisibility', () => ({
  shouldReserveProcessingIndicatorSpace: () => false,
  shouldShowProcessingIndicator: () => false,
}));

vi.mock('@/flow_chat/components/modern/useExploreGroupState', () => ({
  useExploreGroupState: () => ({
    exploreGroupStates: new Map(),
    onExploreGroupToggle: vi.fn(),
    onExpandGroup: vi.fn(),
    onExpandAllInTurn: vi.fn(),
    onCollapseGroup: vi.fn(),
  }),
}));

import { AgentDebugChatPanel } from './AgentDebugChatPanel';

function createSession(): Session {
  return {
    sessionId: 'debug-session-1',
    title: 'Debug session',
    dialogTurns: [{
      id: 'turn-1',
      sessionId: 'debug-session-1',
      userMessage: { id: 'user-1', content: 'hello', timestamp: 1 },
      modelRounds: [{
        id: 'round-1',
        index: 0,
        items: [],
        isStreaming: false,
        isComplete: true,
        status: 'completed',
        startTime: 1,
      }],
      status: 'completed',
      startTime: 1,
    }],
    status: 'idle',
    config: {},
    createdAt: 1,
    lastActiveAt: 1,
    error: null,
    sessionKind: 'btw',
  } as Session;
}

describe('AgentDebugChatPanel', () => {
  let container: HTMLDivElement;
  let root: Root;
  let requestFrame: ReturnType<typeof vi.fn>;
  let cancelFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    requestFrame = vi.fn(() => 41);
    cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const renderPanel = (props: React.ComponentProps<typeof AgentDebugChatPanel>) => {
    act(() => {
      root.render(<AgentDebugChatPanel {...props} />);
    });
  };

  it('explains what the panel is for, with no status pill and no jargon', () => {
    renderPanel({
      status: 'ready',
      session: createSession(),
    });

    expect(container.querySelector('.agent-debug-chat-panel__title')?.textContent)
      .toBe('agentsOverview.debug.title');
    expect(container.querySelector('.agent-debug-chat-panel__subtitle')?.textContent)
      .toBe('agentsOverview.debug.subtitle');
    // The draft fingerprint and the status pill were developer trivia.
    expect(container.querySelector('.agent-debug-chat-panel__fingerprint')).toBeNull();
    expect(container.querySelector('.agent-debug-chat-panel__status')).toBeNull();
  });

  it('says in plain words why sending is closed when idle', () => {
    renderPanel({ status: 'idle' });

    expect(container.querySelector('[data-testid="agent-debug-chat-composer-blocked"]')?.textContent)
      .toContain('agentsOverview.debug.hint.idle');
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).toBeNull();
    expect(composerRenderMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="virtual-item"]')).toBeNull();
  });

  it('says the tryout is being prepared while creating', () => {
    renderPanel({ status: 'creating' });

    expect(container.querySelector('[data-testid="agent-debug-chat-composer-blocked"]')?.textContent)
      .toContain('agentsOverview.debug.hint.preparing');
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).toBeNull();
    expect(composerRenderMock).not.toHaveBeenCalled();
  });

  it('says it is re-preparing after the draft changed', () => {
    renderPanel({ status: 'stale', session: createSession() });

    expect(container.querySelector('[data-testid="agent-debug-chat-composer-blocked"]')?.textContent)
      .toContain('agentsOverview.debug.hint.updating');
  });

  it('offers a plain reset action once there is something to clear', () => {
    const onReset = vi.fn();
    renderPanel({ status: 'ready', session: createSession(), onReset });

    const reset = container.querySelector('[data-testid="agent-debug-chat-reset"]');
    expect(reset?.textContent).toBe('agentsOverview.debug.reset');

    act(() => {
      (reset as HTMLButtonElement).click();
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('hides the reset action when the runtime gives no reset handler', () => {
    renderPanel({ status: 'ready', session: createSession() });

    expect(container.querySelector('[data-testid="agent-debug-chat-reset"]')).toBeNull();
  });

  it('renders the conversation list and composer for a ready session', () => {
    renderPanel({
      status: 'ready',
      session: createSession(),
    });

    expect(container.querySelectorAll('[data-testid="virtual-item"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).not.toBeNull();
    expect(composerRenderMock).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'debug-session-1',
      className: 'void-chat-input--embedded',
    }));
  });

  it('keeps the stale conversation visible but blocks sending while the persona is being replaced', () => {
    renderPanel({
      status: 'stale',
      justReplaced: false,
      session: createSession(),
    });

    expect(container.querySelector('[data-testid="mock-debug-composer"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="virtual-item"]')).toHaveLength(2);
  });

  it('shows the replacement notice only after the fresh session is ready', () => {
    const onMessageSent = vi.fn();
    renderPanel({
      status: 'ready',
      justReplaced: true,
      session: createSession(),
      onMessageSent,
    });

    expect(container.querySelector('[data-testid="agent-debug-chat-stale-banner"]')?.textContent)
      .toContain('agentsOverview.debug.hint.updated');
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).not.toBeNull();

    const composerProps = composerRenderMock.mock.lastCall?.[0] as {
      onSendMessage?: (message: string) => void;
    };
    composerProps.onSendMessage?.('hello');
    expect(onMessageSent).toHaveBeenCalledTimes(1);
  });

  it('states the failure in plain words and never leaks the raw error text', () => {
    const onRetry = vi.fn();
    renderPanel({
      status: 'error',
      error: 'ENOENT spawn runtime fingerprint',
      onRetry,
    });

    expect(container.textContent).toContain('agentsOverview.debug.hint.error');
    expect(container.textContent).not.toContain('ENOENT');
    const retryButton = container.querySelector('[data-testid="agent-debug-chat-retry"]');
    expect(retryButton?.textContent).toBe('agentsOverview.debug.retry');
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).toBeNull();

    act(() => {
      (retryButton as HTMLButtonElement).click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
