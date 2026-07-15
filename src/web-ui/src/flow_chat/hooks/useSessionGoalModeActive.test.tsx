// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionGoalModeActive } from './useSessionGoalModeActive';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const storeMock = vi.hoisted(() => {
  type SessionState = { goalModeActive?: boolean };
  type StoreState = { sessions: Map<string, SessionState> };

  let state: StoreState = { sessions: new Map() };
  const listeners = new Set<() => void>();

  const store = {
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };

  return {
    store,
    reset: () => {
      state = { sessions: new Map() };
      listeners.clear();
      store.getState.mockClear();
      store.subscribe.mockClear();
    },
    setGoalModeActive: (sessionId: string, goalModeActive: boolean) => {
      state = {
        sessions: new Map(state.sessions).set(sessionId, { goalModeActive }),
      };
      listeners.forEach(listener => listener());
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('../store/FlowChatStore', () => ({
  flowChatStore: storeMock.store,
}));

function Harness({ enabled }: { enabled: boolean }) {
  const active = useSessionGoalModeActive('session-1', enabled);
  return <output data-testid="goal-mode">{String(active)}</output>;
}

describe('useSessionGoalModeActive presentation lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    storeMock.reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('captures the initial value, subscribes only while enabled, and refreshes on resume', () => {
    storeMock.setGoalModeActive('session-1', true);

    act(() => root.render(<Harness enabled={false} />));
    expect(storeMock.listenerCount()).toBe(0);
    expect(container.querySelector('[data-testid="goal-mode"]')?.textContent).toBe('true');

    act(() => root.render(<Harness enabled />));
    expect(storeMock.listenerCount()).toBe(1);
    expect(container.querySelector('[data-testid="goal-mode"]')?.textContent).toBe('true');

    act(() => storeMock.setGoalModeActive('session-1', false));
    expect(container.querySelector('[data-testid="goal-mode"]')?.textContent).toBe('false');

    act(() => root.render(<Harness enabled={false} />));
    expect(storeMock.listenerCount()).toBe(0);

    act(() => storeMock.setGoalModeActive('session-1', true));
    expect(container.querySelector('[data-testid="goal-mode"]')?.textContent).toBe('false');

    act(() => root.render(<Harness enabled />));
    expect(storeMock.listenerCount()).toBe(1);
    expect(container.querySelector('[data-testid="goal-mode"]')?.textContent).toBe('true');

    act(() => root.render(<Harness enabled={false} />));
    expect(storeMock.listenerCount()).toBe(0);
  });
});
