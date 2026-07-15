// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowChatState } from '@/flow_chat/types/flow-chat';

const storeHarness = vi.hoisted(() => {
  let state: FlowChatState = {
    sessions: new Map(),
    activeSessionId: 'session-initial',
  };
  const listeners = new Set<() => void>();

  return {
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    setState(nextState: FlowChatState) {
      state = nextState;
      listeners.forEach(listener => listener());
    },
    reset() {
      state = {
        sessions: new Map(),
        activeSessionId: 'session-initial',
      };
      listeners.clear();
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    getState: storeHarness.getState,
    subscribe: storeHarness.subscribe,
  },
}));

import { useReviewPlatformFlowPresentation } from './useReviewPlatformFlowPresentation';

const PresentationProbe: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const state = useReviewPlatformFlowPresentation(isActive);
  return <span data-testid="active-session">{state.activeSessionId}</span>;
};

describe('Review Platform Flow Chat presentation boundary', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (isActive: boolean) => {
    act(() => {
      root.render(<PresentationProbe isActive={isActive} />);
    });
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    storeHarness.reset();
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('unsubscribes and freezes while hidden, then synchronously restores the latest snapshot', () => {
    render(true);
    expect(container.textContent).toBe('session-initial');
    expect(storeHarness.listenerCount()).toBe(1);

    render(false);
    expect(storeHarness.listenerCount()).toBe(0);

    act(() => {
      storeHarness.setState({
        sessions: new Map(),
        activeSessionId: 'session-hidden-update',
      });
    });
    expect(container.textContent).toBe('session-initial');

    render(true);
    expect(container.textContent).toBe('session-hidden-update');
    expect(storeHarness.listenerCount()).toBe(1);
  });

  it('keeps active presentation subscribed to store changes', () => {
    render(true);

    act(() => {
      storeHarness.setState({
        sessions: new Map(),
        activeSessionId: 'session-live-update',
      });
    });

    expect(container.textContent).toBe('session-live-update');
  });
});
