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

  it('renders the header title and the fingerprint badge (first 8 chars)', () => {
    renderPanel({
      status: 'ready',
      draftFingerprint: 'a1b2c3d4e5f6',
      session: createSession(),
    });

    expect(container.querySelector('.agent-debug-chat-panel__title')?.textContent)
      .toBe('agentsOverview.debug.title');
    expect(container.querySelector('.agent-debug-chat-panel__fingerprint')?.textContent)
      .toBe('a1b2c3d4');
    expect(container.querySelector('.agent-debug-chat-panel__status')?.textContent)
      .toBe('agentsOverview.debug.status.ready');
  });

  it('renders the empty state and no composer when idle', () => {
    renderPanel({ status: 'idle', draftFingerprint: 'a1b2c3d4' });

    expect(container.textContent).toContain('agentsOverview.debug.empty');
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).toBeNull();
    expect(composerRenderMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="virtual-item"]')).toBeNull();
  });

  it('renders the creating state and no composer while creating', () => {
    renderPanel({ status: 'creating', draftFingerprint: 'a1b2c3d4' });

    expect(container.textContent).toContain('agentsOverview.debug.creating');
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).toBeNull();
    expect(composerRenderMock).not.toHaveBeenCalled();
  });

  it('renders the conversation list and composer for a ready session', () => {
    renderPanel({
      status: 'ready',
      draftFingerprint: 'a1b2c3d4',
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
      draftFingerprint: 'a1b2c3d4',
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
      draftFingerprint: 'a1b2c3d4',
      justReplaced: true,
      session: createSession(),
      onMessageSent,
    });

    expect(container.querySelector('.agent-debug-chat-panel__stale-banner')?.textContent)
      .toContain('agentsOverview.debug.stale');
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).not.toBeNull();

    const composerProps = composerRenderMock.mock.lastCall?.[0] as {
      onSendMessage?: (message: string) => void;
    };
    composerProps.onSendMessage?.('hello');
    expect(onMessageSent).toHaveBeenCalledTimes(1);
  });

  it('renders the error message and a retry button that calls onRetry', () => {
    const onRetry = vi.fn();
    renderPanel({
      status: 'error',
      draftFingerprint: 'a1b2c3d4',
      error: 'boom',
      onRetry,
    });

    expect(container.textContent).toContain('agentsOverview.debug.error');
    const retryButton = container.querySelector('.agent-debug-chat-panel__retry-button');
    expect(retryButton?.textContent).toBe('agentsOverview.debug.retry');
    expect(container.querySelector('[data-testid="mock-debug-composer"]')).toBeNull();

    act(() => {
      (retryButton as HTMLButtonElement).click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
