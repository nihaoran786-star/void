// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowChatState } from '@/flow_chat/types/flow-chat';

const storeHarness = vi.hoisted(() => {
  let state: FlowChatState;
  const listeners = new Set<(nextState: FlowChatState) => void>();

  return {
    getState: vi.fn(() => state),
    setState: (nextState: FlowChatState) => {
      state = nextState;
    },
    subscribe: vi.fn((listener: (nextState: FlowChatState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emit: () => listeners.forEach(listener => listener(state)),
    listenerCount: () => listeners.size,
    reset: () => listeners.clear(),
  };
});

vi.mock('@/flow_chat/store/FlowChatStore', () => ({
  flowChatStore: {
    getState: storeHarness.getState,
    subscribe: storeHarness.subscribe,
  },
}));

import { useAutomationFlowChatState } from './useAutomationFlowChatState';

function createState(activeSessionId: string): FlowChatState {
  return {
    sessions: new Map(),
    activeSessionId,
  } as FlowChatState;
}

let container: HTMLDivElement;
let root: Root;
let latestState: FlowChatState | undefined;
let renderCount = 0;
let renderedSessionIds: string[] = [];

function Probe({ isActive }: { isActive: boolean }) {
  renderCount += 1;
  latestState = useAutomationFlowChatState(isActive);
  renderedSessionIds.push(latestState.activeSessionId ?? 'none');
  return null;
}

describe('useAutomationFlowChatState', () => {
  beforeEach(() => {
    storeHarness.reset();
    storeHarness.getState.mockClear();
    storeHarness.subscribe.mockClear();
    storeHarness.setState(createState('initial'));
    latestState = undefined;
    renderCount = 0;
    renderedSessionIds = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('freezes while hidden, synchronizes the latest state on activation, and pauses again', async () => {
    await act(async () => {
      root.render(<Probe isActive={false} />);
    });

    expect(storeHarness.listenerCount()).toBe(0);
    expect(latestState?.activeSessionId).toBe('initial');
    const hiddenRenderCount = renderCount;

    storeHarness.setState(createState('updated-while-hidden'));
    await act(async () => storeHarness.emit());

    expect(renderCount).toBe(hiddenRenderCount);
    expect(latestState?.activeSessionId).toBe('initial');

    storeHarness.getState.mockClear();
    const activationRenderStart = renderedSessionIds.length;
    await act(async () => {
      root.render(<Probe isActive />);
    });

    expect(storeHarness.listenerCount()).toBe(1);
    expect(storeHarness.getState).toHaveBeenCalled();
    expect(renderedSessionIds.slice(activationRenderStart)).toEqual(['updated-while-hidden']);
    expect(latestState?.activeSessionId).toBe('updated-while-hidden');

    storeHarness.setState(createState('updated-while-active'));
    await act(async () => storeHarness.emit());
    expect(latestState?.activeSessionId).toBe('updated-while-active');

    await act(async () => {
      root.render(<Probe isActive={false} />);
    });
    expect(storeHarness.listenerCount()).toBe(0);

    const pausedRenderCount = renderCount;
    storeHarness.setState(createState('second-hidden-update'));
    await act(async () => storeHarness.emit());
    expect(renderCount).toBe(pausedRenderCount);
    expect(latestState?.activeSessionId).toBe('updated-while-active');
  });
});
