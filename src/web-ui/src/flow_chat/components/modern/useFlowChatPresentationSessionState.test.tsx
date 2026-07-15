// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowChatPresentationActivityProvider } from './FlowChatPresentationActivity';
import { useFlowChatPresentationSessionState } from './useFlowChatPresentationSessionState';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const lifecycleMocks = vi.hoisted(() => {
  type SessionSnapshot = {
    sessionId: string;
    error: string | null;
    status: 'active' | 'idle' | 'error';
  };

  let session: SessionSnapshot | null = {
    sessionId: 'session-1',
    error: null,
    status: 'idle',
  };
  let machineState = 'idle';
  let processingPhase: string | null = null;
  const storeListeners = new Set<() => void>();
  const machineListeners = new Set<(sessionId: string) => void>();
  const unsubscribeStore = vi.fn();
  const unsubscribeMachine = vi.fn();

  const flowChatStore = {
    getActiveSession: vi.fn(() => session),
    subscribe: vi.fn((listener: () => void) => {
      storeListeners.add(listener);
      return () => {
        storeListeners.delete(listener);
        unsubscribeStore();
      };
    }),
  };

  const machine = {
    getCurrentState: vi.fn(() => machineState),
    getContext: vi.fn(() => ({ processingPhase })),
  };

  const stateMachineManager = {
    get: vi.fn(() => machine),
    subscribeGlobal: vi.fn((listener: (sessionId: string) => void) => {
      machineListeners.add(listener);
      return () => {
        machineListeners.delete(listener);
        unsubscribeMachine();
      };
    }),
  };

  return {
    flowChatStore,
    stateMachineManager,
    unsubscribeStore,
    unsubscribeMachine,
    reset: () => {
      session = { sessionId: 'session-1', error: null, status: 'idle' };
      machineState = 'idle';
      processingPhase = null;
      storeListeners.clear();
      machineListeners.clear();
      flowChatStore.getActiveSession.mockClear();
      flowChatStore.subscribe.mockClear();
      stateMachineManager.get.mockClear();
      stateMachineManager.subscribeGlobal.mockClear();
      unsubscribeStore.mockClear();
      unsubscribeMachine.mockClear();
    },
    setLatest: (next: {
      status: SessionSnapshot['status'];
      machineState: string;
      processingPhase: string | null;
      error?: string | null;
    }) => {
      session = {
        sessionId: 'session-1',
        status: next.status,
        error: next.error ?? null,
      };
      machineState = next.machineState;
      processingPhase = next.processingPhase;
    },
    listenerCounts: () => ({
      store: storeListeners.size,
      machine: machineListeners.size,
    }),
  };
});

vi.mock('../../store/FlowChatStore', () => ({
  flowChatStore: lifecycleMocks.flowChatStore,
}));

vi.mock('../../state-machine', () => ({
  stateMachineManager: lifecycleMocks.stateMachineManager,
}));

function SessionStateConsumer() {
  const state = useFlowChatPresentationSessionState();
  return (
    <output data-testid="session-state">
      {[
        state.sessionId,
        String(state.isProcessing),
        state.processingPhase ?? 'none',
        state.error ?? 'none',
        state.status,
      ].join('|')}
    </output>
  );
}

function Harness({ isActive }: { isActive: boolean }) {
  return (
    <FlowChatPresentationActivityProvider isActive={isActive}>
      <SessionStateConsumer />
    </FlowChatPresentationActivityProvider>
  );
}

describe('useFlowChatPresentationSessionState', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    lifecycleMocks.reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('releases hidden subscriptions and refreshes from the latest business state on resume', () => {
    act(() => {
      root.render(<Harness isActive={false} />);
    });
    expect(lifecycleMocks.flowChatStore.subscribe).not.toHaveBeenCalled();
    expect(lifecycleMocks.stateMachineManager.subscribeGlobal).not.toHaveBeenCalled();
    expect(lifecycleMocks.listenerCounts()).toEqual({ store: 0, machine: 0 });

    lifecycleMocks.setLatest({
      status: 'active',
      machineState: 'processing',
      processingPhase: 'streaming',
    });

    act(() => {
      root.render(<Harness isActive />);
    });
    expect(lifecycleMocks.listenerCounts()).toEqual({ store: 1, machine: 1 });
    expect(container.querySelector('[data-testid="session-state"]')?.textContent)
      .toBe('session-1|true|streaming|none|active');

    act(() => {
      root.render(<Harness isActive={false} />);
    });
    expect(lifecycleMocks.listenerCounts()).toEqual({ store: 0, machine: 0 });
    expect(lifecycleMocks.unsubscribeStore).toHaveBeenCalledTimes(1);
    expect(lifecycleMocks.unsubscribeMachine).toHaveBeenCalledTimes(1);

    lifecycleMocks.setLatest({
      status: 'error',
      machineState: 'idle',
      processingPhase: null,
      error: 'latest error',
    });
    expect(container.querySelector('[data-testid="session-state"]')?.textContent)
      .toBe('session-1|true|streaming|none|active');

    act(() => {
      root.render(<Harness isActive />);
    });
    expect(lifecycleMocks.listenerCounts()).toEqual({ store: 1, machine: 1 });
    expect(container.querySelector('[data-testid="session-state"]')?.textContent)
      .toBe('session-1|false|none|latest error|error');
  });
});
